import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MaterialCategoryTree } from '@/modules/catalog/components/material-category-tree'
import {
  buildMaterialCategoryTree,
  filterMaterialCategories,
} from '@/modules/catalog/components/material-category-tree.model'
import type { MaterialCategory, MaterialDomain } from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

/**
 * Wire-shaped fixtures, minted locally.
 *
 * `@/test/msw/catalog-wire-fixtures` still mints the FROZEN GENERATED snapshot's
 * records (`materialCategoryId`, `nameAr`, a nested `materialDomain`
 * `NamedReference`, `rowVersion`) and no longer typechecks against
 * `catalog.api-types`. The projection is flat — `id`, `name`, `materialDomainId`
 * — so a category's domain NAME is only knowable from the domains list, which
 * is exactly what these builders take.
 */
function makeCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  return {
    id: fixtureUuid(21),
    code: 'CAT',
    name: 'تصنيف',
    materialDomainId: fixtureUuid(20),
    parentCategoryId: null,
    status: 'Active',
    ...overrides,
  }
}

function makeDomain(overrides: Partial<MaterialDomain> = {}): MaterialDomain {
  return {
    id: fixtureUuid(20),
    name: 'تقنية المعلومات',
    code: 'IT',
    status: 'Active',
    ...overrides,
  }
}

describe('MaterialCategoryTree', () => {
  it('groups categories by their contract domain and derives parent-child links', () => {
    const domain = makeDomain()
    const domainId = domain.id
    const root = makeCategory({ id: fixtureUuid(21), materialDomainId: domainId, name: 'الأجهزة' })
    const child = makeCategory({
      id: fixtureUuid(22),
      materialDomainId: domainId,
      parentCategoryId: root.id,
      name: 'الحواسيب',
    })

    expect(buildMaterialCategoryTree([root, child], [domain])).toEqual([
      {
        domainId,
        domainName: domain.name,
        nodes: [{ category: root, children: [{ category: child, children: [] }] }],
      },
    ])
  })

  it('keeps malformed parent references visible and never crosses domain boundaries', () => {
    const firstDomain = makeDomain({ id: fixtureUuid(20) })
    const secondDomain = makeDomain({ id: fixtureUuid(30), name: 'الخدمات', code: 'SVC' })
    const parentInOtherDomain = makeCategory({
      id: fixtureUuid(21),
      materialDomainId: firstDomain.id,
      name: 'أجهزة تقنية',
    })
    const crossDomainChild = makeCategory({
      id: fixtureUuid(22),
      materialDomainId: secondDomain.id,
      parentCategoryId: parentInOtherDomain.id,
      name: 'خدمة مرتبطة خطأً',
    })
    const firstCycleMember = makeCategory({
      id: fixtureUuid(23),
      materialDomainId: firstDomain.id,
      parentCategoryId: fixtureUuid(24),
      name: 'حلقة أ',
    })
    const secondCycleMember = makeCategory({
      id: fixtureUuid(24),
      materialDomainId: firstDomain.id,
      parentCategoryId: firstCycleMember.id,
      name: 'حلقة ب',
    })

    const tree = buildMaterialCategoryTree(
      [parentInOtherDomain, crossDomainChild, firstCycleMember, secondCycleMember],
      [firstDomain, secondDomain],
    )
    const visibleIds = new Set<string>()
    const visit = (nodes: (typeof tree)[number]['nodes']) => {
      for (const node of nodes) {
        visibleIds.add(node.category.id)
        visit(node.children)
      }
    }
    tree.forEach((domain) => visit(domain.nodes))

    expect(visibleIds).toEqual(
      new Set([
        parentInOtherDomain.id,
        crossDomainChild.id,
        firstCycleMember.id,
        secondCycleMember.id,
      ]),
    )
    expect(tree.find((domain) => domain.domainId === secondDomain.id)?.nodes).toEqual([
      { category: crossDomainChild, children: [] },
    ])
  })

  it('keeps matching category ancestors so search results retain their hierarchy', () => {
    const root = makeCategory({ id: fixtureUuid(21), name: 'الأجهزة' })
    const child = makeCategory({
      id: fixtureUuid(22),
      parentCategoryId: root.id,
      name: 'الحواسيب المحمولة',
    })

    expect(filterMaterialCategories([root, child], 'محمولة')).toEqual([root, child])
  })

  it('supports keyboard-accessible expand and collapse controls', async () => {
    const user = userEvent.setup()
    const domain = makeDomain()
    const root = makeCategory({ id: fixtureUuid(21), name: 'الأجهزة', materialDomainId: domain.id })
    const child = makeCategory({
      id: fixtureUuid(22),
      materialDomainId: domain.id,
      parentCategoryId: root.id,
      name: 'الحواسيب',
    })

    render(<MaterialCategoryTree categories={[root, child]} domains={[domain]} />)

    // The shared `HierarchyTree` starts EXPANDED — every descendant is reachable
    // without interaction, which is what makes a category's parent chain
    // readable on first paint. So the first toggle a reader reaches is the
    // COLLAPSE action, and asserting the child appears only after a click would
    // be asserting a collapsed-by-default tree this component does not render.
    const collapseToggle = screen.getByRole('button', { name: 'طي الأجهزة' })
    expect(collapseToggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('الحواسيب')).toBeInTheDocument()

    await user.click(collapseToggle)

    const expandToggle = screen.getByRole('button', { name: 'توسيع الأجهزة' })
    expect(expandToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('الحواسيب')).not.toBeInTheDocument()

    await user.click(expandToggle)

    expect(screen.getByText('الحواسيب')).toBeInTheDocument()
  })

  it('offers a per-row activate/deactivate action that the page gates on catalog.manage', async () => {
    const user = userEvent.setup()
    const domain = makeDomain()
    const onToggleStatus = vi.fn()
    const root = makeCategory({ id: fixtureUuid(21), name: 'الأجهزة', materialDomainId: domain.id })

    render(
      <MaterialCategoryTree
        categories={[root]}
        domains={[domain]}
        onToggleStatus={onToggleStatus}
      />,
    )

    // The button offers the direction the row ACTUALLY needs, read off
    // `getStatus`, so an active row is offered deactivation and not activation.
    await user.click(screen.getByRole('button', { name: 'تعطيل الأجهزة' }))
    expect(onToggleStatus).toHaveBeenCalledWith(root)
  })
})
