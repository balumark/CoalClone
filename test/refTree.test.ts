import { describe, it, expect } from 'vitest'
import { buildTree, matchRange, matches } from '../src/renderer/lib/refTree'

const names = ['main', 'feature/chat', 'feature/Chat-2', 'fix/x', 'feature/team/v2', 'development']

describe('buildTree', () => {
  const tree = buildTree(names, (n) => n)

  it('puts folders first, then leaves, each alphabetical', () => {
    expect(tree.map((n) => [n.name, n.item === undefined])).toEqual([
      ['feature', true],
      ['fix', true],
      ['development', false],
      ['main', false]
    ])
  })

  it('nests segments and counts the leaves under each folder', () => {
    const feature = tree[0]
    expect(feature.count).toBe(3)
    expect(feature.children.map((c) => c.name)).toEqual(['team', 'chat', 'Chat-2'])
    expect(feature.children[0].children[0]).toMatchObject({
      name: 'v2',
      path: 'feature/team/v2',
      item: 'feature/team/v2',
      offset: 'feature/team/'.length
    })
  })

  it('shifts offsets by the base offset (remote prefix)', () => {
    const [folder] = buildTree(['feature/api'], (n) => n, 'origin/'.length)
    expect(folder.offset).toBe(7)
    expect(folder.children[0].offset).toBe(7 + 'feature/'.length)
  })
})

describe('filter matching', () => {
  it('matches case-insensitively and across segments', () => {
    expect(matchRange('feature/22879-db-migrations', 'Feature/22879')).toEqual([0, 13])
    expect(matches('feature/chat', 'CHAT')).toBe(true)
    expect(matches('feature/chat', 'team')).toBe(false)
  })

  it('treats an empty query as matching everything', () => {
    expect(matches('anything', '  ')).toBe(true)
    expect(matchRange('anything', '')).toBeNull()
  })
})
