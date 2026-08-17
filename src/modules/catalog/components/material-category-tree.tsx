import { IconFolder, IconFolders } from '@tabler/icons-react'
import { useMemo } from 'react'

import {
  buildMaterialCategoryTree,
  type MaterialCategoryDomainTree,
  type MaterialCategoryTreeNode,
} from '@/modules/catalog/components/material-category-tree.model'
import { HierarchyTree } from '@/shared/ui/hierarchy-tree'
import type { HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'
import type { MaterialCategory } from '@/shared/types/generated/eiams-v1'

type MaterialCategoryTreeProps = {
  categories: readonly MaterialCategory[]
  onEdit?: (category: MaterialCategory) => void
}

function toHierarchyNodes(
  nodes: readonly MaterialCategoryTreeNode[],
): HierarchyTreeNode<MaterialCategory>[] {
  return nodes.map((node) => ({ data: node.category, children: toHierarchyNodes(node.children) }))
}

function CategoryDomainSection({
  domain,
  onEdit,
}: {
  domain: MaterialCategoryDomainTree
  onEdit: ((category: MaterialCategory) => void) | undefined
}) {
  return (
    <section aria-labelledby={`material-category-domain-${domain.domainId}`}>
      <h2
        id={`material-category-domain-${domain.domainId}`}
        className="mb-2 flex items-center gap-2 border-b border-border pb-2 text-sm font-semibold text-foreground"
      >
        <IconFolders aria-hidden className="size-4 text-golden-wheat" />
        {domain.domainName}
      </h2>
      <HierarchyTree
        nodes={toHierarchyNodes(domain.nodes)}
        ariaLabel={`شجرة تصنيفات ${domain.domainName}`}
        leadIcon={<IconFolder aria-hidden className="size-4 shrink-0 text-golden-wheat" />}
        getKey={(category) => category.categoryId}
        getLabel={(category) => category.nameAr}
        getCode={(category) => category.code}
        getStatus={(category) => category.status}
        {...(onEdit === undefined ? {} : { onEdit })}
      />
    </section>
  )
}

/** Read-only, contract-derived category hierarchy grouped by its authoritative domain reference. */
function MaterialCategoryTree({ categories, onEdit }: MaterialCategoryTreeProps) {
  const domains = useMemo(() => buildMaterialCategoryTree(categories), [categories])

  return (
    <div aria-label="شجرة تصنيفات المواد" data-slot="material-category-tree" className="space-y-5">
      {domains.map((domain) => (
        <CategoryDomainSection key={domain.domainId} domain={domain} onEdit={onEdit} />
      ))}
    </div>
  )
}

export { MaterialCategoryTree }
