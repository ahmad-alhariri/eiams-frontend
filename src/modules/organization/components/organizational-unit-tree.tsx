import { IconSitemap } from '@tabler/icons-react'
import { useMemo } from 'react'

import {
  buildOrganizationalUnitTree,
  type OrganizationalUnitTreeNode,
} from '@/modules/organization/components/organizational-unit-tree.model'
import { HierarchyTree } from '@/shared/ui/hierarchy-tree'
import type { OrganizationalUnit } from '@/modules/organization/types/organization.types'

type OrganizationalUnitTreeProps = {
  units: readonly OrganizationalUnit[]
  onEdit?: (unit: OrganizationalUnit) => void
  /**
   * Activate/deactivate action, offered per row from the unit's own status. The
   * shared tree draws the button and chooses the glyph from `getStatus`, so the
   * page only has to say WHERE the confirmation happens.
   */
  onToggleStatus?: (unit: OrganizationalUnit) => void
}

/**
 * Domain-only tree presentation for the organizational-unit parent relation.
 *
 * The label is `name` (the wire field; there is no `nameAr`) and the secondary
 * line is the immutable `code` the projection now serves.
 */
function OrganizationalUnitTree({ units, onEdit, onToggleStatus }: OrganizationalUnitTreeProps) {
  const tree = useMemo(() => buildOrganizationalUnitTree(units), [units])

  return (
    <HierarchyTree
      nodes={tree}
      ariaLabel="شجرة الوحدات التنظيمية"
      leadIcon={<IconSitemap aria-hidden className="size-4 shrink-0 text-golden-wheat" />}
      getKey={(unit) => unit.id}
      getLabel={(unit) => unit.name}
      getCode={(unit) => unit.code}
      getStatus={(unit) => unit.status}
      {...(onEdit === undefined ? {} : { onEdit })}
      {...(onToggleStatus === undefined ? {} : { onToggleStatus })}
    />
  )
}

/**
 * Counts EVERY unit below `unit` in the server-derived forest — children,
 * grandchildren and so on — for the deactivation confirmation copy. A unit
 * whose parent reference is missing or cyclic stays in the forest as a root,
 * so this counts only genuine descendants and never loops or drops a branch.
 *
 * Pure and synchronous: it derives from the same `buildOrganizationalUnitTree`
 * the visible tree uses, so the warning cannot disagree with what is displayed.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure derived helper exported for the page's confirmation copy
export function countDescendantOrganizationalUnits(
  units: readonly OrganizationalUnit[],
  unit: OrganizationalUnit,
): number {
  const findNode = (
    nodes: readonly OrganizationalUnitTreeNode[],
  ): OrganizationalUnitTreeNode | undefined => {
    for (const node of nodes) {
      if (node.data.id === unit.id) return node
      const nested = findNode(node.children)
      if (nested !== undefined) return nested
    }
    return undefined
  }

  const target = findNode(buildOrganizationalUnitTree(units))
  if (target === undefined) return 0

  const countBelow = (nodes: readonly OrganizationalUnitTreeNode[]): number =>
    nodes.reduce((total, node) => total + 1 + countBelow(node.children), 0)

  return countBelow(target.children)
}

export { OrganizationalUnitTree }
