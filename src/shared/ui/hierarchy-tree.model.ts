export interface HierarchyTreeNode<T> {
  data: T
  children: HierarchyTreeNode<T>[]
}

/**
 * Builds a resilient forest from a flat server list that exposes parent
 * references instead of a dedicated tree endpoint.
 *
 * Rules, matching the behavior contract of the consuming feature trees:
 * - Malformed, self-referencing, missing, and cyclic parent links are kept
 *   visible at the root rather than silently discarded.
 * - A parent link is honored only when the parent record is present.
 * - Every record appears exactly once; cycles are broken and the remaining
 *   records are appended so no contract response entry disappears.
 */
export function buildHierarchyForest<T>(
  records: readonly T[],
  getKey: (record: T) => string,
  getParentId: (record: T) => string | null | undefined,
): HierarchyTreeNode<T>[] {
  const recordsById = new Map(records.map((record) => [getKey(record), record]))
  const childrenByParentId = new Map<string, T[]>()
  const roots: T[] = []

  for (const record of records) {
    const parentId = getParentId(record)
    const parent =
      parentId === null || parentId === undefined ? undefined : recordsById.get(parentId)

    if (parent === undefined || getKey(parent) === getKey(record)) {
      roots.push(record)
      continue
    }

    const children = childrenByParentId.get(getKey(parent)) ?? []
    children.push(record)
    childrenByParentId.set(getKey(parent), children)
  }

  const visited = new Set<string>()
  const buildNode = (record: T): HierarchyTreeNode<T> | null => {
    const key = getKey(record)
    if (visited.has(key)) return null

    visited.add(key)
    return {
      data: record,
      children: (childrenByParentId.get(key) ?? []).flatMap((child) => {
        const node = buildNode(child)
        return node === null ? [] : [node]
      }),
    }
  }

  const forest = roots.flatMap((root) => {
    const node = buildNode(root)
    return node === null ? [] : [node]
  })

  // A cyclic parent chain has no natural root. Keep the remaining records
  // available to readers while breaking the rendering cycle above.
  for (const record of records) {
    const node = buildNode(record)
    if (node !== null) forest.push(node)
  }

  return forest
}
