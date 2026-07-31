import { promises as fs } from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'
import type {
  HostKind,
  HostQuery,
  HostTokenStatus,
  RemoteRepo,
  RemoteRepoList
} from '@shared/types'
import { getActiveProfile } from './profiles'

// ---------------------------------------------------------------------------
// Listing "my repositories" on GitHub/GitLab/Bitbucket/Azure is an API call, not
// an SSH one: none of these hosts expose a repo list over SSH (`ssh git@github.com`
// only greets you). So the clone window needs a personal access token per host —
// stored PER PROFILE, encrypted with the OS keychain, exactly like the AI key.
// The profile's SSH key is still what performs the clone afterwards.
// ---------------------------------------------------------------------------

export class HostError extends Error {
  code: string
  constructor(message: string, code = 'HOST_ERROR') {
    super(message)
    this.name = 'HostError'
    this.code = code
  }
}

const LABEL: Record<HostKind, string> = {
  github: 'GitHub',
  'github-enterprise': 'GitHub Enterprise',
  gitlab: 'GitLab',
  'gitlab-self': 'GitLab',
  bitbucket: 'Bitbucket',
  'bitbucket-dc': 'Bitbucket Data Center',
  azure: 'Azure DevOps'
}

/** Tokens are keyed by profile so switching profile switches accounts too. */
type TokenFile = Record<string, Partial<Record<HostKind, string>>>

function tokenFile(): string {
  return path.join(app.getPath('userData'), 'host-tokens.json')
}

async function readTokens(): Promise<TokenFile> {
  try {
    return JSON.parse(await fs.readFile(tokenFile(), 'utf8')) as TokenFile
  } catch {
    return {}
  }
}

export async function hostTokenStatus(): Promise<HostTokenStatus> {
  const profile = await getActiveProfile()
  const all = await readTokens()
  const mine = all[profile.id] ?? {}
  return {
    saved: (Object.keys(mine) as HostKind[]).filter((k) => !!mine[k]),
    encryptionAvailable: safeStorage.isEncryptionAvailable()
  }
}

export async function setHostToken(kind: HostKind, token: string | null): Promise<HostTokenStatus> {
  const profile = await getActiveProfile()
  const all = await readTokens()
  const mine = { ...(all[profile.id] ?? {}) }
  if (token && token.trim()) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new HostError(
        'This system has no available keychain, so the token cannot be stored safely.',
        'HOST_NO_KEYCHAIN'
      )
    }
    mine[kind] = safeStorage.encryptString(token.trim()).toString('base64')
  } else {
    delete mine[kind]
  }
  await fs.writeFile(tokenFile(), JSON.stringify({ ...all, [profile.id]: mine }, null, 2), 'utf8')
  return hostTokenStatus()
}

async function readToken(kind: HostKind): Promise<string> {
  const profile = await getActiveProfile()
  const blob = (await readTokens())[profile.id]?.[kind]
  if (!blob) {
    throw new HostError(
      `No ${LABEL[kind]} token saved for the "${profile.name}" profile.`,
      'HOST_NO_TOKEN'
    )
  }
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'))
  } catch {
    throw new HostError('The saved token could not be decrypted — enter it again.', 'HOST_BAD_TOKEN')
  }
}

// --- HTTP -------------------------------------------------------------------

async function getJsonWithHeaders(
  url: string,
  headers: Record<string, string>
): Promise<{ body: unknown; headers: Headers }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'coal-clone', ...headers },
      signal: controller.signal
    })
  } catch (e) {
    throw new HostError(
      controller.signal.aborted
        ? 'The host did not answer in time.'
        : `Could not reach the host: ${e instanceof Error ? e.message : String(e)}`,
      'HOST_NETWORK'
    )
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  if (!res.ok) {
    const code = res.status === 401 || res.status === 403 ? 'HOST_BAD_TOKEN' : 'HOST_ERROR'
    const hint =
      code === 'HOST_BAD_TOKEN'
        ? 'The token was rejected — check that it is valid and has repository read scope.'
        : text.slice(0, 200)
    throw new HostError(`${res.status}: ${hint}`, code)
  }
  try {
    return { body: JSON.parse(text) as unknown, headers: res.headers }
  } catch {
    throw new HostError('The host returned a response that was not JSON.')
  }
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  return (await getJsonWithHeaders(url, headers)).body
}

/** Walk pages until one comes back short. Capped so a huge account can't hang us. */
async function paged<T>(
  fetchPage: (page: number) => Promise<T[]>,
  perPage: number,
  maxPages = 5
): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchPage(page)
    out.push(...batch)
    if (batch.length < perPage) break
  }
  return out
}

