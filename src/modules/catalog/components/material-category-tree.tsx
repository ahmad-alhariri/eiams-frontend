import { IconFolder, IconFolders } from '@tabler/icons-react'
import { useMemo } from 'react'

import {
  buildMaterialCategoryTree,
  type MaterialCategoryDomainTree,
  type MaterialCategoryTreeNode,
} from '@/modules/catalog/components/material-category-tree.model'
import type { MaterialCategory, MaterialDomain } from '@/modules/catalog/types/catalog.types'
import { HierarchyTree } from '@/shared/ui/hierarchy-tree'
import type { HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'

type MaterialCategoryTreeProps = {
  categories: readonly MaterialCategory[]
  /** Supplies the domain labels; the flat category record carries only ids. */
  domains: readonly MaterialDomain[]
  onEdit?: (category: MaterialCategory) => void
  /** Activates/deactivates a category through its own status command. */
  onToggleStatus?: (category: MaterialCategory) => void
}

function toHierarchyNodes(
  nodes: readonly MaterialCategoryTreeNode[],
): HierarchyTreeNode<MaterialCategory>[] {
  return nodes.map((node) => ({ data: node.category, children: toHierarchyNodes(node.children) }))
}

function CategoryDomainSection({
  domain,
  onEdit,
  onToggleStatus,
}: {
  domain: MaterialCategoryDomainTree
  onEdit: ((category: MaterialCategory) => void) | undefined
  onToggleStatus: ((category: MaterialCategory) => void) | undefined
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
        getKey={(category) => category.id}
        getLabel={(category) => category.name}
        getCode={(category) => category.code}
        getStatus={(category) => category.status}
        {...(onEdit === undefined ? {} : { onEdit })}
        {...(onToggleStatus === undefined ? {} : { onToggleStatus })}
      />
    </section>
  )
}

/**
 * Category hierarchy grouped by its authoritative domain.
 *
 * `domains` supplies the domain LABELS: a category record now carries only
 * `materialDomainId` (the retired nested reference is gone), so the grouping id
 * and the heading text come from different sources on purpose.
 */
function MaterialCategoryTree({
  categories,
  domains,
  onEdit,
  onToggleStatus,
}: MaterialCategoryTreeProps) {
  const domainTrees = useMemo(
    () => buildMaterialCategoryTree(categories, domains),
    [categories, domains],
  )

  return (
    <div aria-label="شجرة تصنيفات المواد" data-slot="material-category-tree" className="space-y-5">
      {domainTrees.map((domain) => (
        <CategoryDomainSection
          key={domain.domainId}
          domain={domain}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
        />
      ))}
    </div>
  )
}

export { MaterialCategoryTree, type MaterialCategoryTreeProps }
