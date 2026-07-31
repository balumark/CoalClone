import type {
  AiFeatureKey,
  AiSettings,
  AiSettingsPatch,
  AppSettings,
  AppSettingsPatch
} from '@shared/types'
import { getActiveSettings, setActiveSettings } from './profiles'

// User preferences. They belong to the ACTIVE PROFILE (see main/profiles.ts),
// which is where they are stored — this module owns the defaults and the merge,
// so every consumer keeps calling getSettings()/saveSettings() as before and
// automatically follows the profile switch. Unknown/missing keys fall back to
// defaults, so the file stays forward/backward compatible.
//
// NOTE: the AI provider API key is deliberately NOT here — it lives encrypted in
// userData/ai-credentials.json (see main/ai/aiService.ts).

const DEFAULT_AI: AiSettings = {
  enabled: false,
  provider: 'anthropic',
  baseUrl: '',
  features: {
    commitMessage: { model: '', instructions: '' },
    explainCommit: { model: '', instructions: '' },
    stashMessage: { model: '', instructions: '' },
    pullRequest: { model: '', instructions: '' },
    conflictResolution: { model: '', instructions: '' },
    commitComposer: { model: '', instructions: '' }
  }
}

const DEFAULTS: AppSettings = {
  accent: 'blue',
  avatars: true,
  commitLimit: 500,
  pullMode: 'ff',
  autoFetchMinutes: 0,
  reopenLastRepo: true,
  confirmDiscard: true,
  diffFormat: 'line-by-line',
  cloneDir: '',
  ai: DEFAULT_AI
}

/**
 * `ai` is the one nested branch, so a plain top-level spread would drop whatever
 * the patch (or the stored file) leaves out — including sibling features the
 * caller never touched. Merge it two levels deep instead.
 */
function mergeAi(base: AiSettings, patch?: AiSettingsPatch): AiSettings {
  const features = { ...base.features }
  for (const key of Object.keys(DEFAULT_AI.features) as AiFeatureKey[]) {
    features[key] = {
      ...DEFAULT_AI.features[key],
      ...(base.features?.[key] ?? {}),
      ...(patch?.features?.[key] ?? {})
    }
  }
  return { ...base, ...(patch ?? {}), features }
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await getActiveSettings()
  return { ...DEFAULTS, ...stored, ai: mergeAi(DEFAULT_AI, stored.ai) }
}

export async function saveSettings(patch: AppSettingsPatch): Promise<AppSettings> {
  const current = await getSettings()
  const next: AppSettings = {
    ...current,
    ...patch,
    ai: mergeAi(current.ai, patch.ai)
  }
  await setActiveSettings(next)
  return next
}
