import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { simpleGit } from 'simple-git'
import { GitService } from '../src/main/git/gitService'
import type { RebaseItem } from '../src/shared/types'

// End-to-end exercise of the real git layer against a throwaway repo (no GUI).
// Verifies: open, status mapping, log parsing, graph alignment, diff (tracked +
// synthesized untracked), and the stage -> commit loop.

let dir: string
const svc = new GitService()

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-test-'))
  const g = simpleGit(dir)
  await g.init(['--initial-branch=main'])
  await g.addConfig('user.email', 'test@example.com')
  await g.addConfig('user.name', 'Test User')
  await g.addConfig('commit.gpgsign', 'false')
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello\nworld\n')
  await g.add('a.txt')
  await g.commit('first commit')
  // Leave the tree dirty: modify a tracked file + add an untracked one.
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello\nthere\n')
  await fs.writeFile(path.join(dir, 'b.txt'), 'brand new\n')
  await svc.openRepo(dir)
})

afterAll(async () => {
  svc.close()
  await fs.rm(dir, { recursive: true, force: true })
})

describe('gitService integration', () => {
  it('opens the repo and reports its name', async () => {
    const ref = await svc.openRepo(dir)
    expect(ref.name).toBe(path.basename(path.normalize(dir)))
  })

  it('maps status: 1 modified unstaged + 1 untracked', async () => {
    const s = await svc.status()
    expect(s.branch).toBe('main')
    expect(s.unstaged.find((f) => f.path === 'a.txt')?.type).toBe('modified')
    expect(s.unstaged.find((f) => f.path === 'b.txt')?.type).toBe('untracked')
    expect(s.staged).toHaveLength(0)
  })

  it('parses the log and aligns the graph 1:1', async () => {
    const snap = await svc.snapshot({ path: dir, name: 'tmp' })
    expect(snap.commits.length).toBeGreaterThanOrEqual(1)
    expect(snap.graph.length).toBe(snap.commits.length)
    expect(snap.commits[0].subject).toBe('first commit')
    expect(snap.commits[0].authorName).toBe('Test User')
    expect(snap.commits[0].parents).toHaveLength(0)
  })

  it('diffs a modified tracked file', async () => {
    const d = await svc.diffFile('a.txt', false)
    expect(d.raw).toContain('+there')
    expect(d.raw).toContain('-world')
    expect(d.additions).toBeGreaterThanOrEqual(1)
    expect(d.deletions).toBeGreaterThanOrEqual(1)
  })

  it('synthesizes a diff for an untracked file', async () => {
    const d = await svc.diffFile('b.txt', false)
    expect(d.additions).toBe(1)
    expect(d.binary).toBe(false)
    expect(d.raw).toContain('new file')
    expect(d.raw).toContain('+brand new')
  })

  it('stages files then commits, and the new commit leads the log', async () => {
    await svc.stage(['a.txt', 'b.txt'])
    const staged = await svc.status()
    expect(staged.staged).toHaveLength(2)

    await svc.commit({ message: 'second commit' })
    const log = await svc.log()
    expect(log[0].subject).toBe('second commit')
    expect(log).toHaveLength(2)
    expect(log[0].parents).toEqual([log[1].hash])

    const clean = await svc.status()
    expect(clean.isClean).toBe(true)
  })
})

