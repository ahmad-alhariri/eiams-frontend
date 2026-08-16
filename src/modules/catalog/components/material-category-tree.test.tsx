import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MaterialCategoryTree } from '@/modules/catalog/components/material-category-tree'
import {
  buildMaterialCategoryTree,
  filterMaterialCategories,
} from '@/modules/catalog/components/material-category-tree.model'
import { createMaterialCategory, fixtureUuid } from '@/test/msw/factories'

describe('MaterialCategoryTree', () => {
  it('groups categories by their contract domain and derives parent-child links', () => {
    const domainId = fixtureUuid(20)
    const root = createMaterialCategory({
      categoryId: fixtureUuid(21),
      domain: { id: domainId, displayName: 'تقنية المعلومات' },
      nameAr: 'الأجهزة',
    })
    const child = createMaterialCategory({
      categoryId: fixtureUuid(22),
      domain: root.domain,
      parentCategoryId: root.categoryId,
      nameAr: 'الحواسيب',
    })

    expect(buildMaterialCategoryTree([root, child])).toEqual([
      {
        domainId,
        domainName: 'تقنية المعلومات',
        nodes: [{ category: root, children: [{ category: child, children: [] }] }],
      },
    ])
  })

  it('keeps malformed parent references visible and never crosses domain boundaries', () => {
    const firstDomain = { id: fixtureUuid(20), displayName: 'تقنية المعلومات' }
    const secondDomain = { id: fixtureUuid(30), displayName: 'الخدمات' }
    const parentInOtherDomain = createMaterialCategory({
      categoryId: fixtureUuid(21),
      domain: firstDomain,
      nameAr: 'أجهزة تقنية',
    })
    const crossDomainChild = createMaterialCategory({
      categoryId: fixtureUuid(22),
      domain: secondDomain,
      parentCategoryId: parentInOtherDomain.categoryId,
      nameAr: 'خدمة مرتبطة خطأً',
    })
    const firstCycleMember = createMaterialCategory({
      categoryId: fixtureUuid(23),
      domain: firstDomain,
      parentCategoryId: fixtureUuid(24),
      nameAr: 'حلقة أ',
    })
    const secondCycleMember = createMaterialCategory({
      categoryId: fixtureUuid(24),
      domain: firstDomain,
      parentCategoryId: firstCycleMember.categoryId,
      nameAr: 'حلقة ب',
    })

    const tree = buildMaterialCategoryTree([
      parentInOtherDomain,
      crossDomainChild,
      firstCycleMember,
      secondCycleMember,
    ])
    const visibleIds = new Set<string>()
    const visit = (nodes: (typeof tree)[number]['nodes']) => {
      for (const node of nodes) {
        visibleIds.add(node.category.categoryId)
        visit(node.children)
      }
    }
    tree.forEach((domain) => visit(domain.nodes))

    expect(visibleIds).toEqual(
      new Set([
        parentInOtherDomain.categoryId,
        crossDomainChild.categoryId,
        firstCycleMember.categoryId,
        secondCycleMember.categoryId,
      ]),
    )
    expect(tree.find((domain) => domain.domainId === secondDomain.id)?.nodes).toEqual([
      { category: crossDomainChild, children: [] },
    ])
  })

  it('keeps matching category ancestors so search results retain their hierarchy', () => {
    const root = createMaterialCategory({ categoryId: fixtureUuid(21), nameAr: 'الأجهزة' })
    const child = createMaterialCategory({
      categoryId: fixtureUuid(22),
      parentCategoryId: root.categoryId,
      nameAr: 'الحواسيب المحمولة',
    })

    expect(filterMaterialCategories([root, child], 'محمولة')).toEqual([root, child])
  })

  it('supports keyboard-accessible expand and collapse controls', async () => {
    const user = userEvent.setup()
    const root = createMaterialCategory({ categoryId: fixtureUuid(21), nameAr: 'الأجهزة' })
    const child = createMaterialCategory({
      categoryId: fixtureUuid(22),
      parentCategoryId: root.categoryId,
      nameAr: 'الحواسيب',
    })

    render(<MaterialCategoryTree categories={[root, child]} />)

    const toggle = screen.getByRole('button', { name: 'طي الأجهزة' })
    expect(screen.getByText('الحواسيب')).toBeInTheDocument()
    await user.click(toggle)

    expect(screen.queryByText('الحواسيب')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'توسيع الأجهزة' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
