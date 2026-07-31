import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import { Check, Row, inputClass } from './SettingsDialog'
import type { AiFeatureKey, AiProvider } from '@shared/types'

// Settings > AI: the GitKraken-style panel. Global switches at the top (on/off,
// provider, API key), then one block per feature with its own model + custom
// instructions. The key is written straight through to main (encrypted with the
// OS keychain) and never comes back — we only ever learn whether one is stored.

const PROVIDERS: { key: AiProvider; label: string; keyHint: string }[] = [
  { key: 'anthropic', label: 'Anthropic', keyHint: 'console.anthropic.com → API keys' },
  { key: 'openai', label: 'OpenAI', keyHint: 'platform.openai.com → API keys' },
  { key: 'google', label: 'Google', keyHint: 'aistudio.google.com → API keys' },
  { key: 'custom', label: 'Custom (OpenAI-compatible)', keyHint: 'Whatever your endpoint expects' }
]

/** Suggestions only — the model field is free text so new ids work immediately. */
const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  anthropic: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o4-mini'],
  google: ['gemini-2.0-flash', 'gemini-2.0-pro'],
  custom: []
}

const FEATURES: { key: AiFeatureKey; title: string; what: string; hint: string }[] = [
  {
    key: 'commitMessage',
    title: 'Commit message generation',
    what: 'Reads the staged diff and fills in the summary and description in the Commit panel.',
    hint: 'e.g. "Use Conventional Commits", "Write in Hungarian", "Always mention the ticket id".'
  },
  {
    key: 'explainCommit',
    title: 'Explain commits',
    what: 'Analyses an existing commit from the history and summarises what it did.',
    hint: 'e.g. "Focus on behaviour changes", "Call out anything that touches migrations".'
  },
  {
    key: 'stashMessage',
    title: 'Stash message generation',
    what: 'Names a stash from everything currently uncommitted, before you stash it.',
    hint: 'e.g. "Prefix with the area of the code", "Write in Hungarian".'
  },
  {
    key: 'pullRequest',
    title: 'Pull request',
    what: 'Writes a PR title and markdown description from the commits on the branch.',
    hint: 'e.g. "Follow our PR template", "Always add a Testing section".'
  },
  {
    key: 'conflictResolution',
    title: 'Conflict resolution',
    what: 'Merges a conflicted file for you. The result is written but left unstaged for review.',
    hint: 'e.g. "Prefer our side for config files", "Never drop imports".'
  },
  {
    key: 'commitComposer',
    title: 'Commit composer',
    what: 'Splits everything uncommitted into a series of small, coherent commits.',
    hint: 'e.g. "Keep tests with the code they cover", "Use Conventional Commits".'
  }
]

