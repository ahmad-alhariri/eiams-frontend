import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { OrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree'
import { buildOrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree.model'
import { createOrganizationalUnit, fixtureUuid } from '@/test/msw/factories'

describe('OrganizationalUnitTree', () => {
  it('derives parent-child relationships from the contract parent reference', () => {
    const root = createOrganizationalUnit({ orgUnitId: fixtureUuid(1), nameAr: 'الإدارة العامة' })
    const child = createOrganizationalUnit({
      orgUnitId: fixtureUuid(2),
      parentOrgUnitId: root.orgUnitId,
      nameAr: 'مديرية الشؤون الإدارية',
    })

    expect(buildOrganizationalUnitTree([root, child])).toEqual([
      { data: root, children: [{ data: child, children: [] }] },
    ])
  })

  it('keeps units with incomplete or cyclic parent references visible', () => {
    const missingParent = createOrganizationalUnit({
      orgUnitId: fixtureUuid(3),
      parentOrgUnitId: fixtureUuid(99),
      nameAr: 'وحدة مرجعها غير متاح',
    })
    const firstCycleMember = createOrganizationalUnit({
      orgUnitId: fixtureUuid(4),
      parentOrgUnitId: fixtureUuid(5),
      nameAr: 'وحدة دورة أ',
    })
    const secondCycleMember = createOrganizationalUnit({
      orgUnitId: fixtureUuid(5),
      parentOrgUnitId: fixtureUuid(4),
      nameAr: 'وحدة دورة ب',
    })

    const tree = buildOrganizationalUnitTree([missingParent, firstCycleMember, secondCycleMember])
    const visibleIds = new Set<string>()
    const visit = (nodes: typeof tree) => {
      for (const node of nodes) {
        visibleIds.add(node.data.orgUnitId)
        visit(node.children)
      }
    }
    visit(tree)

    expect(visibleIds).toEqual(
      new Set([missingParent.orgUnitId, firstCycleMember.orgUnitId, secondCycleMember.orgUnitId]),
    )
  })

  it('supports keyboard-accessible expand and collapse controls', async () => {
    const user = userEvent.setup()
    const root = createOrganizationalUnit({ orgUnitId: fixtureUuid(6), nameAr: 'الإدارة العامة' })
    const child = createOrganizationalUnit({
      orgUnitId: fixtureUuid(7),
      parentOrgUnitId: root.orgUnitId,
      nameAr: 'الشؤون الإدارية',
    })

    render(<OrganizationalUnitTree units={[root, child]} />)

    const toggle = screen.getByRole('button', { name: 'طي الإدارة العامة' })
    expect(screen.getByText('الشؤون الإدارية')).toBeInTheDocument()
    await user.click(toggle)

    expect(screen.queryByText('الشؤون الإدارية')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'توسيع الإدارة العامة' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })
})
