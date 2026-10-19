import path from 'path'
import { dialog, BrowserWindow } from 'electron'
import type { RepoRef } from '@shared/types'
import { getActiveRecent, setActiveRecent } from '../profiles'

// The recent-repos list (it belongs to the ACTIVE PROFILE — see main/profiles.ts)
// and the open-folder dialog. Works for both native Windows paths (C:\...) and
// WSL paths (\\wsl.localhost\...).

const MAX_RECENT = 15

export async function getRecentRepos(): Promise<RepoRef[]> {
  return getActiveRecent()
}

export async function addRecentRepo(ref: RepoRef): Promise<void> {
  const list = await getRecentRepos()
  const filtered = list.filter((r) => path.normalize(r.path) !== path.normalize(ref.path))
  filtered.unshift(ref)
  await setActiveRecent(filtered.slice(0, MAX_RECENT))
}

/** Remove a repo from the recent list; returns the updated list. */
export async function removeRecentRepo(repoPath: string): Promise<RepoRef[]> {
  const list = await getRecentRepos()
  const filtered = list.filter((r) => path.normalize(r.path) !== path.normalize(repoPath))
  await setActiveRecent(filtered)
  return filtered
}

export async function pickRepoFolder(win: BrowserWindow | null): Promise<string | null> {
  const result = win
    ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory'] })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}
