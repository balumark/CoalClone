import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { simpleGit } from 'simple-git'
import { RepoWatcher } from '../src/main/git/watcher'

// The watcher must notice changes made OUTSIDE the app: a file saved in an
// editor (working tree), a commit from a terminal (git dir), and both in a
// linked worktree, where `.git` is a file pointing elsewhere.

let dir: string
let worktree: string
let watcher: RepoWatcher | null = null

/** Resolve once the watcher fires, or reject after `ms`. */
function changed(repo: string, ms = 5000): { ready: Promise<void>; fired: Promise<void> } {
  let fire: () => void = () => {}
  const fired = new Promise<void>((resolve, reject) => {
    fire = resolve
    setTimeout(() => reject(new Error('watcher did not fire')), ms)
  })
  watcher = new RepoWatcher(50, () => fire())
  watcher.start(repo)
  // Give chokidar time to take its first stat snapshot before we change things.
  const ready = new Promise<void>((r) => setTimeout(r, 1200))
  return { ready, fired }
}

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-watch-'))
  const g = simpleGit(dir)
  await g.init(['--initial-branch=main'])
  await g.addConfig('user.email', 'test@example.com')
  await g.addConfig('user.name', 'Test User')
  await g.addConfig('commit.gpgsign', 'false')
  await fs.writeFile(path.join(dir, 'a.txt'), 'one\n')
  await g.add('a.txt')
  await g.commit('first')
  worktree = `${dir}-wt`
  await g.raw(['worktree', 'add', '-b', 'side', worktree])
})

afterEach(async () => {
  await watcher?.stop()
  watcher = null
})

afterAll(async () => {
  await fs.rm(worktree, { recursive: true, force: true })
  await fs.rm(dir, { recursive: true, force: true })
})

describe('RepoWatcher', () => {
  it('fires when a working-tree file is edited outside the app', async () => {
    const { ready, fired } = changed(dir)
    await ready
    await fs.writeFile(path.join(dir, 'a.txt'), 'edited in an editor\n')
    await expect(fired).resolves.toBeUndefined()
  })

  it('fires when git state changes (stage from a terminal)', async () => {
    const { ready, fired } = changed(dir)
    await ready
    await simpleGit(dir).add('a.txt')
    await expect(fired).resolves.toBeUndefined()
  })

  it('follows a linked worktree whose .git is a file', async () => {
    const { ready, fired } = changed(worktree)
    await ready
    await fs.writeFile(path.join(worktree, 'new.txt'), 'hi\n')
    await simpleGit(worktree).add('new.txt')
    await expect(fired).resolves.toBeUndefined()
  })
})