describe('gitService stash', () => {
  it('saves a stash (incl. untracked), leaving the tree clean', async () => {
    await fs.writeFile(path.join(dir, 'a.txt'), 'hello\nstashed\n')
    await fs.writeFile(path.join(dir, 'c.txt'), 'untracked stash\n')

    await svc.stashSave({ message: 'wip', includeUntracked: true })

    const clean = await svc.status()
    expect(clean.isClean).toBe(true)
    const list = await svc.stashes()
    expect(list).toHaveLength(1)
    expect(list[0].message).toContain('wip')
  })

  it('pops the stash, restoring the changes and emptying the list', async () => {
    await svc.stashPop(0)

    const s = await svc.status()
    expect(s.unstaged.find((f) => f.path === 'a.txt')?.type).toBe('modified')
    expect(s.unstaged.find((f) => f.path === 'c.txt')?.type).toBe('untracked')
    expect(await svc.stashes()).toHaveLength(0)
  })

  it('drops a stash without applying it', async () => {
    await svc.stashSave({ includeUntracked: true })
    expect(await svc.stashes()).toHaveLength(1)
    // Tree is clean after the save.
    expect((await svc.status()).isClean).toBe(true)

    await svc.stashDrop(0)
    expect(await svc.stashes()).toHaveLength(0)
    // Still clean — drop discards without restoring.
    expect((await svc.status()).isClean).toBe(true)
  })
})

// Regression: a stash whose base commit is unreachable from any branch (e.g. after
// a squash/rebase) must still appear in the log — otherwise its dotted-square marker
// has no row to sit on — while the stash's internal WIP/index commits stay hidden.
describe('gitService stash base visibility', () => {
  let sdir: string
  const ssvc = new GitService()

  beforeAll(async () => {
    sdir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-stashbase-'))
    const g = simpleGit(sdir)
    await g.init(['--initial-branch=main'])
    await g.addConfig('user.email', 'test@example.com')
    await g.addConfig('user.name', 'Test User')
    await g.addConfig('commit.gpgsign', 'false')
    await fs.writeFile(path.join(sdir, 'a.txt'), 'base\n')
    await g.add('a.txt')
    await g.commit('A: root')
    await fs.writeFile(path.join(sdir, 'a.txt'), 'base\nmore\n')
    await g.add('a.txt')
    await g.commit('B: stash base') // HEAD = B
    // Stash a working change (its base is B), then move the branch back to A so B
    // is only reachable through refs/stash.
    await fs.writeFile(path.join(sdir, 'a.txt'), 'base\nmore\nwip\n')
    await ssvc.openRepo(sdir)
    await ssvc.stashSave({ includeUntracked: false })
    await g.reset(['--hard', 'HEAD~1']) // branch main now at A; B dangles off the stash
  })

  afterAll(async () => {
    ssvc.close()
    await fs.rm(sdir, { recursive: true, force: true })
  })

  it('keeps the dangling stash base in the log but hides WIP/index commits', async () => {
    const commits = await ssvc.log()
    const subjects = commits.map((c) => c.subject)
    // The base commit B is present even though main points at A.
    expect(subjects).toContain('B: stash base')
    // The stash's internal commits are not shown as history.
    expect(subjects.some((s) => /^WIP on |^index on /.test(s))).toBe(false)
    // And the stash itself is still listed, pointing at B.
    const stashes = await ssvc.stashes()
    expect(stashes).toHaveLength(1)
    expect(commits.some((c) => c.hash === stashes[0].parentHash)).toBe(true)
  })
})

describe('gitService branches', () => {
  it('renames the current branch', async () => {
    await svc.renameBranch('main', 'trunk')
    const branches = await svc.branches()
    expect(branches.find((b) => b.current)?.name).toBe('trunk')
    expect(branches.some((b) => b.name === 'main')).toBe(false)
    await svc.renameBranch('trunk', 'main') // restore for later tests
  })

  it('deletes a merged branch', async () => {
    await svc.createBranch('feature', false)
    expect((await svc.branches()).some((b) => b.name === 'feature')).toBe(true)
    await svc.deleteBranch('feature', false)
    expect((await svc.branches()).some((b) => b.name === 'feature')).toBe(false)
  })

  it('refuses to delete an unmerged branch (NOT_MERGED), then force-deletes it', async () => {
    await svc.createBranch('wip', true)
    await fs.writeFile(path.join(dir, 'wip.txt'), 'work in progress\n')
    await svc.stage(['wip.txt'])
    await svc.commit({ message: 'wip commit' })
    await svc.checkout('main')

    await expect(svc.deleteBranch('wip', false)).rejects.toMatchObject({ code: 'NOT_MERGED' })
    await svc.deleteBranch('wip', true)
    expect((await svc.branches()).some((b) => b.name === 'wip')).toBe(false)
  })
})

