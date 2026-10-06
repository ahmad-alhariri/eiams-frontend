import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { OrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree'
import { buildOrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree.model'
import type { OrganizationalUnit } from '@/modules/organization/types/organization.types'
import { fixtureUuid } from '@/test/msw/factories'

const SITE_ID = fixtureUuid(50)

/**
 * A unit in the REAL wire shape: `id`, `name`, `unitType`, `parentId`. The
 * shared `createOrganizationalUnit` factory still returns the fiction
 * (`orgUnitId`, `nameAr`, `parentOrgUnitId`, `code`, `rowVersion`), which is why
 * the tree builder keyed its map on `undefined` and flattened every hierarchy
 * into a list of roots.
 */
function wireUnit(overrides: Partial<OrganizationalUnit> = {}): OrganizationalUnit {
  return {
    id: fixtureUuid(1),
    siteId: SITE_ID,
    parentId: null,
    name: 'الإدارة العامة',
    unitType: 'Department',
    status: 'Active',
    ...overrides,
  }
}

describe('OrganizationalUnitTree', () => {
  it('derives parent-child relationships from the contract `parentId` reference', () => {
    const root = wireUnit({ id: fixtureUuid(1), name: 'الإدارة العامة' })
    const child = wireUnit({
      id: fixtureUuid(2),
      parentId: root.id,
      name: 'مديرية الشؤون الإدارية',
      unitType: 'Section',
    })

    expect(buildOrganizationalUnitTree([root, child])).toEqual([
      { data: root, children: [{ data: child, children: [] }] },
    ])
  })

  it('nests a grandchild under the unit it actually belongs to', () => {
    const root = wireUnit({ id: fixtureUuid(1) })
    const child = wireUnit({ id: fixtureUuid(2), parentId: root.id })
    const grandchild = wireUnit({ id: fixtureUuid(3), parentId: child.id })

    const tree = buildOrganizationalUnitTree([root, child, grandchild])

    expect(tree).toEqual([
      {
        data: root,
        children: [{ data: child, children: [{ data: grandchild, children: [] }] }],
      },
    ])
  })

  it('keeps units with incomplete or cyclic parent references visible', () => {
    const missingParent = wireUnit({
      id: fixtureUuid(3),
      parentId: fixtureUuid(99),
      name: 'وحدة مرجعها غير متاح',
    })
    const firstCycleMember = wireUnit({
      id: fixtureUuid(4),
      parentId: fixtureUuid(5),
      name: 'وحدة دورة أ',
    })
    const secondCycleMember = wireUnit({
      id: fixtureUuid(5),
      parentId: fixtureUuid(4),
      name: 'وحدة دورة ب',
    })

    const tree = buildOrganizationalUnitTree([missingParent, firstCycleMember, secondCycleMember])
    const visibleIds = new Set<string>()
    const visit = (nodes: typeof tree) => {
      for (const node of nodes) {
        visibleIds.add(node.data.id)
        visit(node.children)
      }
    }
    visit(tree)

    expect(visibleIds).toEqual(
      new Set([missingParent.id, firstCycleMember.id, secondCycleMember.id]),
    )
  })

  it('supports keyboard-accessible expand and collapse controls', async () => {
    const user = userEvent.setup()
    const root = wireUnit({ id: fixtureUuid(6), name: 'الإدارة العامة' })
    const child = wireUnit({
      id: fixtureUuid(7),
      parentId: root.id,
      name: 'الشؤون الإدارية',
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

  it('renders the wire `name` as the label and `unitType` as the secondary line', () => {
    const root = wireUnit({ id: fixtureUuid(8), name: 'مديرية مالية', unitType: 'Finance' })

    render(<OrganizationalUnitTree units={[root]} />)

    expect(screen.getByText('مديرية مالية')).toBeInTheDocument()
    expect(screen.getByText('Finance')).toBeInTheDocument()
  })
})
