import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { simpleGit } from 'simple-git'
import { GitService } from '../src/main/git/gitService'

// "Use this key for this repo" writes core.sshCommand — which simple-git blocks
// by default ("Configuring core.sshCommand is not permitted without enabling
// allowUnsafeSshCommand"). This proves the opt-in instance actually writes,
// reads back and clears it against a real repo.

let dir: string
const svc = new GitService()

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kraken-ssh-'))
  const g = simpleGit(dir)
  await g.init(['--initial-branch=main'])
  await svc.openRepo(dir)
})

afterAll(async () => {
  svc.close()
  await fs.rm(dir, { recursive: true, force: true })
})

describe('gitService repo ssh command', () => {
  it('writes, reads back and clears core.sshCommand', async () => {
    const value = 'ssh -i "C:/Users/balu/.ssh/id_ed25519" -o IdentitiesOnly=yes'
    await svc.setRepoSshCommand(value)
    expect(await svc.getConfig('core.sshCommand', 'local')).toBe(value)

    await svc.setRepoSshCommand(null)
    expect(await svc.getConfig('core.sshCommand', 'local')).toBeNull()
  })

  it('clearing an unset key is a no-op, not an error', async () => {
    await expect(svc.setRepoSshCommand(null)).resolves.toBeUndefined()
  })
})
