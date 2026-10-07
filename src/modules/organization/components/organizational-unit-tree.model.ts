import { buildHierarchyForest, type HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'
import type { OrganizationalUnit } from '@/modules/organization/types/organization.types'

export type OrganizationalUnitTreeNode = HierarchyTreeNode<OrganizationalUnit>

/**
 * Builds a resilient tree from the v1 list response. The v1 contract exposes
 * parent references, not a dedicated tree endpoint, so relationships are
 * derived only from the units returned by the server. Malformed or incomplete
 * references remain visible at the root rather than being silently discarded.
 *
 * The identifiers read here are the wire ones: `id` and `parentId`. The
 * generated snapshot's `orgUnitId` / `parentOrgUnitId` are `undefined` on every
 * real record, which made this builder key its map on `undefined` and collapse
 * the whole hierarchy into a flat list of roots.
 */
export function buildOrganizationalUnitTree(
  units: readonly OrganizationalUnit[],
): OrganizationalUnitTreeNode[] {
  return buildHierarchyForest(
    units,
    (unit) => unit.id,
    (unit) => unit.parentId,
  )
}
