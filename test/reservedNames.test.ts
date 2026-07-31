import { describe, it, expect } from 'vitest'
import { isReservedWindowsPath } from '../src/main/git/gitService'

// A file named NUL/CON/COM1… can be committed from Linux but never checked out on
// Windows, which is what turns it into a permanent phantom deletion.

describe('isReservedWindowsPath', () => {
  it('detects bare device names', () => {
    for (const n of ['NUL', 'nul', 'CON', 'aux', 'PRN', 'COM1', 'lpt9']) {
      expect(isReservedWindowsPath(n), n).toBe(true)
    }
  })

  it('detects device names with an extension or in a subdirectory', () => {
    expect(isReservedWindowsPath('NUL.txt')).toBe(true)
    expect(isReservedWindowsPath('storage/logs/nul')).toBe(true)
    expect(isReservedWindowsPath('storage\\logs\\CON.log')).toBe(true)
  })

  it('leaves ordinary paths alone', () => {
    for (const n of ['nullable.php', 'console.ts', 'com/foo', 'lpt/index.js', 'annul']) {
      expect(isReservedWindowsPath(n), n).toBe(false)
    }
  })
})
