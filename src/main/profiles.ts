import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import type { AppSettings, Profile, ProfileState, ProfileWorkspace, RepoRef } from '@shared/types'

// ---------------------------------------------------------------------------
// Profiles own everything the app does on your behalf: the SSH key git
// authenticates with, the identity commits are stamped with, the whole
// AppSettings block, and the repositories you work with (the recent list and
// the open tabs). `userData/profiles.json` is the single file behind them.
//
// This module deliberately knows NOTHING about setting defaults — settings.ts
// imports this one, never the other way round, so there is no import cycle. The
// settings kept here are raw partials; merging with defaults happens there.
// ---------------------------------------------------------------------------

interface StoredProfile extends Profile {
  settings: Partial<AppSettings>
  recent: RepoRef[]
  workspace: ProfileWorkspace
}

interface ProfileFile {
  activeId: string
  profiles: StoredProfile[]
}

function file(): string {
  return path.join(app.getPath('userData'), 'profiles.json')
}

/** Where settings lived before profiles existed; migrated on first read. */
function legacySettingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

/** The app-wide recent list from before it moved into the profiles. */
function legacyRecentFile(): string {
  return path.join(app.getPath('userData'), 'recent-repos.json')
}

async function readLegacyRecent(): Promise<RepoRef[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(legacyRecentFile(), 'utf8')) as RepoRef[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function emptyProfile(name: string, id: string): StoredProfile {
  return {
    id,
    name,
    sshKeyPath: null,
    gitName: '',
    gitEmail: '',
    settings: {},
    recent: [],
    workspace: { tabs: [], active: null }
  }
}

function normalizeWorkspace(ws: Partial<ProfileWorkspace> | undefined): ProfileWorkspace {
  const tabs = Array.isArray(ws?.tabs) ? ws.tabs.filter((t) => t && typeof t.path === 'string') : []
  const active =
    typeof ws?.active === 'string' && tabs.some((t) => t.path === ws.active)
      ? ws.active
      : (tabs[0]?.path ?? null)
  return { tabs, active }
}

let cache: ProfileFile | null = null

/**
 * Read the profile file, migrating a pre-profiles `settings.json` into a
 * "Default" profile the first time. Never throws: a corrupt file just resets to
 * one empty profile rather than bricking the app.
 *
 * Profiles written before the recent list became per-profile have no `recent`
 * field; each of those inherits the old app-wide `recent-repos.json` once, so
 * nobody's project list disappears with the upgrade.
 */
export async function readProfiles(): Promise<ProfileFile> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await fs.readFile(file(), 'utf8')) as ProfileFile
    if (Array.isArray(parsed.profiles) && parsed.profiles.length) {
      const needsRecent = parsed.profiles.some((p) => !Array.isArray(p.recent))
      const legacy = needsRecent ? await readLegacyRecent() : []
      cache = {
        activeId: parsed.profiles.some((p) => p.id === parsed.activeId)
          ? parsed.activeId
          : parsed.profiles[0].id,
        profiles: parsed.profiles.map((p) => ({
          ...emptyProfile(p.name, p.id),
          ...p,
          recent: Array.isArray(p.recent) ? p.recent : legacy,
          workspace: normalizeWorkspace(p.workspace)
        }))
      }
      if (needsRecent) await writeProfiles(cache)
      return cache
    }
  } catch {
    // Falls through to the migration/first-run path below.
  }
  let legacy: Partial<AppSettings> = {}
  try {
    legacy = JSON.parse(await fs.readFile(legacySettingsFile(), 'utf8')) as Partial<AppSettings>
  } catch {
    // No previous install — start clean.
  }
  cache = {
    activeId: 'default',
    profiles: [
      { ...emptyProfile('Default', 'default'), settings: legacy, recent: await readLegacyRecent() }
    ]
  }
  await writeProfiles(cache)
  return cache
}

