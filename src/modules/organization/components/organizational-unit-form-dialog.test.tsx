import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrganizationalUnitFormDialog } from '@/modules/organization/components/organizational-unit-form-dialog'
import {
  isInvalidOrganizationalUnitParent,
  toCreateOrganizationalUnitRequest,
  toUpdateOrganizationalUnitRequest,
} from '@/modules/organization/schemas/organizational-unit.schemas'
import type { OrganizationalUnit, Site } from '@/modules/organization/types/organization.types'
import { okPageJson } from '@/test/msw/envelope'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

const SITE_ID = fixtureUuid(50)
const ROOT_ID = fixtureUuid(52)
const CHILD_ID = fixtureUuid(53)
const GRANDCHILD_ID = fixtureUuid(54)

/**
 * Fixtures in the REAL wire shape, built locally because the shared
 * `createSite` / `createOrganizationalUnit` factories still return the fiction
 * (`siteId`, `orgUnitId`, `nameAr`, `code`, `rowVersion`). The identifier is
 * `id`, the label is `name`, and the parent link is `parentId`.
 */
function wireSite(overrides: Partial<Site> = {}): Site {
  return {
    id: SITE_ID,
    organizationId: fixtureUuid(51),
    name: 'المقر الرئيسي',
    code: 'DAM-HQ',
    location: 'دمشق',
    governorateCode: 'DIM',
    status: 'Active',
    ...overrides,
  }
}

function wireUnit(overrides: Partial<OrganizationalUnit> = {}): OrganizationalUnit {
  return {
    id: ROOT_ID,
    siteId: SITE_ID,
    parentId: null,
    name: 'الإدارة العامة',
    unitType: 'Department',
    status: 'Active',
    ...overrides,
  }
}

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('OrganizationalUnitFormDialog', () => {
  it('submits the create body the backend binds: siteId, parentId, name and unitType', async () => {
    const user = userEvent.setup()
    const site = wireSite()
    const parent = wireUnit({ id: fixtureUuid(61) })
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([site])),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([parent])),
    )

    render(
      <OrganizationalUnitFormDialog
        open
        unit={null}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    const siteSelect = within(dialog).getByLabelText('الموقع')
    await waitFor(() => expect(siteSelect).toBeEnabled())
    await user.click(siteSelect)
    await user.click(await screen.findByRole('option', { name: `${site.code} — ${site.name}` }))

    await user.type(within(dialog).getByLabelText('اسم الوحدة التنظيمية'), 'مديرية الموارد البشرية')
    await user.type(within(dialog).getByLabelText('نوع الوحدة التنظيمية'), 'Department')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة الوحدة' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      siteId: site.id,
      parentId: '',
      name: 'مديرية الموارد البشرية',
      unitType: 'Department',
    })

    // `toCreateOrganizationalUnitRequest` maps the empty parent to an explicit
    // root (`null`) and sends nothing the create body does not bind.
    expect(toCreateOrganizationalUnitRequest(onSubmit.mock.calls[0]![0])).toEqual({
      siteId: site.id,
      parentId: null,
      name: 'مديرية الموارد البشرية',
      unitType: 'Department',
    })
  })

  it('locks the site and the parent on edit, because the update body binds neither', async () => {
    const user = userEvent.setup()
    const unit = wireUnit({ id: CHILD_ID, parentId: ROOT_ID, name: 'الشؤون الإدارية' })
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => okPageJson([wireSite()])),
      http.get(`${API_BASE_URL}/organizational-units`, () => okPageJson([wireUnit(), unit])),
    )

    render(
      <OrganizationalUnitFormDialog
        open
        unit={unit}
        isPending={false}
        onOpenChange={vi.fn()}
        onSubmit={onSubmit}
      />,
      { wrapper: createWrapper() },
    )

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByLabelText('اسم الوحدة التنظيمية')).toBeEnabled())

    expect(within(dialog).getByLabelText('الموقع')).toBeDisabled()
    expect(within(dialog).getByLabelText('الوحدة الأب')).toBeDisabled()

    const nameInput = within(dialog).getByLabelText('اسم الوحدة التنظيمية')
    await user.clear(nameInput)
    await user.type(nameInput, 'الشؤون الإدارية المحدّثة')
    await user.click(within(dialog).getByRole('button', { name: 'حفظ التعديلات' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    const values = onSubmit.mock.calls[0]![0]
    expect(toUpdateOrganizationalUnitRequest(values)).toEqual({
      name: 'الشؤون الإدارية المحدّثة',
      unitType: 'Department',
    })
    expect(toUpdateOrganizationalUnitRequest(values)).not.toHaveProperty('siteId')
    expect(toUpdateOrganizationalUnitRequest(values)).not.toHaveProperty('parentId')
  })

  it('drops the create-only fields from the update body and the row-version-free fields entirely', () => {
    const updateRequest = toUpdateOrganizationalUnitRequest({
      siteId: SITE_ID,
      parentId: ROOT_ID,
      name: 'مديرية محدّثة',
      unitType: 'Section',
    })

    expect(Object.keys(updateRequest).sort()).toEqual(['name', 'unitType'])
    // Neither a status nor a concurrency token: the update route binds neither,
    // and the aggregate is not versioned.
    expect(updateRequest).not.toHaveProperty('status')
    expect(updateRequest).not.toHaveProperty('rowVersion')
    expect(updateRequest).not.toHaveProperty('code')
    expect(updateRequest).not.toHaveProperty('siteId')
    expect(updateRequest).not.toHaveProperty('parentId')
  })

  it('rejects a unit as its own parent and rejects a descendant as a parent', () => {
    // root → child → grandchild
    const root = wireUnit({ id: ROOT_ID, parentId: null })
    const child = wireUnit({ id: CHILD_ID, parentId: ROOT_ID })
    const grandchild = wireUnit({ id: GRANDCHILD_ID, parentId: CHILD_ID })
    const all = [root, child, grandchild]

    expect(isInvalidOrganizationalUnitParent(root, root, all)).toBe(true)
    expect(isInvalidOrganizationalUnitParent(root, child, all)).toBe(true)
    expect(isInvalidOrganizationalUnitParent(root, grandchild, all)).toBe(true)
    expect(isInvalidOrganizationalUnitParent(child, grandchild, all)).toBe(true)

    // A legitimate ancestor stays selectable: grandchild → root skips one level
    // and is not a cycle.
    expect(isInvalidOrganizationalUnitParent(grandchild, root, all)).toBe(false)
    // A unit that does not exist yet (CREATE mode) cannot be part of a cycle.
    expect(isInvalidOrganizationalUnitParent(null, root, all)).toBe(false)
    expect(isInvalidOrganizationalUnitParent(null, child, all)).toBe(false)
  })

  it('rejects a parent already held by the unit, and refuses to loop on pre-existing cyclic data', () => {
    const root = wireUnit({ id: ROOT_ID, parentId: null })
    const child = wireUnit({ id: CHILD_ID, parentId: ROOT_ID })
    const all = [root, child]

    // Selecting the current parent is a no-op, not a re-parent.
    expect(isInvalidOrganizationalUnitParent(child, root, all)).toBe(true)

    // Two units already pointing at each other: the walk must terminate.
    const firstCycleMember = wireUnit({ id: fixtureUuid(4), parentId: fixtureUuid(5) })
    const secondCycleMember = wireUnit({ id: fixtureUuid(5), parentId: fixtureUuid(4) })
    expect(
      isInvalidOrganizationalUnitParent(firstCycleMember, secondCycleMember, [
        firstCycleMember,
        secondCycleMember,
      ]),
    ).toBe(true)
  })
})
