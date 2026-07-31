import { describe, it, expect } from 'vitest'
import {
  parseRemoteUrl,
  classifyReachability,
  parseSshIdentity
} from '../src/main/git/gitService'

// Pure parsing/classification behind the Remote Diagnostics feature — the risky
// bits (URL shapes, git/ssh error signatures) exercised without touching git.

describe('parseRemoteUrl', () => {
  it('parses scp-like SSH URLs', () => {
    expect(parseRemoteUrl('git@github.com:Composite-Solutions/personalbest-filament.git')).toEqual({
      protocol: 'ssh',
      host: 'github.com',
      user: 'git'
    })
  })

  it('parses ssh:// URLs with a port', () => {
    expect(parseRemoteUrl('ssh://git@git.example.com:2222/team/repo.git')).toEqual({
      protocol: 'ssh',
      host: 'git.example.com',
      user: 'git'
    })
  })

  it('parses HTTPS URLs (ignoring any embedded user)', () => {
    expect(parseRemoteUrl('https://github.com/user/repo.git')).toMatchObject({
      protocol: 'https',
      host: 'github.com'
    })
    expect(parseRemoteUrl('https://token@github.com/user/repo.git')).toMatchObject({
      protocol: 'https',
      host: 'github.com'
    })
  })

  it('treats a Windows drive path as local, not scp', () => {
    expect(parseRemoteUrl('C:\\repos\\thing').protocol).toBe('local')
  })

  it('treats a POSIX path / file URL as local', () => {
    expect(parseRemoteUrl('/home/balu/code/repo').protocol).toBe('local')
    expect(parseRemoteUrl('file:///home/balu/code/repo').protocol).toBe('local')
  })
})

describe('classifyReachability', () => {
  it('ok on exit 0 regardless of stderr', () => {
    expect(classifyReachability('ssh', 0, '')).toBe('ok')
  })

  it('detects GitHub "Repository not found" as no-access, not auth-failed', () => {
    const stderr = 'ERROR: Repository not found.\nfatal: Could not read from remote repository.'
    expect(classifyReachability('ssh', 128, stderr)).toBe('no-access')
  })

  it('detects a rejected key as auth-failed', () => {
    const stderr =
      'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.'
    expect(classifyReachability('ssh', 128, stderr)).toBe('auth-failed')
  })

  it('detects DNS/network failures as host-unreachable', () => {
    expect(classifyReachability('ssh', 128, 'ssh: Could not resolve hostname nope: ...')).toBe(
      'host-unreachable'
    )
  })

  it('detects HTTPS credential failures', () => {
    expect(
      classifyReachability('https', 128, 'fatal: Authentication failed for https://github.com/')
    ).toBe('https-auth')
  })

  it('falls back to auth-failed for a bare SSH generic error', () => {
    expect(classifyReachability('ssh', 128, 'fatal: Could not read from remote repository.')).toBe(
      'auth-failed'
    )
  })
})

describe('parseSshIdentity', () => {
  it('reads the GitHub greeting', () => {
    expect(
      parseSshIdentity("Hi balumark! You've successfully authenticated, but GitHub does not...")
    ).toEqual({ status: 'authenticated', identity: 'balumark' })
  })

  it('reads a GitLab welcome', () => {
    expect(parseSshIdentity('Welcome to GitLab, @balu!')).toEqual({
      status: 'authenticated',
      identity: 'balu'
    })
  })

  it('reports permission denied as denied', () => {
    expect(parseSshIdentity('git@github.com: Permission denied (publickey).').status).toBe('denied')
  })
})