describe('gitService history ops', () => {
  it('merges a branch (fast-forward) into the current branch', async () => {
    await svc.createBranch('topic', true)
    await fs.writeFile(path.join(dir, 'topic.txt'), 'topic\n')
    await svc.stage(['topic.txt'])
    await svc.commit({ message: 'topic work' })
    await svc.checkout('main')

    await svc.merge('topic')
    expect((await svc.log())[0].subject).toBe('topic work')
    expect((await svc.status()).isClean).toBe(true)
  })

  it('cherry-picks a commit onto the current branch', async () => {
    await svc.createBranch('feat2', true)
    await fs.writeFile(path.join(dir, 'feat2.txt'), 'feat2\n')
    await svc.stage(['feat2.txt'])
    await svc.commit({ message: 'feat2 work' })
    const picked = (await svc.log())[0].hash
    await svc.checkout('main') // main has no feat2.txt yet

    await svc.cherryPick(picked)
    expect((await fs.readFile(path.join(dir, 'feat2.txt'), 'utf8')).trim()).toBe('feat2')
    expect((await svc.status()).isClean).toBe(true)
  })

  it('reverts a commit, undoing its changes', async () => {
    const g = simpleGit(dir)
    const head = (await g.revparse(['HEAD'])).trim() // the cherry-picked feat2 commit

    await svc.revert(head)
    expect((await g.revparse(['HEAD'])).trim()).not.toBe(head)
    await expect(fs.readFile(path.join(dir, 'feat2.txt'))).rejects.toBeDefined()
    expect((await svc.status()).isClean).toBe(true)
  })

  it('resets the branch to a parent commit (mixed)', async () => {
    const g = simpleGit(dir)
    const parent = (await g.revparse(['HEAD~1'])).trim()

    await svc.reset(parent, 'mixed')
    expect((await g.revparse(['HEAD'])).trim()).toBe(parent)
  })
})

