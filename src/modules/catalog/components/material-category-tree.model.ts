import { buildHierarchyForest, type HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'
import type { MaterialCategory } from '@/shared/types/generated/eiams-v1'

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
 * Builds a resilient, domain-aware hierarchy from the flat v1 category list.
 * Each domain is built as its own forest, so parent links are accepted only
 * when both records belong to the same domain; incomplete, self-referencing,
 * and cyclic links remain visible as roots.
 */
export function buildMaterialCategoryTree(
  categories: readonly MaterialCategory[],
): MaterialCategoryDomainTree[] {
  const byDomain = new Map<string, MaterialCategory[]>()
  for (const category of categories) {
    const domainCategories = byDomain.get(category.domain.id) ?? []
    domainCategories.push(category)
    byDomain.set(category.domain.id, domainCategories)
  }

  const domains = new Map<string, MaterialCategoryDomainTree>()
  for (const category of categories) {
    if (!domains.has(category.domain.id)) {
      domains.set(category.domain.id, {
        domainId: category.domain.id,
        domainName: category.domain.displayName,
        nodes: [],
      })
    }
  }

  for (const [domainId, domainCategories] of byDomain) {
    const domain = domains.get(domainId)
    if (domain === undefined) continue

    domain.nodes.push(
      ...toCategoryNodes(
        buildHierarchyForest(
          domainCategories,
          (category) => category.categoryId,
          (category) => category.parentCategoryId,
        ),
      ),
    )
  }

  return [...domains.values()]
}

/** Keeps matching categories and their in-domain ancestors visible in a tree search. */
export function filterMaterialCategories(
  categories: readonly MaterialCategory[],
  search: string,
): readonly MaterialCategory[] {
  const normalizedSearch = search.trim().toLocaleLowerCase('ar')
  if (normalizedSearch === '') return categories

  const categoriesById = new Map(categories.map((category) => [category.categoryId, category]))
  const includedIds = new Set<string>()

  for (const category of categories) {
    const matches = [
      category.nameAr,
      category.code,
      category.pathDisplay,
      category.domain.displayName,
    ]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLocaleLowerCase('ar').includes(normalizedSearch))

    if (!matches) continue

    let current: MaterialCategory | undefined = category
    const pathIds = new Set<string>()
    while (current !== undefined && !pathIds.has(current.categoryId)) {
      includedIds.add(current.categoryId)
      pathIds.add(current.categoryId)

      const parentId: string | undefined = current.parentCategoryId
      const parent: MaterialCategory | undefined =
        parentId === undefined ? undefined : categoriesById.get(parentId)
      current = parent?.domain.id === current.domain.id ? parent : undefined
    }
  }

  return categories.filter((category) => includedIds.has(category.categoryId))
}
