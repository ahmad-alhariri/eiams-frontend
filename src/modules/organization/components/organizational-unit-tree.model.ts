import { buildHierarchyForest, type HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'
import type { OrganizationalUnit } from '@/shared/types/generated/eiams-v1'

export type OrganizationalUnitTreeNode = HierarchyTreeNode<OrganizationalUnit>

/**
 * Builds a resilient tree from the v1 list response. The v1 contract exposes
 * parent references, not a dedicated tree endpoint, so relationships are
 * derived only from the units returned by the server. Malformed or incomplete
 * references remain visible at the root rather than being silently discarded.
 */
export function buildOrganizationalUnitTree(
  units: readonly OrganizationalUnit[],
): OrganizationalUnitTreeNode[] {
  return buildHierarchyForest(
    units,
    (unit) => unit.orgUnitId,
    (unit) => unit.parentOrgUnitId,
  )
}