describe('gitService conflicts', () => {
  it('detects a merge conflict, resolves "ours", and continues', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard']) // start from a clean main

    await fs.writeFile(path.join(dir, 'conflict.txt'), 'base\n')
    await svc.stage(['conflict.txt'])
    await svc.commit({ message: 'conflict base' })

    await svc.createBranch('conflict-branch', true)
    await fs.writeFile(path.join(dir, 'conflict.txt'), 'theirs\n')
    await svc.stage(['conflict.txt'])
    await svc.commit({ message: 'theirs change' })

    await svc.checkout('main')
    await fs.writeFile(path.join(dir, 'conflict.txt'), 'ours\n')
    await svc.stage(['conflict.txt'])
    await svc.commit({ message: 'ours change' })

    // Merge the divergent branch → conflict.
    await expect(svc.merge('conflict-branch')).rejects.toMatchObject({ code: 'CONFLICT' })

    const mid = await svc.status()
    expect(mid.operation).toBe('merge')
    expect(mid.unstaged.some((f) => f.path === 'conflict.txt' && f.type === 'conflicted')).toBe(true)

    await svc.resolveConflict(['conflict.txt'], 'ours')
    expect((await svc.status()).unstaged.some((f) => f.type === 'conflicted')).toBe(false)

    await svc.continueOperation()
    const done = await svc.status()
    expect(done.operation).toBe(null)
    expect(done.isClean).toBe(true)
    expect((await fs.readFile(path.join(dir, 'conflict.txt'), 'utf8')).trim()).toBe('ours')
  })

  it('builds the 3-way merge model, saves a hand-picked result, and un-resolves it', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])

    const file = 'merge-tool.txt'
    const abs = path.join(dir, file)
    // Each side edits a line the other left alone (those must auto-merge) and
    // both rewrite `middle` (that one conflicts). The `sep` lines keep the three
    // edits apart — touching edits would correctly collapse into one conflict.
    await fs.writeFile(abs, 'top\nmine\nsep1\nmiddle\nsep2\ntheirs\nbottom\n')
    await svc.stage([file])
    await svc.commit({ message: 'merge tool base' })

    await svc.createBranch('merge-tool-branch', true)
    await fs.writeFile(abs, 'top\nmine\nsep1\nTHEIR MIDDLE\nsep2\nTHEIR LINE\nbottom\n')
    await svc.stage([file])
    await svc.commit({ message: 'their edits' })

    await svc.checkout('main')
    await fs.writeFile(abs, 'top\nMY LINE\nsep1\nMY MIDDLE\nsep2\ntheirs\nbottom\n')
    await svc.stage([file])
    await svc.commit({ message: 'my edits' })

    await expect(svc.merge('merge-tool-branch')).rejects.toMatchObject({ code: 'CONFLICT' })

    const model = await svc.mergeFile(file)
    expect(model.binary).toBe(false)
    expect(model.noBase).toBe(false)
    expect(model.ours.commit).toHaveLength(7)
    expect(model.theirs.commit).toHaveLength(7)
    expect(model.segments.map((s) => s.kind)).toEqual([
      'common', // top
      'ours', // mine -> MY LINE
      'common', // sep1
      'conflict', // middle
      'common', // sep2
      'theirs', // theirs -> THEIR LINE
      'common' // bottom
    ])
    expect(model.conflicts).toBe(1)
    const conflict = model.segments[3]
    expect(conflict.base).toEqual(['middle'])
    expect(conflict.ours).toEqual(['MY MIDDLE'])
    expect(conflict.theirs).toEqual(['THEIR MIDDLE'])
    // Line offsets point at the real files, which is what the panes render.
    expect(conflict.oursStart).toBe(3)
    expect(conflict.theirsStart).toBe(3)

    // Take both sides of the conflict, keeping every auto-merged line.
    const merged = model.segments
      .flatMap((s) =>
        s.kind === 'conflict' ? [...s.ours, ...s.theirs] : s.kind === 'theirs' ? s.theirs : s.ours
      )
      .join('\n')
    await svc.saveMerge(file, `${merged}\n`, true)

    const afterSave = await svc.status()
    expect(afterSave.unstaged.some((f) => f.type === 'conflicted')).toBe(false)
    expect(afterSave.staged.some((f) => f.path === file)).toBe(true)
    expect(await fs.readFile(abs, 'utf8')).toBe(
      'top\nMY LINE\nsep1\nMY MIDDLE\nTHEIR MIDDLE\nsep2\nTHEIR LINE\nbottom\n'
    )

    // …and it can be put back into conflict for another go.
    await svc.unresolveConflict([file])
    expect((await svc.status()).unstaged.some((f) => f.path === file && f.type === 'conflicted')).toBe(
      true
    )
    expect((await svc.mergeFile(file)).conflicts).toBe(1)

    await svc.abortOperation()
  })

  it('reports a file with no conflict left as NOT_CONFLICTED', async () => {
    await simpleGit(dir).reset(['--hard'])
    await expect(svc.mergeFile('conflict.txt')).rejects.toMatchObject({ code: 'NOT_CONFLICTED' })
  })
})

describe('gitService amend', () => {
  it('amends the last commit message and folds in staged changes', async () => {
    const g = simpleGit(dir)
    await g.reset(['--hard'])
    await fs.writeFile(path.join(dir, 'amend.txt'), 'v1\n')
    await svc.stage(['amend.txt'])
    await svc.commit({ message: 'original message' })

    const before = await svc.log()
    const origHash = before[0].hash

    await fs.writeFile(path.join(dir, 'amend.txt'), 'v2\n')
    await svc.stage(['amend.txt'])
    await svc.commit({ message: 'amended message', amend: true })

    const after = await svc.log()
    expect(after).toHaveLength(before.length) // amend replaces HEAD, doesn't add
    expect(after[0].subject).toBe('amended message')
    expect(after[0].hash).not.toBe(origHash)
    expect((await fs.readFile(path.join(dir, 'amend.txt'), 'utf8')).trim()).toBe('v2')
    expect((await svc.status()).isClean).toBe(true)
  })
})

