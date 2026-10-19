import { useEffect, useState } from 'react'
import { useRepoStore } from '@renderer/store/useRepoStore'
import { Check, Row, btn, inputClass } from './SettingsDialog'
import type { AiFeatureKey, AiProvider, AiTestResult, Result } from '@shared/types'

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
          className={btn.primary}
        >
          Save
        </button>
        {saved && (
          <button
            onClick={() => void saveKey(provider, null)}
            title="Forget the stored key"
            className={btn.danger}
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

/**
 * "Test connection": one tiny real request with the saved key, the current
 * endpoint and the commit-message model. The outcome stays inline next to the
 * button (not a toast) and is cleared as soon as anything it depended on changes.
 */
function ConnectionTest(): JSX.Element {
  const ai = useRepoStore((s) => s.settings.ai)
  const status = useRepoStore((s) => s.aiStatus)
  const testAi = useRepoStore((s) => s.testAi)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result<AiTestResult> | null>(null)

  const hasKey = status?.saved[ai.provider] ?? false
  const model = ai.features.commitMessage.model
  useEffect(() => setResult(null), [ai.provider, ai.baseUrl, hasKey, model])

  const run = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      setResult(await testAi())
    } finally {
      setBusy(false)
    }
  }

  const missing = !hasKey
    ? 'Save an API key first.'
    : ai.provider === 'custom' && !ai.baseUrl.trim()
      ? 'Set the base URL first.'
      : null

  return (
    <div className="flex flex-col items-end gap-1 max-w-[340px]">
      <button
        onClick={() => void run()}
        disabled={busy || !!missing}
        title={missing ?? 'Send one tiny request to check the key, endpoint and model'}
        className="inline-flex items-center h-[30px] px-3 rounded-md border border-good/50 text-good text-[12px] hover:bg-good/10 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        {busy ? 'Testing…' : 'Test connection'}
      </button>
      {missing && !result && <span className="text-[11px] text-txt-muted">{missing}</span>}
      {result?.ok && (
        <span className="text-[11px] text-good text-right">
          ✓ Connected — {result.value.model} answered in {result.value.ms} ms
          {result.value.reply && <span className="text-txt-muted"> (“{result.value.reply}”)</span>}
        </span>
      )}
      {result && !result.ok && (
        <span className="text-[11px] text-bad text-right break-words select-text">
          ✕ {result.error}
        </span>
      )}
    </div>
  )
}

function FeatureBlock({ feature }: { feature: (typeof FEATURES)[number] }): JSX.Element {
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
      <div className="mb-2 mt-6 first:mt-0 px-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-txt-muted/90">
        {feature.title}
      </div>
      <div className="text-[11px] text-txt-muted mb-1">{feature.what}</div>
      <div className="rounded-lg border border-edge bg-base-900/40 px-4 divide-y divide-edge/60">
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
      <div className="rounded-lg border border-edge bg-base-900/40 px-4 divide-y divide-edge/60">
        <Row
          label="Enable AI assistance"
          hint="Off hides every AI button; nothing is ever sent anywhere."
        >
          <Check checked={ai.enabled} onChange={(v) => void updateAi({ enabled: v })} />
        </Row>
        <Row label="Provider" hint="Requests go straight from this app to the provider you pick.">
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
        <Row
          label="Connection"
          hint="Checks the key, the endpoint and the commit-message model with one tiny request."
        >
          <ConnectionTest />
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
