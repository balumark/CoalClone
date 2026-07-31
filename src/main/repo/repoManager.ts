import { promises as fs } from 'fs'
import path from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import type { RepoRef } from '@shared/types'

// Persists the recent-repos list to userData and provides the open-folder dialog.
// Works for both native Windows paths (C:\...) and WSL paths (\\wsl.localhost\...).

const MAX_RECENT = 15

function storeFile(): string {
  return path.join(app.getPath('userData'), 'recent-repos.json')
}

export async function getRecentRepos(): Promise<RepoRef[]> {
  try {
    const raw = await fs.readFile(storeFile(), 'utf8')
    const parsed = JSON.parse(raw) as RepoRef[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function addRecentRepo(ref: RepoRef): Promise<void> {
  const list = await getRecentRepos()
  const filtered = list.filter((r) => path.normalize(r.path) !== path.normalize(ref.path))
  filtered.unshift(ref)
  const trimmed = filtered.slice(0, MAX_RECENT)
  try {
    await fs.writeFile(storeFile(), JSON.stringify(trimmed, null, 2), 'utf8')
  } catch {
    // Non-fatal: recent list is a convenience only.
  }
}

/** Remove a repo from the recent list; returns the updated list. */
export async function removeRecentRepo(repoPath: string): Promise<RepoRef[]> {
  const list = await getRecentRepos()
  const filtered = list.filter((r) => path.normalize(r.path) !== path.normalize(repoPath))
  try {
    await fs.writeFile(storeFile(), JSON.stringify(filtered, null, 2), 'utf8')
  } catch {
    // Non-fatal: recent list is a convenience only.
  }
  return filtered
}

export async function pickRepoFolder(win: BrowserWindow | null): Promise<string | null> {
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}