describe('gitService interactive rebase', () => {
  it('drops a middle commit via an interactive rebase', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])

    for (const n of ['ir1', 'ir2', 'ir3']) {
      await fs.writeFile(path.join(dir, `${n}.txt`), `${n}\n`)
      await svc.stage([`${n}.txt`])
      await svc.commit({ message: n })
    }

    const ir1 = (await g.revparse(['HEAD~2'])).trim()
    const items: RebaseItem[] = [
      { hash: ir1, action: 'pick' },
      { hash: (await g.revparse(['HEAD~1'])).trim(), action: 'drop' },
      { hash: (await g.revparse(['HEAD'])).trim(), action: 'pick' }
    ]

    await svc.rebaseInteractive(ir1, false, items)

    // ir2 dropped; ir1 + ir3 survive; repo clean and no op in progress.
    await expect(fs.readFile(path.join(dir, 'ir2.txt'))).rejects.toBeDefined()
    expect((await fs.readFile(path.join(dir, 'ir1.txt'), 'utf8')).trim()).toBe('ir1')
    expect((await fs.readFile(path.join(dir, 'ir3.txt'), 'utf8')).trim()).toBe('ir3')
    const log = await svc.log()
    expect(log[0].subject).toBe('ir3')
    expect(log.some((c) => c.subject === 'ir2')).toBe(false)
    const s = await svc.status()
    expect(s.operation).toBe(null)
    expect(s.isClean).toBe(true)
  })
})

describe('gitService tags & move-branch', () => {
  it('creates then deletes a tag', async () => {
    const g = simpleGit(dir)
    const head = (await g.revparse(['HEAD'])).trim()
    await svc.createTag('v-test', head)
    expect((await svc.tags()).some((t) => t.name === 'v-test')).toBe(true)
    await svc.deleteTag('v-test')
    expect((await svc.tags()).some((t) => t.name === 'v-test')).toBe(false)
  })

  it('force-moves a non-current branch to a target commit', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])
    const target = (await g.revparse(['HEAD~1'])).trim()

    await svc.createBranch('mover', false) // points at HEAD
    await svc.moveBranch('mover', target)
    expect((await g.revparse(['mover'])).trim()).toBe(target)
    await svc.deleteBranch('mover', true)
  })
})

describe('gitService submodules', () => {
  it('returns an empty list for a repo without submodules', async () => {
    const subs = await svc.submodules()
    expect(Array.isArray(subs)).toBe(true)
    expect(subs).toHaveLength(0)
    const snap = await svc.snapshot({ path: dir, name: 'tmp' })
    expect(snap.submodules).toEqual([])
  })
})

describe('gitService blame', () => {
  it('attributes each line to the commit that last changed it', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])

    await fs.writeFile(path.join(dir, 'blame.txt'), 'alpha\nbeta\n')
    await svc.stage(['blame.txt'])
    await svc.commit({ message: 'blame: base' })

    const lines = await svc.blame('blame.txt')
    expect(lines.length).toBe(2)
    expect(lines[0].content).toBe('alpha')
    expect(lines[1].content).toBe('beta')
    expect(lines[0].author).toBe('Test User')
    expect(lines[0].shortHash).not.toBe('0000000')
  })
})

