import { describe, expect, it } from 'vitest'

import { buildHierarchyForest } from './hierarchy-tree.model'

const ROOT = { id: 'root' }
const CHILD = { id: 'child' }
const GRANDCHILD = { id: 'grandchild' }

function getId(record: { id: string }): string {
  return record.id
}

describe('buildHierarchyForest', () => {
  it('derives parent-child relationships from flat parent references', () => {
    const forest = buildHierarchyForest([ROOT, CHILD, GRANDCHILD], getId, (record) =>
      record.id === 'child' ? 'root' : record.id === 'grandchild' ? 'child' : undefined,
    )

    expect(forest).toEqual([
      {
        data: ROOT,
        children: [{ data: CHILD, children: [{ data: GRANDCHILD, children: [] }] }],
      },
    ])
  })

  it('keeps missing, self-referencing, and cyclic parents visible at the root', () => {
    const missingParent = { id: 'orphan' }
    const selfParent = { id: 'self' }
    const firstCycleMember = { id: 'cycle-a' }
    const secondCycleMember = { id: 'cycle-b' }

    const forest = buildHierarchyForest(
      [missingParent, selfParent, firstCycleMember, secondCycleMember],
      getId,
      (record) =>
        record.id === 'orphan'
          ? 'absent'
          : record.id === 'self'
            ? 'self'
            : record.id === 'cycle-a'
              ? 'cycle-b'
              : 'cycle-a',
    )

    const visibleIds = new Set<string>()
    const visit = (nodes: typeof forest) => {
      for (const node of nodes) {
        visibleIds.add(node.data.id)
        visit(node.children)
      }
    }
    visit(forest)

    expect(visibleIds).toEqual(new Set(['orphan', 'self', 'cycle-a', 'cycle-b']))
    expect(forest.every((node) => node.data.id !== 'cycle-b' || node.children.length === 0)).toBe(
      true,
    )
  })

  it('renders every record exactly once', () => {
    const forest = buildHierarchyForest([ROOT, CHILD], getId, (record) =>
      record.id === 'child' ? 'root' : undefined,
    )

    const count = (nodes: typeof forest): number =>
      nodes.reduce((total, node) => total + 1 + count(node.children), 0)
    expect(count(forest)).toBe(2)
  })
})
