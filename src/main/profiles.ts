import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import type { AppSettings, Profile, ProfileState } from '@shared/types'

// ---------------------------------------------------------------------------
// Profiles own everything the app does on your behalf: the SSH key git
// authenticates with, the identity commits are stamped with, and the whole
// AppSettings block. `userData/profiles.json` is the single file behind them.
//
// This module deliberately knows NOTHING about setting defaults — settings.ts
// imports this one, never the other way round, so there is no import cycle. The
// settings kept here are raw partials; merging with defaults happens there.
// ---------------------------------------------------------------------------

interface StoredProfile extends Profile {
  settings: Partial<AppSettings>
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

function emptyProfile(name: string, id: string): StoredProfile {
  return { id, name, sshKeyPath: null, gitName: '', gitEmail: '', settings: {} }
}

let cache: ProfileFile | null = null

/**
 * Read the profile file, migrating a pre-profiles `settings.json` into a
 * "Default" profile the first time. Never throws: a corrupt file just resets to
 * one empty profile rather than bricking the app.
 */
export async function readProfiles(): Promise<ProfileFile> {
  if (cache) return cache
  try {
    const parsed = JSON.parse(await fs.readFile(file(), 'utf8')) as ProfileFile
    if (Array.isArray(parsed.profiles) && parsed.profiles.length) {
      cache = {
        activeId: parsed.profiles.some((p) => p.id === parsed.activeId)
          ? parsed.activeId
          : parsed.profiles[0].id,
        profiles: parsed.profiles.map((p) => ({ ...emptyProfile(p.name, p.id), ...p }))
      }
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
    profiles: [{ ...emptyProfile('Default', 'default'), settings: legacy }]
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
    }))
  }
}

export async function getActiveProfile(): Promise<Profile> {
  const f = await readProfiles()
  const active = f.profiles.find((p) => p.id === f.activeId) ?? f.profiles[0]
  const { id, name, sshKeyPath, gitName, gitEmail } = active
  return { id, name, sshKeyPath, gitName, gitEmail }
}

/** Raw settings of the active profile — merged with defaults by settings.ts. */
export async function getActiveSettings(): Promise<Partial<AppSettings>> {
  const f = await readProfiles()
  return (f.profiles.find((p) => p.id === f.activeId) ?? f.profiles[0]).settings ?? {}
}

export async function setActiveSettings(settings: AppSettings): Promise<void> {
  const f = await readProfiles()
  await writeProfiles({
    ...f,
    profiles: f.profiles.map((p) => (p.id === f.activeId ? { ...p, settings } : p))
  })
}

/** Create or update a profile. A new profile starts from the active one's settings. */
export async function saveProfile(patch: Partial<Profile> & { id?: string }): Promise<ProfileState> {
  const f = await readProfiles()
  const existing = patch.id ? f.profiles.find((p) => p.id === patch.id) : undefined
  if (existing) {
    await writeProfiles({
      ...f,
      profiles: f.profiles.map((p) => (p.id === existing.id ? { ...p, ...patch } : p))
    })
  } else {
    const id = `p${Date.now().toString(36)}`
    const seed = f.profiles.find((p) => p.id === f.activeId)
    await writeProfiles({
      ...f,
      profiles: [
        ...f.profiles,
        { ...emptyProfile(patch.name?.trim() || 'New profile', id), ...patch, id, settings: seed?.settings ?? {} }
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