describe('gitService remotes', () => {
  it('adds, updates the URL of, and removes a remote', async () => {
    await svc.addRemote('upstream', 'https://example.com/a.git')
    let list = await svc.remotes()
    expect(list.find((r) => r.name === 'upstream')?.fetchUrl).toBe('https://example.com/a.git')

    await svc.setRemoteUrl('upstream', 'https://example.com/b.git')
    list = await svc.remotes()
    expect(list.find((r) => r.name === 'upstream')?.fetchUrl).toBe('https://example.com/b.git')

    await svc.removeRemote('upstream')
    expect((await svc.remotes()).some((r) => r.name === 'upstream')).toBe(false)
  })
})

describe('gitService file history', () => {
  it('lists the commits that touched a file, newest-first', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])

    await fs.writeFile(path.join(dir, 'hist.txt'), 'one\n')
    await svc.stage(['hist.txt'])
    await svc.commit({ message: 'hist: create' })
    await fs.writeFile(path.join(dir, 'hist.txt'), 'one\ntwo\n')
    await svc.stage(['hist.txt'])
    await svc.commit({ message: 'hist: update' })

    const history = await svc.fileHistory('hist.txt')
    expect(history.length).toBeGreaterThanOrEqual(2)
    expect(history[0].subject).toBe('hist: update')
    expect(history.some((c) => c.subject === 'hist: create')).toBe(true)
  })
})

describe('gitService AI prompt sources', () => {
  it('returns an empty staged patch when the index is clean', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])
    expect(await svc.stagedPatch()).toBe('')
  })

  it('builds a staged patch with the stat header and the hunk', async () => {
    await fs.writeFile(path.join(dir, 'ai.txt'), 'alpha\n')
    await svc.stage(['ai.txt'])

    const patch = await svc.stagedPatch()
    expect(patch).toContain('ai.txt')
    expect(patch).toContain('1 insertion')
    expect(patch).toContain('+alpha')
  })

  it('builds a commit patch carrying the message, stat and hunk', async () => {
    await svc.commit({ message: 'ai: add alpha' })
    const g = simpleGit(dir)
    const head = (await g.revparse(['HEAD'])).trim()

    const patch = await svc.commitPatch(head)
    expect(patch).toContain(head)
    expect(patch).toContain('ai: add alpha')
    expect(patch).toContain('Test User <test@example.com>')
    expect(patch).toContain('+alpha')
  })
})

describe('gitService commit composer', () => {
  it('sees untracked files in the working patch and commits it in groups', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])

    await fs.writeFile(path.join(dir, 'grp-a.txt'), 'alpha\n')
    await fs.writeFile(path.join(dir, 'grp-b.txt'), 'beta\n')

    const patch = await svc.workingPatch()
    expect(patch).toContain('grp-a.txt')
    expect(patch).toContain('grp-b.txt')

    const made = await svc.commitGroups([
      { message: 'composer: add alpha', files: ['grp-a.txt'] },
      { message: 'composer: add beta', files: ['grp-b.txt'] }
    ])
    expect(made).toBe(2)

    const log = await svc.log(5)
    expect(log[0].subject).toBe('composer: add beta')
    expect(log[1].subject).toBe('composer: add alpha')
    const status = await svc.status()
    expect(status.staged).toHaveLength(0)
    expect(status.unstaged).toHaveLength(0)
  })
})

describe('gitService branch patch', () => {
  it('reports the commits and diff a branch adds on top of a base', async () => {
    const g = simpleGit(dir)
    await svc.checkout('main')
    await g.reset(['--hard'])
    await svc.createBranch('pr-branch', true)

    await fs.writeFile(path.join(dir, 'pr.txt'), 'pull request\n')
    await svc.stage(['pr.txt'])
    await svc.commit({ message: 'pr: add pr.txt' })

    const { log, patch, commits } = await svc.branchPatch('main')
    expect(commits).toBe(1)
    expect(log).toContain('pr: add pr.txt')
    expect(patch).toContain('pr.txt')
    expect(patch).toContain('+pull request')

    await svc.checkout('main')
  })
})

