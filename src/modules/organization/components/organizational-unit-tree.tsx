import { IconSitemap } from '@tabler/icons-react'
import { useMemo } from 'react'

import { buildOrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree.model'
import { HierarchyTree } from '@/shared/ui/hierarchy-tree'
import type { OrganizationalUnit } from '@/modules/organization/types/organization.types'

type OrganizationalUnitTreeProps = {
  units: readonly OrganizationalUnit[]
  onEdit?: (unit: OrganizationalUnit) => void
}

/**
 * Domain-only tree presentation for the organizational-unit parent relation.
 *
 * The label is `name` (the wire field; there is no `nameAr`) and the secondary
 * line is `unitType`, which replaces the `code` this projection never served.
 */
function OrganizationalUnitTree({ units, onEdit }: OrganizationalUnitTreeProps) {
  const tree = useMemo(() => buildOrganizationalUnitTree(units), [units])

  return (
    <HierarchyTree
      nodes={tree}
      ariaLabel="شجرة الوحدات التنظيمية"
      leadIcon={<IconSitemap aria-hidden className="size-4 shrink-0 text-golden-wheat" />}
      getKey={(unit) => unit.id}
      getLabel={(unit) => unit.name}
      getCode={(unit) => unit.unitType}
      getStatus={(unit) => unit.status}
      {...(onEdit === undefined ? {} : { onEdit })}
    />
  )
}

export { OrganizationalUnitTree }
