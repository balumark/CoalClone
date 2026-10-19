import { promises as fs } from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'
import Anthropic from '@anthropic-ai/sdk'
import type {
  AiCommitMessage,
  AiComposerCommit,
  AiComposerPlan,
  AiFeatureKey,
  AiKeyStatus,
  AiProvider,
  AiPullRequest,
  AiSettings,
  AiTestResult
} from '@shared/types'
import { getSettings } from '../settings'
import { getActiveProfile, getProfileIds } from '../profiles'

// ---------------------------------------------------------------------------
// All AI calls live here, the same way all git calls live in gitService. The
// renderer never sees the API key: it is written encrypted (OS keychain via
// Electron safeStorage) to userData/ai-credentials.json — one key set per
// profile — and only ever read in this process, right before a request goes out.
// ---------------------------------------------------------------------------

export class AiError extends Error {
  code: string
  constructor(message: string, code = 'AI_ERROR') {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'google', 'custom']

/** Used when a feature has no explicit model set. Any id can be typed by hand. */
const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
  custom: ''
}

const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  custom: 'the custom endpoint'
}

/** Diffs can be enormous; past this the prompt costs more than it's worth. */
const MAX_DIFF_CHARS = 60_000

// --- key storage ------------------------------------------------------------

/** One profile's keys, by provider. */
type KeyFile = Partial<Record<AiProvider, string>>
/** Keys are stored per profile (like the host tokens): switching profile switches keys. */
type KeyStore = Record<string, KeyFile>

function keyFilePath(): string {
  return path.join(app.getPath('userData'), 'ai-credentials.json')
}

async function readKeyStore(): Promise<KeyStore> {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(await fs.readFile(keyFilePath(), 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
  // Before profiles owned the keys the file was one flat provider → key map.
  // Every existing profile inherits it, then each can diverge.
  if (Object.keys(raw).some((k) => (PROVIDERS as string[]).includes(k))) {
    const legacy = raw as KeyFile
    const migrated: KeyStore = {}
    for (const id of await getProfileIds()) migrated[id] = { ...legacy }
    await fs.writeFile(keyFilePath(), JSON.stringify(migrated, null, 2), 'utf8')
    return migrated
  }
  return raw as KeyStore
}

/** The active profile's keys. */
async function readKeyFile(): Promise<KeyFile> {
  const profile = await getActiveProfile()
  return (await readKeyStore())[profile.id] ?? {}
}

export async function aiStatus(): Promise<AiKeyStatus> {
  const stored = await readKeyFile()
  const saved = {} as Record<AiProvider, boolean>
  for (const p of PROVIDERS) saved[p] = typeof stored[p] === 'string' && stored[p]!.length > 0
  return { saved, encryptionAvailable: safeStorage.isEncryptionAvailable() }
}

/** Store (or clear, with `null`) the active profile's key for one provider. Never returns it. */
export async function setAiKey(provider: AiProvider, key: string | null): Promise<AiKeyStatus> {
  if (!PROVIDERS.includes(provider)) throw new AiError(`Unknown provider "${provider}"`)
  const profile = await getActiveProfile()
  const all = await readKeyStore()
  const stored = { ...(all[profile.id] ?? {}) }
  if (key && key.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      // Refuse rather than fall back to a plaintext file on disk.
      throw new AiError(
        'This system has no available keychain, so the API key cannot be stored safely.',
        'AI_NO_KEYCHAIN'
      )
    }
    stored[provider] = safeStorage.encryptString(key.trim()).toString('base64')
  } else {
    delete stored[provider]
  }
  await fs.writeFile(
    keyFilePath(),
    JSON.stringify({ ...all, [profile.id]: stored }, null, 2),
    'utf8'
  )
  return aiStatus()
}

async function readKey(provider: AiProvider): Promise<string> {
  const stored = await readKeyFile()
  const blob = stored[provider]
  if (!blob) {
    throw new AiError(
      `No API key saved for ${PROVIDER_LABEL[provider]} — add one in Settings → AI.`,
      'AI_NO_KEY'
    )
  }
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'))
  } catch {
    throw new AiError(
      'The saved API key could not be decrypted (was it stored by another user account?). Re-enter it in Settings → AI.',
      'AI_BAD_KEY'
    )
  }
}