describe('gitService profile ssh key', () => {
  it('still runs git when the environment carries editor/askpass variables', async () => {
    // Regression for a whole class: pinning a profile key routes every call
    // through .env(), and simple-git rejects the call outright if the inherited
    // environment carries any variable git would execute (EDITOR from a shell,
    // GIT_ASKPASS injected by VS Code, …), or if GIT_SSH_COMMAND is set without
    // allowUnsafeSshCommand. Each one broke *every* git op, not just remote ones.
    const previous = { ...process.env }
    process.env.EDITOR = 'vim'
    process.env.GIT_ASKPASS = '/usr/bin/askpass'
    process.env.GIT_EXTERNAL_DIFF = 'meld'
    const g = simpleGit(dir)
    try {
      await svc.checkout('main')
      await g.reset(['--hard'])
      // A local commit never touches SSH, so the key path need not exist.
      svc.setSshKey('/nonexistent/id_ed25519')

      await fs.writeFile(path.join(dir, 'editor.txt'), 'env\n')
      await svc.stage(['editor.txt'])
      await svc.commit({ message: 'env: commit with EDITOR set' })

      expect((await svc.log(1))[0].subject).toBe('env: commit with EDITOR set')
    } finally {
      svc.setSshKey(null)
      for (const key of ['EDITOR', 'GIT_ASKPASS', 'GIT_EXTERNAL_DIFF']) {
        if (previous[key] === undefined) delete process.env[key]
        else process.env[key] = previous[key]
      }
    }
  })
})

describe('gitService clone & create', () => {
  // A second service instance so the shared `svc` keeps its open repository.
  const other = new GitService()
  let parent: string

  beforeAll(async () => {
    parent = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-new-'))
  })
  afterAll(async () => {
    other.close()
    await fs.rm(parent, { recursive: true, force: true })
  })

  it('creates an empty repository whose log is empty rather than an error', async () => {
    const ref = await other.createRepo(parent, 'fresh')
    expect(ref.name).toBe('fresh')
    // The empty-repo guard matters here: `git log` fails before the first commit.
    expect(await other.log()).toEqual([])
    expect((await other.status()).staged).toHaveLength(0)
  })

  it('refuses to create over an existing repository', async () => {
    await expect(other.createRepo(parent, 'fresh')).rejects.toThrow(/already a git repository/i)
  })

  it('clones a repository and lands its history', async () => {
    const ref = await other.clone(dir, parent, 'copy')
    expect(ref.name).toBe('copy')
    expect((await other.log(5)).length).toBeGreaterThan(0)
  })

  it('refuses to clone onto an existing path', async () => {
    await expect(other.clone(dir, parent, 'copy')).rejects.toThrow(/already exists/i)
  })

  it('initializes a folder that already has files, keeping them as untracked work', async () => {
    const plain = path.join(parent, 'plain')
    await fs.mkdir(plain, { recursive: true })
    await fs.writeFile(path.join(plain, 'notes.txt'), 'already here\n', 'utf8')

    const ref = await other.initRepo(plain)
    expect(ref.name).toBe('plain')
    const status = await other.status()
    expect(status.unstaged.map((f) => f.path)).toContain('notes.txt')
    expect(await other.log()).toEqual([])
  })

  it('refuses to initialize an existing repository, and reports a missing folder as NO_DIR', async () => {
    await expect(other.initRepo(path.join(parent, 'plain'))).rejects.toThrow(
      /already a git repository/i
    )
    await expect(other.openRepo(path.join(parent, 'nope'))).rejects.toMatchObject({
      code: 'NO_DIR'
    })
  })
})

describe('gitService signatures', () => {
  it('reports no signature and no signing key for the unsigned test repo', async () => {
    const g = simpleGit(dir)
    const head = (await g.revparse(['HEAD'])).trim()
    const sig = await svc.signatureInfo(head)
    expect(sig.kind).toBe('none')
    expect((await svc.status()).signingConfigured).toBe(false)
  })
})
