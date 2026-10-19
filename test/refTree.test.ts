import { describe, it, expect } from 'vitest'
import { buildTree, compactTree, matchRange, matches } from '../src/renderer/lib/refTree'

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

describe('compactTree', () => {
  it('folds single-child folder chains but keeps branching folders and leaves', () => {
    const tree = compactTree(
      buildTree(
        ['src/main/ai/aiService.ts', 'src/renderer/a.tsx', 'src/renderer/b.tsx', 'x.md'],
        (n) => n
      )
    )
    expect(tree.map((n) => n.name)).toEqual(['src', 'x.md'])
    const src = tree[0]
    expect(src.children.map((n) => n.name)).toEqual(['main/ai', 'renderer'])
    expect(src.children[0]).toMatchObject({ path: 'src/main/ai', count: 1 })
    expect(src.children[0].children[0].name).toBe('aiService.ts')
    expect(src.children[1].children.map((n) => n.name)).toEqual(['a.tsx', 'b.tsx'])
  })

  it('folds a chain that starts at the root', () => {
    const [only] = compactTree(buildTree(['a/b/c/file.txt'], (n) => n))
    expect(only.name).toBe('a/b/c')
    expect(only.children[0].item).toBe('a/b/c/file.txt')
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