// --- request plumbing -------------------------------------------------------

interface Prompt {
  system: string
  user: string
  maxTokens: number
}

async function activeConfig(feature: AiFeatureKey): Promise<{
  ai: AiSettings
  model: string
  instructions: string
}> {
  const { ai } = await getSettings()
  if (!ai.enabled)
    throw new AiError('AI features are switched off in Settings → AI.', 'AI_DISABLED')
  const cfg = ai.features[feature]
  const model = (cfg.model || DEFAULT_MODEL[ai.provider]).trim()
  if (!model) {
    throw new AiError(
      'No model configured for this feature — set one in Settings → AI.',
      'AI_NO_MODEL'
    )
  }
  return { ai, model, instructions: cfg.instructions.trim() }
}

/** Send one prompt to whichever provider is configured and return the text. */
async function complete(feature: AiFeatureKey, prompt: Prompt): Promise<string> {
  const { ai, model, instructions } = await activeConfig(feature)
  const key = await readKey(ai.provider)
  const system = instructions
    ? `${prompt.system}\n\nAdditional instructions from the user:\n${instructions}`
    : prompt.system

  const trimmed = (await send(ai, key, model, system, prompt)).trim()
  if (!trimmed) throw new AiError('The model returned an empty response.', 'AI_EMPTY')
  return trimmed
}

/** Route one prompt to the configured provider's API. */
function send(
  ai: AiSettings,
  key: string,
  model: string,
  system: string,
  prompt: Prompt
): Promise<string> {
  return ai.provider === 'anthropic'
    ? callAnthropic(key, model, system, prompt)
    : ai.provider === 'google'
      ? callGoogle(key, model, system, prompt)
      : callOpenAiCompatible(ai, key, model, system, prompt)
}

/**
 * Settings → AI "Test connection": one tiny real request through exactly the
 * path the features use, so it proves the key, the endpoint AND the model id
 * (a model listing would not catch a mistyped model). Uses the commit-message
 * feature's model, falling back to the provider default. Works while AI is
 * still switched off, so it can be checked before turning it on.
 */
export async function testAiConnection(): Promise<AiTestResult> {
  const { ai } = await getSettings()
  const model = (ai.features.commitMessage.model || DEFAULT_MODEL[ai.provider]).trim()
  if (!model) {
    throw new AiError(
      'No model configured — set one under Commit message generation.',
      'AI_NO_MODEL'
    )
  }
  const key = await readKey(ai.provider)
  const started = Date.now()
  const reply = await send(ai, key, model, 'You are a connectivity check for a git client.', {
    system: '',
    user: 'Reply with the single word: OK',
    maxTokens: 16
  })
  return {
    provider: ai.provider,
    model,
    ms: Date.now() - started,
    reply: reply.trim().replace(/\s+/g, ' ').slice(0, 80)
  }
}

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  prompt: Prompt
): Promise<string> {
  const client = new Anthropic({ apiKey })
  try {
    // No `thinking`/`output_config` on purpose: the model id is user-editable and
    // those parameters are rejected by some older models.
    const res = await client.messages.create({
      model,
      max_tokens: prompt.maxTokens,
      system,
      messages: [{ role: 'user', content: prompt.user }]
    })
    // Safety classifiers can decline with a normal 200 — check before reading text.
    if (res.stop_reason === 'refusal') {
      throw new AiError('The model declined to answer this request.', 'AI_REFUSED')
    }
    return res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  } catch (e) {
    if (e instanceof AiError) throw e
    if (e instanceof Anthropic.AuthenticationError) {
      throw new AiError('Anthropic rejected the API key.', 'AI_BAD_KEY')
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new AiError('Anthropic rate limit reached — try again in a moment.', 'AI_RATE_LIMIT')
    }
    if (e instanceof Anthropic.APIError) {
      throw new AiError(`Anthropic error ${e.status ?? ''}: ${e.message}`.trim())
    }
    throw new AiError(e instanceof Error ? e.message : String(e))
  }
}

