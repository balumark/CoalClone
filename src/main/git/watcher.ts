import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'

// Watches a repository's .git directory for changes and fires a debounced
// callback so the renderer can refresh (status, graph, branches) live.
//
// We watch ONLY .git (not the whole working tree): its index/refs/HEAD/logs
// change on every stage, commit, checkout, merge, stash, etc., so it covers all
// git-state transitions without walking huge working trees (node_modules, PHP
// vendor/, …). That walk was catastrophic over UNC/WSL shares, where per-file
// fs.watch throws EISDIR — so we also force polling (no fs.watch) and swallow
// watcher errors. See [[platform]]. Trade-off: purely-working-tree edits (an
// unstaged file change made outside the app) aren't auto-detected; the store
// already refreshes after its own mutations, and a manual refresh covers the rest.

export class RepoWatcher {
  private watcher: FSWatcher | null = null
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
   */
  async pause(): Promise<void> {
    this.pauseDepth++
    if (this.pauseDepth === 1 && this.watcher) {
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
      await this.watcher.close()
      this.watcher = null
    }
  }

  resume(): void {
    if (this.pauseDepth > 0) this.pauseDepth--
    if (this.pauseDepth === 0 && !this.watcher && this.repoPath) this.watch(this.repoPath)
  }

  start(repoPath: string): void {
    this.repoPath = repoPath
    this.pauseDepth = 0
    this.watch(repoPath)
  }

  private watch(repoPath: string): void {
    this.stopWatcher()
    const gitDir = path.join(repoPath, '.git')
    this.watcher = chokidar.watch(gitDir, {
      ignoreInitial: true,
      ignorePermissionErrors: true,
      // fs.watch throws EISDIR per file over UNC/WSL shares; polling avoids it and
      // stays cheap because we only watch .git minus its high-churn object store.
      usePolling: true,
      interval: 400,
      binaryInterval: 800,
      ignored: (p: string) =>
        /[\\/]\.git[\\/](objects|lfs)([\\/]|$)/.test(p) ||
        /\.lock$/.test(p) ||
        /[\\/]COMMIT_EDITMSG$/.test(p)
    })
    this.watcher.on('all', () => this.schedule())
    // Never let a watcher error (UNC quirks, races on .git rewrites) escape as an
    // unhandled promise rejection and flood the console / crash the process.
    this.watcher.on('error', () => {})
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.onChange()
    }, this.debounceMs)
  }

  private async stopWatcher(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  async stop(): Promise<void> {
    this.repoPath = null
    this.pauseDepth = 0
    await this.stopWatcher()
  }
}
