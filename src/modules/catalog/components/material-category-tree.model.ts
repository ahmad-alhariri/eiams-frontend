import { buildHierarchyForest, type HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'
import type { MaterialCategory, MaterialDomain } from '@/modules/catalog/types/catalog.types'

export type MaterialCategoryTreeNode = {
  category: MaterialCategory
  children: MaterialCategoryTreeNode[]
}

export type MaterialCategoryDomainTree = {
  domainId: string
  domainName: string
  nodes: MaterialCategoryTreeNode[]
}

function toCategoryNodes(
  nodes: readonly HierarchyTreeNode<MaterialCategory>[],
): MaterialCategoryTreeNode[] {
  return nodes.map((node) => ({ category: node.data, children: toCategoryNodes(node.children) }))
}

/**
 * Builds a resilient, domain-aware hierarchy from the flat category list.
 * Each domain is built as its own forest, so parent links are accepted only
 * when both records belong to the same domain; incomplete, self-referencing,
 * and cyclic links remain visible as roots.
 *
 * The domain NAME comes from the domains list, not from the category: the
 * projection is flat (`materialDomainId` + `name`), with no nested domain
 * reference to read a label off. A category whose domain is missing from
 * `domains` still gets its own section — identified by its `materialDomainId` —
 * so no contract response entry disappears.
 */
export function buildMaterialCategoryTree(
  categories: readonly MaterialCategory[],
  domains: readonly MaterialDomain[] = [],
): MaterialCategoryDomainTree[] {
  const domainNamesById = new Map(domains.map((domain) => [domain.id, domain.name]))
  const byDomain = new Map<string, MaterialCategory[]>()
  for (const category of categories) {
    const domainCategories = byDomain.get(category.materialDomainId) ?? []
    domainCategories.push(category)
    byDomain.set(category.materialDomainId, domainCategories)
  }

  const domains_ = new Map<string, MaterialCategoryDomainTree>()
  for (const category of categories) {
    if (!domains_.has(category.materialDomainId)) {
      domains_.set(category.materialDomainId, {
        domainId: category.materialDomainId,
        domainName: domainNamesById.get(category.materialDomainId) ?? '',
        nodes: [],
      })
    }
  }

  for (const [domainId, domainCategories] of byDomain) {
    const domain = domains_.get(domainId)
    if (domain === undefined) continue

    domain.nodes.push(
      ...toCategoryNodes(
        buildHierarchyForest(
          domainCategories,
          (category) => category.id,
          (category) => category.parentCategoryId,
        ),
      ),
    )
  }

  return [...domains_.values()]
}

/**
 * Keeps matching categories and their in-domain ancestors visible in a tree
 * search.
 *
 * The match runs on the record's own `name` and `code` only. The domain label
 * used to be matchable through the nested reference the retired snapshot
 * described; the flat projection carries no such field, and searching the
 * domains list here would filter the TREE by a column it does not render.
 */
export function filterMaterialCategories(
  categories: readonly MaterialCategory[],
  search: string,
): readonly MaterialCategory[] {
  const normalizedSearch = search.trim().toLocaleLowerCase('ar')
  if (normalizedSearch === '') return categories

  const categoriesById = new Map(categories.map((category) => [category.id, category]))
  const includedIds = new Set<string>()

  for (const category of categories) {
    const matches = [category.name, category.code]
      .filter((value): value is string => value !== undefined && value !== null)
      .some((value) => value.toLocaleLowerCase('ar').includes(normalizedSearch))

    if (!matches) continue

    let current: MaterialCategory | undefined = category
    const pathIds = new Set<string>()
    while (current !== undefined && !pathIds.has(current.id)) {
      includedIds.add(current.id)
      pathIds.add(current.id)

      const parentId: string | null | undefined = current.parentCategoryId
      const parent: MaterialCategory | undefined =
        parentId === undefined || parentId === null ? undefined : categoriesById.get(parentId)
      current = parent?.materialDomainId === current.materialDomainId ? parent : undefined
    }
  }

  return categories.filter((category) => includedIds.has(category.id))
}