async function writeProfiles(next: ProfileFile): Promise<void> {
  cache = next
  try {
    await fs.writeFile(file(), JSON.stringify(next, null, 2), 'utf8')
  } catch {
    // Non-fatal — the in-memory cache still serves this session.
  }
}

function activeOf(f: ProfileFile): StoredProfile {
  return f.profiles.find((p) => p.id === f.activeId) ?? f.profiles[0]
}

/** Merge `patch` into the active profile and persist. */
async function updateActive(patch: Partial<StoredProfile>): Promise<void> {
  const f = await readProfiles()
  const id = activeOf(f).id
  await writeProfiles({
    ...f,
    profiles: f.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p))
  })
}

/** The public shape (no settings blobs) for the renderer. */
export async function getProfileState(): Promise<ProfileState> {
  const f = await readProfiles()
  return {
    activeId: f.activeId,
    profiles: f.profiles.map(({ id, name, sshKeyPath, gitName, gitEmail }) => ({
      id,
      name,
      sshKeyPath,
      gitName,
      gitEmail
    })),
    workspace: activeOf(f).workspace
  }
}

export async function getActiveProfile(): Promise<Profile> {
  const { id, name, sshKeyPath, gitName, gitEmail } = activeOf(await readProfiles())
  return { id, name, sshKeyPath, gitName, gitEmail }
}

/** Every profile id — for the stores keyed by profile that need to migrate. */
export async function getProfileIds(): Promise<string[]> {
  return (await readProfiles()).profiles.map((p) => p.id)
}

/** Raw settings of the active profile — merged with defaults by settings.ts. */
export async function getActiveSettings(): Promise<Partial<AppSettings>> {
  return activeOf(await readProfiles()).settings ?? {}
}

export async function setActiveSettings(settings: AppSettings): Promise<void> {
  await updateActive({ settings })
}

/** The active profile's recent repositories, newest first. */
export async function getActiveRecent(): Promise<RepoRef[]> {
  return activeOf(await readProfiles()).recent
}

export async function setActiveRecent(recent: RepoRef[]): Promise<void> {
  await updateActive({ recent })
}

/** Remember the active profile's open tabs (the renderer owns them; we persist). */
export async function setActiveWorkspace(workspace: ProfileWorkspace): Promise<void> {
  await updateActive({ workspace: normalizeWorkspace(workspace) })
}

/**
 * Create or update a profile. A new profile starts from the active one's
 * settings, but with no repositories — its projects are its own.
 */
export async function saveProfile(
  patch: Partial<Profile> & { id?: string }
): Promise<ProfileState> {
  const f = await readProfiles()
  const existing = patch.id ? f.profiles.find((p) => p.id === patch.id) : undefined
  if (existing) {
    await writeProfiles({
      ...f,
      profiles: f.profiles.map((p) => (p.id === existing.id ? { ...p, ...patch } : p))
    })
  } else {
    const id = `p${Date.now().toString(36)}`
    await writeProfiles({
      ...f,
      profiles: [
        ...f.profiles,
        {
          ...emptyProfile(patch.name?.trim() || 'New profile', id),
          ...patch,
          id,
          settings: activeOf(f).settings ?? {}
        }
      ]
    })
  }
  return getProfileState()
}

/** Delete a profile; the last one can't go, and deleting the active one moves it. */
export async function deleteProfile(id: string): Promise<ProfileState> {
  const f = await readProfiles()
  if (f.profiles.length <= 1) throw new Error('The last profile cannot be deleted.')
  const profiles = f.profiles.filter((p) => p.id !== id)
  await writeProfiles({
    profiles,
    activeId: f.activeId === id ? profiles[0].id : f.activeId
  })
  return getProfileState()
}

export async function activateProfile(id: string): Promise<ProfileState> {
  const f = await readProfiles()
  if (!f.profiles.some((p) => p.id === id)) throw new Error(`Unknown profile "${id}"`)
  await writeProfiles({ ...f, activeId: id })
  return getProfileState()
}
