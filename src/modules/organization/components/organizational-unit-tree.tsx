import { IconSitemap } from '@tabler/icons-react'
import { useMemo } from 'react'

import { buildOrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree.model'
import { HierarchyTree } from '@/shared/ui/hierarchy-tree'
import type { OrganizationalUnit } from '@/shared/types/generated/eiams-v1'

type OrganizationalUnitTreeProps = {
  units: readonly OrganizationalUnit[]
  onEdit?: (unit: OrganizationalUnit) => void
}

/** Domain-only tree presentation for the organizational-unit parent relation. */
function OrganizationalUnitTree({ units, onEdit }: OrganizationalUnitTreeProps) {
  const tree = useMemo(() => buildOrganizationalUnitTree(units), [units])

  return (
    <HierarchyTree
      nodes={tree}
      ariaLabel="شجرة الوحدات التنظيمية"
      leadIcon={<IconSitemap aria-hidden className="size-4 shrink-0 text-golden-wheat" />}
      getKey={(unit) => unit.orgUnitId}
      getLabel={(unit) => unit.nameAr}
      getCode={(unit) => unit.code}
      getStatus={(unit) => unit.status}
      {...(onEdit === undefined ? {} : { onEdit })}
    />
  )
}

export { OrganizationalUnitTree }
