import fs, { promises as fsp } from 'fs'
import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'

// Watches a repository and fires a debounced callback so the renderer can
// refresh (status, graph, branches) live. Two sources, because they fail in
// different places:
//
// 1. The git directory, POLLED with chokidar. Its index/refs/HEAD/logs change
//    on every stage, commit, checkout, merge, stash… so it covers every git-state
//    transition, including ones made from a terminal. Polling, not fs.watch,
//    because per-file fs.watch throws EISDIR over UNC/WSL shares; the object
//    store is skipped so the poll stays cheap. See [[platform]].
// 2. The working tree, with ONE native recursive fs.watch (ReadDirectoryChangesW
//    / FSEvents / inotify — event-driven, no tree walk). This is what notices a
//    file saved in an editor. Best effort: where the OS can't deliver events
//    (some network/WSL shares) it errors and we simply go without it — the
//    window-focus refresh in ipc/index.ts covers that case.

/** Working-tree paths whose churn never changes what the app shows. */
const TREE_IGNORED = /^(\.git|node_modules)([\\/]|$)/

export class RepoWatcher {
  private gitWatcher: FSWatcher | null = null
  private treeWatcher: fs.FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private repoPath: string | null = null
  private pauseDepth = 0

  constructor(
    private readonly debounceMs = 300,
    private readonly onChange: () => void = () => {}
  ) {}

  /**
   * Stop polling during our own git mutations. On Windows, chokidar's polling holds
   * read handles on .git/index & HEAD, which can block git from replacing those
   * files (checkout/commit/merge) — making the op crawl or hang. We pause around
   * each mutation (ref-counted for nesting) and resume after. See [[platform]].
   * The native tree watcher holds no file handles, so it keeps running; its
   * events are just dropped while paused (the action refreshes afterwards anyway).
   */
  async pause(): Promise<void> {
    this.pauseDepth++
    if (this.pauseDepth === 1 && this.gitWatcher) {
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
      await this.gitWatcher.close()
      this.gitWatcher = null
    }
  }

  resume(): void {
    if (this.pauseDepth > 0) this.pauseDepth--
    if (this.pauseDepth === 0 && !this.gitWatcher && this.repoPath) {
      void this.watchGitDir(this.repoPath)
    }
  }

  start(repoPath: string): void {
    this.repoPath = repoPath
    this.pauseDepth = 0
    void this.watchGitDir(repoPath)
    this.watchTree(repoPath)
  }

  private async watchGitDir(repoPath: string): Promise<void> {
    await this.stopGitWatcher()
    const roots = await gitDirs(repoPath)
    // Paused or stopped while the git dir was being resolved.
    if (this.repoPath !== repoPath || this.pauseDepth > 0 || this.gitWatcher) return
    this.gitWatcher = chokidar.watch(roots, {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      usePolling: true,
      interval: 400,
      binaryInterval: 800,
      ignored: (p: string) => {
        if (/\.lock$/.test(p) || /[\\/]COMMIT_EDITMSG$/.test(p)) return true
        // The object store (and LFS) churns constantly and never needs a refresh
        // of its own — a new object only matters once a ref or the index moves.
        return roots.some((root) => {
          const rel = path.relative(root, p)
          return /^(objects|lfs|modules[\\/].*[\\/]objects)([\\/]|$)/.test(rel)
        })
      }
    })
    this.gitWatcher.on('all', () => this.schedule())
    // Never let a watcher error (UNC quirks, races on .git rewrites) escape as an
    // unhandled promise rejection and flood the console / crash the process.
    this.gitWatcher.on('error', () => {})
  }

  private watchTree(repoPath: string): void {
    this.stopTreeWatcher()
    try {
      this.treeWatcher = fs.watch(repoPath, { recursive: true }, (_event, file) => {
        if (this.pauseDepth > 0) return
        // No file name means "something changed, can't say what" — refresh.
        if (file && TREE_IGNORED.test(file.toString())) return
        this.schedule()
      })
      // Unsupported share, repo deleted, too many watches… — degrade silently.
      this.treeWatcher.on('error', () => this.stopTreeWatcher())
    } catch {
      this.treeWatcher = null
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.onChange()
    }, this.debounceMs)
  }

  private async stopGitWatcher(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.gitWatcher) {
      const w = this.gitWatcher
      this.gitWatcher = null
      await w.close()
    }
  }

  private stopTreeWatcher(): void {
    try {
      this.treeWatcher?.close()
    } catch {
      // Already gone.
    }
    this.treeWatcher = null
  }

  async stop(): Promise<void> {
    this.repoPath = null
    this.pauseDepth = 0
    this.stopTreeWatcher()
    await this.stopGitWatcher()
  }
}

/**
 * The directories git state actually lives in. Usually just `<repo>/.git`, but
 * in a linked worktree or a submodule `.git` is a FILE (`gitdir: …`) pointing
 * elsewhere — and a worktree's refs live in the main repo's `commondir`.
 * Watching the `.git` file itself would see nothing, which is why such repos
 * never refreshed on their own.
 */
async function gitDirs(repoPath: string): Promise<string[]> {
  const dotGit = path.join(repoPath, '.git')
  try {
    if ((await fsp.stat(dotGit)).isDirectory()) return [dotGit]
    const m = (await fsp.readFile(dotGit, 'utf8')).match(/^gitdir:\s*(.+?)\s*$/m)
    if (!m) return [dotGit]
    const gitDir = path.resolve(repoPath, m[1])
    const dirs = [gitDir]
    try {
      const common = (await fsp.readFile(path.join(gitDir, 'commondir'), 'utf8')).trim()
      if (common) dirs.push(path.resolve(gitDir, common))
    } catch {
      // Not a worktree (e.g. a submodule) — the gitdir alone holds everything.
    }
    return dirs
  } catch {
    return [dotGit]
  }
}