function KeyEditor({ provider }: { provider: AiProvider }): JSX.Element {
  const status = useRepoStore((s) => s.aiStatus)
  const saveKey = useRepoStore((s) => s.saveAiKey)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  // Switching provider must not carry a half-typed key over to the next one.
  useEffect(() => setDraft(''), [provider])

  const saved = status?.saved[provider] ?? false
  const canStore = status?.encryptionAvailable !== false

  const submit = async (): Promise<void> => {
    if (!draft.trim() || busy) return
    setBusy(true)
    try {
      await saveKey(provider, draft.trim())
      setDraft('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={draft}
          disabled={!canStore}
          placeholder={saved ? '•••••••••• (stored)' : 'Paste the API key'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          className={`${inputClass} w-[240px]`}
        />
        <button
          onClick={() => void submit()}
          disabled={!draft.trim() || busy || !canStore}
          className="px-2 py-1 rounded bg-accent text-white text-[11px] hover:bg-accent-hover disabled:opacity-40"
        >
          Save
        </button>
        {saved && (
          <button
            onClick={() => void saveKey(provider, null)}
            title="Forget the stored key"
            className="px-2 py-1 rounded border border-edge text-[11px] text-bad hover:bg-bad/15"
          >
            Remove
          </button>
        )}
      </div>
      {!canStore && (
        <span className="text-[11px] text-bad">
          No OS keychain available here, so a key can&apos;t be stored safely.
        </span>
      )}
    </div>
  )
}

function FeatureBlock({
  feature
}: {
  feature: (typeof FEATURES)[number]
}): JSX.Element {
  const ai = useRepoStore((s) => s.settings.ai)
  const updateAi = useRepoStore((s) => s.updateAi)
  const cfg = ai.features[feature.key]
  // Edited locally and written on blur — a settings.json write per keystroke is
  // both wasteful and re-renders the whole tree.
  const [model, setModel] = useState(cfg.model)
  const [instructions, setInstructions] = useState(cfg.instructions)

  useEffect(() => setModel(cfg.model), [cfg.model])
  useEffect(() => setInstructions(cfg.instructions), [cfg.instructions])

  const patch = (part: { model?: string; instructions?: string }): void => {
    void updateAi({ features: { [feature.key]: part } })
  }

  const listId = `ai-models-${feature.key}`
  return (
    <div className="mt-5">
      <div className="text-[11px] uppercase tracking-wide text-txt-muted mb-1">{feature.title}</div>
      <div className="text-[11px] text-txt-muted mb-1">{feature.what}</div>
      <div className="divide-y divide-edge/50">
        <Row label="Model" hint="Empty = the provider default.">
          <input
            value={model}
            list={listId}
            placeholder="default"
            onChange={(e) => setModel(e.target.value)}
            onBlur={() => {
              if (model !== cfg.model) patch({ model })
            }}
            className={`${inputClass} w-[240px]`}
          />
          <datalist id={listId}>
            {MODEL_SUGGESTIONS[ai.provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Row>
      </div>
      <div className="mt-2">
        <div className="text-[12px] text-txt mb-1">Custom instructions</div>
        <textarea
          value={instructions}
          rows={3}
          placeholder={feature.hint}
          onChange={(e) => setInstructions(e.target.value)}
          onBlur={() => {
            if (instructions !== cfg.instructions) patch({ instructions })
          }}
          className={`${inputClass} w-full resize-y`}
        />
      </div>
    </div>
  )
}

export default function AiSection(): JSX.Element {
  const ai = useRepoStore((s) => s.settings.ai)
  const updateAi = useRepoStore((s) => s.updateAi)
  const loadAiStatus = useRepoStore((s) => s.loadAiStatus)
  const [baseUrl, setBaseUrl] = useState(ai.baseUrl)

  useEffect(() => {
    void loadAiStatus()
  }, [loadAiStatus])
  useEffect(() => setBaseUrl(ai.baseUrl), [ai.baseUrl])

  const provider = PROVIDERS.find((p) => p.key === ai.provider) ?? PROVIDERS[0]

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-edge/50">
        <Row
          label="Enable AI assistance"
          hint="Off hides every AI button; nothing is ever sent anywhere."
        >
          <Check checked={ai.enabled} onChange={(v) => void updateAi({ enabled: v })} />
        </Row>
        <Row
          label="Provider"
          hint="Requests go straight from this app to the provider you pick."
        >
          <select
            value={ai.provider}
            disabled={!ai.enabled}
            onChange={(e) => void updateAi({ provider: e.target.value as AiProvider })}
            className={`${inputClass} disabled:opacity-40`}
          >
            {PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </Row>
        {ai.provider === 'custom' && (
          <Row label="Base URL" hint="OpenAI-compatible, e.g. http://localhost:11434/v1">
            <input
              value={baseUrl}
              placeholder="https://…/v1"
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => {
                if (baseUrl !== ai.baseUrl) void updateAi({ baseUrl })
              }}
              className={`${inputClass} w-[260px]`}
            />
          </Row>
        )}
        <Row label="Provider API key" hint={`Stored encrypted by your OS — ${provider.keyHint}`}>
          <KeyEditor provider={ai.provider} />
        </Row>
      </div>

      {ai.enabled ? (
        FEATURES.map((f) => <FeatureBlock key={f.key} feature={f} />)
      ) : (
        <div className="mt-5 text-[12px] text-txt-muted">
          Turn AI assistance on to configure what it may do.
        </div>
      )}
    </div>
  )
}
