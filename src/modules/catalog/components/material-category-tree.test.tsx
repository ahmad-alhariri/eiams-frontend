import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { MaterialCategoryTree } from '@/modules/catalog/components/material-category-tree'
import {
  buildMaterialCategoryTree,
  filterMaterialCategories,
} from '@/modules/catalog/components/material-category-tree.model'
import type { MaterialCategory } from '@/modules/catalog/types/catalog.types'
import { fixtureUuid } from '@/test/msw/factories'

function makeCategory(overrides: Partial<MaterialCategory> = {}): MaterialCategory {
  return {
    materialCategoryId: fixtureUuid(21),
    code: 'CAT',
    nameAr: 'تصنيف',
    parentCategoryId: null,
    parentCategory: null,
    materialDomainId: fixtureUuid(20),
    materialDomain: { id: fixtureUuid(20), displayName: 'تقنية المعلومات' },
    status: 'Active',
    rowVersion: 1,
    ...overrides,
  }
}

describe('MaterialCategoryTree', () => {
  it('groups categories by their contract domain and derives parent-child links', () => {
    const domainId = fixtureUuid(20)
    const root = makeCategory({
      materialCategoryId: fixtureUuid(21),
      materialDomainId: domainId,
      nameAr: 'الأجهزة',
    })
    const child = makeCategory({
      materialCategoryId: fixtureUuid(22),
      materialDomainId: domainId,
      parentCategoryId: root.materialCategoryId,
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
    const firstDomainId = fixtureUuid(20)
    const secondDomainId = fixtureUuid(30)
    const parentInOtherDomain = makeCategory({
      materialCategoryId: fixtureUuid(21),
      materialDomainId: firstDomainId,
      materialDomain: { id: firstDomainId, displayName: 'تقنية المعلومات' },
      nameAr: 'أجهزة تقنية',
    })
    const crossDomainChild = makeCategory({
      materialCategoryId: fixtureUuid(22),
      materialDomainId: secondDomainId,
      materialDomain: { id: secondDomainId, displayName: 'الخدمات' },
      parentCategoryId: parentInOtherDomain.materialCategoryId,
      nameAr: 'خدمة مرتبطة خطأً',
    })
    const firstCycleMember = makeCategory({
      materialCategoryId: fixtureUuid(23),
      materialDomainId: firstDomainId,
      parentCategoryId: fixtureUuid(24),
      nameAr: 'حلقة أ',
    })
    const secondCycleMember = makeCategory({
      materialCategoryId: fixtureUuid(24),
      materialDomainId: firstDomainId,
      parentCategoryId: firstCycleMember.materialCategoryId,
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
        visibleIds.add(node.category.materialCategoryId)
        visit(node.children)
      }
    }
    tree.forEach((domain) => visit(domain.nodes))

    expect(visibleIds).toEqual(
      new Set([
        parentInOtherDomain.materialCategoryId,
        crossDomainChild.materialCategoryId,
        firstCycleMember.materialCategoryId,
        secondCycleMember.materialCategoryId,
      ]),
    )
    expect(tree.find((domain) => domain.domainId === secondDomainId)?.nodes).toEqual([
      { category: crossDomainChild, children: [] },
    ])
  })

  it('keeps matching category ancestors so search results retain their hierarchy', () => {
    const root = makeCategory({ materialCategoryId: fixtureUuid(21), nameAr: 'الأجهزة' })
    const child = makeCategory({
      materialCategoryId: fixtureUuid(22),
      parentCategoryId: root.materialCategoryId,
      nameAr: 'الحواسيب المحمولة',
    })

    expect(filterMaterialCategories([root, child], 'محمولة')).toEqual([root, child])
  })

  it('supports keyboard-accessible expand and collapse controls', async () => {
    const user = userEvent.setup()
    const root = makeCategory({ materialCategoryId: fixtureUuid(21), nameAr: 'الأجهزة' })
    const child = makeCategory({
      materialCategoryId: fixtureUuid(22),
      parentCategoryId: root.materialCategoryId,
      nameAr: 'الحواسيب',
    })

    render(<MaterialCategoryTree categories={[root, child]} />)

    await user.click(screen.getByRole('button', { name: /الأجهزة/ }))
    expect(screen.getByText('الحواسيب')).toBeInTheDocument()
  })
})