/** OpenAI and any OpenAI-compatible endpoint (Azure gateways, Ollama, LM Studio…). */
async function callOpenAiCompatible(
  ai: AiSettings,
  apiKey: string,
  model: string,
  system: string,
  prompt: Prompt
): Promise<string> {
  const base = (ai.provider === 'custom' ? ai.baseUrl : 'https://api.openai.com/v1').replace(
    /\/+$/,
    ''
  )
  if (!base) throw new AiError('Set the custom base URL in Settings → AI.', 'AI_NO_BASE_URL')
  // No max_tokens: newer OpenAI models reject it in favour of max_completion_tokens.
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt.user }
    ]
  }
  const json = await postJson(`${base}/chat/completions`, body, {
    Authorization: `Bearer ${apiKey}`
  })
  const choice = (json as { choices?: { message?: { content?: string } }[] }).choices?.[0]
  return choice?.message?.content ?? ''
}

async function callGoogle(
  apiKey: string,
  model: string,
  system: string,
  prompt: Prompt
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt.user }] }]
  }
  const json = await postJson(url, body, { 'x-goog-api-key': apiKey })
  const parts =
    (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]
      ?.content?.parts ?? []
  return parts.map((p) => p.text ?? '').join('')
}

/** Shared JSON POST with a timeout and a readable error for non-2xx replies. */
async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new AiError(
      controller.signal.aborted
        ? 'The AI request timed out.'
        : `Could not reach the AI provider: ${msg}`,
      'AI_NETWORK'
    )
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  if (!res.ok) {
    // Providers put the useful part in {error:{message}}; fall back to the raw body.
    let detail = text.slice(0, 300)
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      if (parsed.error?.message) detail = parsed.error.message
    } catch {
      // keep the raw text
    }
    const code = res.status === 401 || res.status === 403 ? 'AI_BAD_KEY' : 'AI_ERROR'
    throw new AiError(`AI provider error ${res.status}: ${detail}`, code)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AiError('The AI provider returned a response that was not JSON.')
  }
}

// --- prompts ----------------------------------------------------------------

function clip(diff: string): string {
  if (diff.length <= MAX_DIFF_CHARS) return diff
  return `${diff.slice(0, MAX_DIFF_CHARS)}\n\n[diff truncated — ${diff.length - MAX_DIFF_CHARS} more characters]`
}

const COMMIT_SYSTEM = [
  'You write git commit messages for a developer, from the staged diff they give you.',
  'Answer with the message and nothing else: no preamble, no markdown fences, no quotes.',
  'Line 1 is the subject: imperative mood, at most 72 characters, no trailing period.',
  'Then a blank line, then a body — always write one, even for a small change.',
  'The body is one to four short "- " bullet points (or two short sentences) covering what',
  'changed and, where the diff makes it clear, why. Wrap it at 72 characters and describe',
  'only what the diff actually shows.'
].join(' ')

