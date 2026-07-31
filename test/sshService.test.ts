import { describe, it, expect } from 'vitest'
import { keyFromSshCommand } from '../src/main/git/sshService'

// The "used by this repo" badge and the Unpin button both depend on reading our
// own core.sshCommand back correctly — including paths with spaces, which is the
// normal case on Windows (C:\Users\First Last\.ssh\id_ed25519).

describe('keyFromSshCommand', () => {
  it('reads the key out of the command we write', () => {
    expect(keyFromSshCommand('ssh -i "C:/Users/balu/.ssh/id_ed25519" -o IdentitiesOnly=yes')).toBe(
      'C:/Users/balu/.ssh/id_ed25519'
    )
  })

  it('handles quoted paths with spaces and single quotes', () => {
    expect(keyFromSshCommand('ssh -i "C:/Users/First Last/.ssh/id_rsa"')).toBe(
      'C:/Users/First Last/.ssh/id_rsa'
    )
    expect(keyFromSshCommand("ssh -i '/home/balu/.ssh/id_rsa' -o IdentitiesOnly=yes")).toBe(
      '/home/balu/.ssh/id_rsa'
    )
  })

  it('handles an unquoted path and a hand-written command', () => {
    expect(keyFromSshCommand('ssh -o StrictHostKeyChecking=no -i /home/balu/.ssh/work')).toBe(
      '/home/balu/.ssh/work'
    )
  })

  it('returns null when no key is pinned', () => {
    expect(keyFromSshCommand(null)).toBeNull()
    expect(keyFromSshCommand('ssh -o IdentitiesOnly=yes')).toBeNull()
  })
})