function requireServer(q: HostQuery): string {
  const server = (q.server ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (!server) throw new HostError('Enter the server host name first.', 'HOST_NO_SERVER')
  return server
}

// --- per-host listing --------------------------------------------------------

interface GitHubRepo {
  name: string
  private: boolean
  ssh_url: string
  owner?: { login?: string }
}

async function listGitHub(q: HostQuery, token: string): Promise<RemoteRepo[]> {
  const base =
    q.kind === 'github' ? 'https://api.github.com' : `https://${requireServer(q)}/api/v3`
  const auth = { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' }
  const org = (q.org ?? '').trim()

  const page = (path: string) => async (n: number) =>
    (await getJson(`${base}${path}?per_page=100&page=${n}&sort=updated`, auth)) as GitHubRepo[]

  // `/user/repos` means "repos of the authenticated USER" — an organization's
  // repositories never show up there, not even for a token whose resource owner
  // IS that organization. Asking for an owner explicitly is the only way in.
  let repos: GitHubRepo[]
  if (org) {
    try {
      repos = await paged<GitHubRepo>(page(`/orgs/${encodeURIComponent(org)}/repos`), 100)
    } catch {
      // Not an org (or invisible as one) — try the same name as a user account.
      repos = await paged<GitHubRepo>(page(`/users/${encodeURIComponent(org)}/repos`), 100)
    }
  } else {
    repos = await paged<GitHubRepo>(
      async (n) =>
        (await getJson(
          `${base}/user/repos?per_page=100&page=${n}&sort=updated&affiliation=owner,collaborator,organization_member`,
          auth
        )) as GitHubRepo[],
      100
    )

    // `/user/repos` returns an empty list — no error — for a fine-grained token
    // with no repository permissions ticked, which is the default when you
    // create one. Rather than hand that dead end to the user, go and look:
    // their own account and each visible org can be listed by name.
    if (!repos.length) {
      const also = async (path: string): Promise<GitHubRepo[]> => {
        try {
          return await paged<GitHubRepo>(page(path), 100)
        } catch {
          return []
        }
      }
      const me = (await getJson(`${base}/user`, auth).catch(() => ({}))) as { login?: string }
      if (me.login) repos.push(...(await also(`/users/${encodeURIComponent(me.login)}/repos`)))
      const orgs = (await getJson(`${base}/user/orgs`, auth).catch(() => [])) as {
        login?: string
      }[]
      for (const o of orgs) {
        if (o.login) repos.push(...(await also(`/orgs/${encodeURIComponent(o.login)}/repos`)))
      }
      // The fallbacks overlap, so drop anything we picked up twice.
      const seen = new Set<string>()
      repos = repos.filter((r) => {
        if (seen.has(r.ssh_url)) return false
        seen.add(r.ssh_url)
        return true
      })
    }
  }

  return repos.map((r) => ({
    owner: r.owner?.login ?? org,
    name: r.name,
    sshUrl: r.ssh_url,
    private: !!r.private
  }))
}

interface GitLabProject {
  path: string
  ssh_url_to_repo: string
  visibility?: string
  namespace?: { full_path?: string }
}

async function listGitLab(q: HostQuery, token: string): Promise<RemoteRepo[]> {
  const base = q.kind === 'gitlab' ? 'https://gitlab.com' : `https://${requireServer(q)}`
  const group = (q.org ?? '').trim()
  // Same story as GitHub: a group's projects need the group endpoint.
  const url = group
    ? `${base}/api/v4/groups/${encodeURIComponent(group)}/projects?include_subgroups=true&per_page=100`
    : `${base}/api/v4/projects?membership=true&per_page=100&order_by=last_activity_at`
  const projects = await paged<GitLabProject>(
    async (page) => (await getJson(`${url}&page=${page}`, { 'private-token': token })) as GitLabProject[],
    100
  )
  return projects.map((p) => ({
    owner: p.namespace?.full_path ?? '',
    name: p.path,
    sshUrl: p.ssh_url_to_repo,
    private: p.visibility !== 'public'
  }))
}

interface BitbucketCloudRepo {
  slug: string
  is_private?: boolean
  workspace?: { slug?: string }
  links?: { clone?: { name?: string; href?: string }[] }
}

async function listBitbucket(token: string): Promise<RemoteRepo[]> {
  const repos = await paged<BitbucketCloudRepo>(
    async (page) =>
      (
        (await getJson(
          `https://api.bitbucket.org/2.0/repositories?role=member&pagelen=100&page=${page}`,
          { authorization: `Bearer ${token}` }
        )) as { values?: BitbucketCloudRepo[] }
      ).values ?? [],
    100
  )
  return repos.map((r) => ({
    owner: r.workspace?.slug ?? '',
    name: r.slug,
    sshUrl: r.links?.clone?.find((c) => c.name === 'ssh')?.href ?? '',
    private: !!r.is_private
  }))
}

interface BitbucketServerRepo {
  slug: string
  public?: boolean
  project?: { key?: string }
  links?: { clone?: { name?: string; href?: string }[] }
}

async function listBitbucketServer(q: HostQuery, token: string): Promise<RemoteRepo[]> {
  const base = `https://${requireServer(q)}`
  const repos = await paged<BitbucketServerRepo>(
    async (page) =>
      (
        (await getJson(`${base}/rest/api/1.0/repos?limit=100&start=${(page - 1) * 100}`, {
          authorization: `Bearer ${token}`
        })) as { values?: BitbucketServerRepo[] }
      ).values ?? [],
    100
  )
  return repos.map((r) => ({
    owner: r.project?.key ?? '',
    name: r.slug,
    sshUrl: r.links?.clone?.find((c) => c.name === 'ssh')?.href ?? '',
    private: !r.public
  }))
}

interface AzureRepo {
  name: string
  sshUrl?: string
  remoteUrl?: string
  project?: { name?: string }
}

async function listAzure(q: HostQuery, token: string): Promise<RemoteRepo[]> {
  const org = (q.org ?? '').trim()
  if (!org) throw new HostError('Enter the Azure DevOps organization first.', 'HOST_NO_ORG')
  // Azure PATs authenticate as HTTP Basic with an empty user name.
  const basic = Buffer.from(`:${token}`).toString('base64')
  const res = (await getJson(
    `https://dev.azure.com/${encodeURIComponent(org)}/_apis/git/repositories?api-version=7.0`,
    { authorization: `Basic ${basic}` }
  )) as { value?: AzureRepo[] }
  return (res.value ?? []).map((r) => ({
    owner: r.project?.name ?? org,
    name: r.name,
    sshUrl: r.sshUrl ?? r.remoteUrl ?? '',
    private: true
  }))
}

/**
 * Who the token actually is. Only asked when the repo list came back empty:
 * "no repositories" is a dead end, "no repositories — this token authenticates
 * as X, whose organizations are Y" tells you the token belongs to the wrong
 * account (the usual fine-grained-token trap).
 */
type Who = Omit<RemoteRepoList, 'repos'>

async function whoAmI(q: HostQuery, token: string): Promise<Who> {
  const unknown: Who = { account: null, orgs: [], tokenKind: null, scopes: [] }
  try {
    if (q.kind === 'github' || q.kind === 'github-enterprise') {
      const base =
        q.kind === 'github' ? 'https://api.github.com' : `https://${requireServer(q)}/api/v3`
      const auth = { authorization: `Bearer ${token}` }
      const me = await getJsonWithHeaders(`${base}/user`, auth)
      // Only classic tokens carry this header — its absence IS the answer.
      const raw = me.headers.get('x-oauth-scopes')
      const orgs = (await getJson(`${base}/user/orgs`, auth).catch(() => [])) as {
        login?: string
      }[]
      return {
        account: (me.body as { login?: string }).login ?? null,
        orgs: orgs.map((o) => o.login ?? '').filter(Boolean),
        tokenKind: raw === null ? 'fine-grained' : 'classic',
        scopes: (raw ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      }
    }
    if (q.kind === 'gitlab' || q.kind === 'gitlab-self') {
      const base = q.kind === 'gitlab' ? 'https://gitlab.com' : `https://${requireServer(q)}`
      const me = (await getJson(`${base}/api/v4/user`, { 'private-token': token })) as {
        username?: string
      }
      return { ...unknown, account: me.username ?? null }
    }
  } catch {
    // Diagnostics must never turn an empty list into a hard failure.
  }
  return unknown
}

/** List every repository the profile's token can see, newest-ish first. */
export async function listRepos(q: HostQuery): Promise<RemoteRepoList> {
  const token = await readToken(q.kind)
  const found =
    q.kind === 'github' || q.kind === 'github-enterprise'
      ? await listGitHub(q, token)
      : q.kind === 'gitlab' || q.kind === 'gitlab-self'
        ? await listGitLab(q, token)
        : q.kind === 'bitbucket'
          ? await listBitbucket(token)
          : q.kind === 'bitbucket-dc'
            ? await listBitbucketServer(q, token)
            : await listAzure(q, token)
  // A repo with no SSH url can't be cloned with a key — don't offer it.
  const repos = found.filter((r) => r.sshUrl)
  if (repos.length) return { repos, account: null, orgs: [], tokenKind: null, scopes: [] }
  return { repos, ...(await whoAmI(q, token)) }
}
