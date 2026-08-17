import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OrganizationalUnitFormDialog } from '@/modules/organization/components/organizational-unit-form-dialog'
import {
  isInvalidOrganizationalUnitParent,
  toOrganizationalUnitRequest,
} from '@/modules/organization/schemas/organizational-unit.schemas'
import { createOrganizationalUnit, createPage, createSite, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'

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
  it('loads contract reference lists and submits selected identifiers rather than free text', async () => {
    const user = userEvent.setup()
    const site = createSite()
    const parent = createOrganizationalUnit({ orgUnitId: fixtureUuid(61), siteId: site.siteId })
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    server.use(
      http.get(`${API_BASE_URL}/sites`, () => HttpResponse.json(createPage([site]))),
      http.get(`${API_BASE_URL}/organizational-units`, () =>
        HttpResponse.json(createPage([parent])),
      ),
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
    await user.click(await screen.findByRole('option', { name: `${site.nameAr} (${site.code})` }))

    await user.type(within(dialog).getByLabelText('اسم الوحدة التنظيمية'), 'مديرية الموارد البشرية')
    await user.type(within(dialog).getByLabelText('رمز الوحدة'), 'DAM-HR')
    await user.click(within(dialog).getByRole('button', { name: 'إضافة الوحدة' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      siteId: site.siteId,
      parentOrgUnitId: '',
      nameAr: 'مديرية الموارد البشرية',
      code: 'DAM-HR',
      status: 'Active',
    })
  })

  it('maps an empty parent to omission and preserves row-version concurrency on updates', () => {
    const unit = createOrganizationalUnit({ rowVersion: 7 })

    expect(
      toOrganizationalUnitRequest(
        {
          siteId: unit.siteId,
          parentOrgUnitId: '',
          code: ' DAM-UPDATED ',
          nameAr: ' مديرية محدّثة ',
          status: 'Inactive',
        },
        unit,
      ),
    ).toEqual({
      siteId: unit.siteId,
      code: 'DAM-UPDATED',
      nameAr: 'مديرية محدّثة',
      status: 'Inactive',
      rowVersion: 7,
    })
  })

  it('blocks self, descendant, and cross-site parents when the contract list makes the conflict known', () => {
    const siteId = fixtureUuid(71)
    const root = createOrganizationalUnit({ orgUnitId: fixtureUuid(72), siteId })
    const child = createOrganizationalUnit({
      orgUnitId: fixtureUuid(73),
      siteId,
      parentOrgUnitId: root.orgUnitId,
    })
    const otherSite = createOrganizationalUnit({
      orgUnitId: fixtureUuid(74),
      siteId: fixtureUuid(75),
    })

    expect(isInvalidOrganizationalUnitParent(root.orgUnitId, siteId, root, [root, child])).toBe(
      true,
    )
    expect(isInvalidOrganizationalUnitParent(child.orgUnitId, siteId, root, [root, child])).toBe(
      true,
    )
    expect(
      isInvalidOrganizationalUnitParent(otherSite.orgUnitId, siteId, root, [
        root,
        child,
        otherSite,
      ]),
    ).toBe(true)
  })
})