/** Generate a commit message from the staged diff. Returns subject + body split. */
export async function generateCommitMessage(input: {
  diff: string
  branch: string | null
  recentSubjects: string[]
}): Promise<AiCommitMessage> {
  if (!input.diff.trim()) {
    throw new AiError('Nothing is staged — stage the changes you want described.', 'AI_NO_DIFF')
  }
  const context = [
    input.branch ? `Current branch: ${input.branch}` : null,
    input.recentSubjects.length
      ? `Recent commit subjects in this repository (match their style):\n${input.recentSubjects
          .map((s) => `- ${s}`)
          .join('\n')}`
      : null
  ]
    .filter(Boolean)
    .join('\n\n')

  const text = await complete('commitMessage', {
    system: COMMIT_SYSTEM,
    user: `${context}\n\nStaged diff:\n\n${clip(input.diff)}`.trim(),
    maxTokens: 8000
  })

  // First line is the subject; everything after the first blank line is the body.
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const summary = (lines.shift() ?? '').replace(/^["'`]|["'`]$/g, '').trim()
  const description = lines.join('\n').trim()
  return { summary, description }
}

/**
 * Models like to wrap JSON in ``` fences or add a sentence around it however
 * firmly you ask them not to; take the outermost {...} and parse that.
 */
function parseJson<T>(text: string): T {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new AiError('The model did not answer with JSON.', 'AI_BAD_JSON')
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as T
  } catch {
    throw new AiError('The model answered with JSON that could not be parsed.', 'AI_BAD_JSON')
  }
}

const STASH_SYSTEM = [
  "You name a git stash from the diff of someone's work in progress.",
  'Answer with one single line and nothing else: no quotes, no trailing period,',
  'at most 60 characters, describing what the unfinished work is about.'
].join(' ')

/** One-line label for a stash, from the whole dirty working tree. */
export async function generateStashMessage(input: { diff: string }): Promise<string> {
  if (!input.diff.trim()) {
    throw new AiError('There are no changes to stash.', 'AI_NO_DIFF')
  }
  const text = await complete('stashMessage', {
    system: STASH_SYSTEM,
    user: `Uncommitted changes:\n\n${clip(input.diff)}`,
    maxTokens: 2000
  })
  return text
    .split('\n')[0]
    .replace(/^["'`]|["'`]$/g, '')
    .trim()
}

const PR_SYSTEM = [
  'You write the pull request title and description for a branch, from its commits and diff.',
  'Answer with JSON and nothing else, in the shape',
  '{"title": "…", "description": "…"}.',
  'The title is a single line, at most 72 characters, no trailing period.',
  'The description is markdown: a short summary paragraph, then a "## Changes" bullet list',
  'of what actually changed, then a "## Notes" section only if there is something a reviewer',
  'genuinely needs to watch out for. Describe only what the commits and diff show.'
].join(' ')

/** Title + markdown body for the branch's PR, compared against `base`. */
export async function generatePullRequest(input: {
  base: string
  branch: string
  log: string
  patch: string
  commits: number
}): Promise<AiPullRequest> {
  if (!input.commits) {
    throw new AiError(`${input.branch} has no commits that ${input.base} doesn't.`, 'AI_NO_DIFF')
  }
  const text = await complete('pullRequest', {
    system: PR_SYSTEM,
    user: [
      `Branch: ${input.branch}`,
      `Base branch: ${input.base}`,
      `Commit messages (newest first):\n${input.log}`,
      `Diff against the base:\n\n${clip(input.patch)}`
    ].join('\n\n'),
    maxTokens: 16000
  })
  const parsed = parseJson<{ title?: string; description?: string }>(text)
  return {
    title: (parsed.title ?? '').trim(),
    description: (parsed.description ?? '').trim(),
    base: input.base,
    commits: input.commits
  }
}

/** Separates the model's confidence header from the merged file itself. */
const MERGE_DELIM = '===MERGED FILE==='

const CONFLICT_SYSTEM = [
  'You resolve a git merge conflict. You get one whole file that still contains',
  '<<<<<<<, ||||||| , ======= and >>>>>>> markers (the ||||||| section, when present,',
  'is the common ancestor).',
  'Keep every part of the file that was not in conflict exactly as it is, byte for byte.',
  'Inside each conflict, combine the two sides so that both intents survive where that is',
  'possible; pick one side only when they genuinely contradict each other.',
  'Answer in exactly this shape and nothing else:',
  'a first line "CONFIDENCE: <integer 0-100>" saying how sure you are that this is the',
  'resolution the authors intended;',
  'then a line "REASON: <one or two sentences>" naming which side you took where and why;',
  `then a line containing only ${MERGE_DELIM};`,
  'then the complete resolved file, with no markdown fences and no conflict markers left',
  'anywhere.'
].join(' ')

/**
 * Resolve one conflicted file. Returns the merged text (the caller decides
 * whether to write it) plus the model's own confidence and reasoning — canned
 * reassurance would be worse than useless on a merge you have to trust.
 */
export async function resolveConflictFile(input: {
  path: string
  content: string
}): Promise<{ content: string; note: string; confidence: number | null }> {
  if (!/^<{7}/m.test(input.content)) {
    throw new AiError(`${input.path} has no conflict markers left.`, 'AI_NO_CONFLICT')
  }
  const text = await complete('conflictResolution', {
    system: CONFLICT_SYSTEM,
    user: `File: ${input.path}\n\n${clip(input.content)}`,
    maxTokens: 32000
  })

  // Split off the header. Models drop the preamble often enough that a missing
  // delimiter has to mean "the whole reply is the file", not an error — but then
  // no confidence is reported rather than one being invented.
  const raw = text.replace(/\r\n/g, '\n')
  const cut = raw.indexOf(MERGE_DELIM)
  let head = ''
  let body = raw
  if (cut >= 0) {
    head = raw.slice(0, cut)
    body = raw.slice(cut + MERGE_DELIM.length).replace(/^\n/, '')
  }
  const confMatch = head.match(/CONFIDENCE:\s*(\d{1,3})/i)
  const reasonMatch = head.match(/REASON:\s*([\s\S]*?)\s*$/i)
  const confidence = confMatch ? Math.min(100, Number(confMatch[1])) : null

  // Strip a fence if the model added one anyway, then insist the markers are gone.
  const fenced = body.match(/^```[a-z0-9]*\n([\s\S]*?)\n```\s*$/i)
  const content = fenced ? fenced[1] : body
  if (/^<{7}|^={7}|^>{7}/m.test(content)) {
    throw new AiError(
      'The model left conflict markers in the file, so nothing was written.',
      'AI_UNRESOLVED'
    )
  }
  return {
    content: content.endsWith('\n') ? content : `${content}\n`,
    note: reasonMatch?.[1].trim() || 'The model returned no reasoning — review the result closely.',
    confidence
  }
}

const COMPOSER_SYSTEM = [
  'You split one messy working tree into a series of small, coherent git commits.',
  'Answer with JSON and nothing else, in the shape',
  '{"commits": [{"summary": "…", "description": "…", "files": ["path/one.ts"]}]}.',
  'Every file must be listed in exactly one commit — never drop one, never repeat one,',
  'and only use paths from the list you are given (verbatim, including the directories).',
  'Order the commits so the history reads well; put refactors and unrelated fixes in',
  'their own commit. Summaries are imperative and at most 72 characters; descriptions are',
  'one or two short sentences. If the changes really belong together, answer with a',
  'single commit.'
].join(' ')

/** Group the dirty files into a plan of several commits. */
export async function composeCommits(input: {
  files: string[]
  diff: string
}): Promise<AiComposerPlan> {
  if (!input.files.length) throw new AiError('There are no changes to compose.', 'AI_NO_DIFF')
  const text = await complete('commitComposer', {
    system: COMPOSER_SYSTEM,
    user: [
      `Changed files (${input.files.length}):\n${input.files.map((f) => `- ${f}`).join('\n')}`,
      `Diff of all uncommitted changes:\n\n${clip(input.diff)}`
    ].join('\n\n'),
    maxTokens: 16000
  })
  const parsed = parseJson<{ commits?: AiComposerCommit[] }>(text)

  // Trust nothing: keep only real paths, drop empty groups, and never let a file
  // land in two commits (git would just commit it in the first one anyway).
  const known = new Set(input.files)
  const used = new Set<string>()
  const commits: AiComposerCommit[] = []
  for (const c of parsed.commits ?? []) {
    const files = (c.files ?? []).filter((f) => known.has(f) && !used.has(f))
    if (!files.length || !(c.summary ?? '').trim()) continue
    files.forEach((f) => used.add(f))
    commits.push({
      summary: c.summary.trim(),
      description: (c.description ?? '').trim(),
      files
    })
  }
  if (!commits.length) throw new AiError('The model proposed no usable commits.', 'AI_BAD_PLAN')
  return { commits, leftover: input.files.filter((f) => !used.has(f)) }
}

const EXPLAIN_SYSTEM = [
  'You explain an existing git commit to a developer reading the history.',
  'Start with one sentence on what the commit does overall, then a short bullet list',
  'of the concrete changes, then note anything risky or surprising if there is any.',
  'Be specific about files and behaviour; do not invent anything the diff does not show.',
  'Keep it under 250 words. Plain text with simple "-" bullets, no markdown headings.'
].join(' ')

/** Explain an already-recorded commit (metadata + patch come from gitService). */
export async function explainCommit(input: { header: string; patch: string }): Promise<string> {
  return complete('explainCommit', {
    system: EXPLAIN_SYSTEM,
    user: `${input.header}\n\nPatch:\n\n${clip(input.patch)}`,
    maxTokens: 16000
  })
}
