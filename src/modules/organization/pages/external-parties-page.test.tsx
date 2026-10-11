import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import ExternalPartiesPage from '@/modules/organization/pages/external-parties-page'
import { createQueryClient } from '@/shared/services/query.client'
import { Toaster } from '@/shared/ui/toaster'
import { apiJson, errJson, okPageJson } from '@/test/msw/envelope'
import { createExternalParty } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const scope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))
const permissions = vi.hoisted(() => ({ canManage: false }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: scope.key }),
}))

vi.mock('@/modules/auth/hooks/use-permission', () => ({
  usePermission: () => ({
    has: (code: string) => code === 'organization.manage' && permissions.canManage,
  }),
}))

const API_BASE_URL = '/api/v1'

function PageWrapper({ children }: PropsWithChildren) {
  return (
    <MemoryRouter>
      <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>
    </MemoryRouter>
  )
}

function retryFreeWrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        {children}
        <Toaster />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

afterEach(() => {
  permissions.canManage = false
})

describe('ExternalPartiesPage', () => {
  it('shows active and inactive records but hides write actions without organization.manage', async () => {
    permissions.canManage = false
    const activeParty = createExternalParty({ nameAr: 'جهة نشطة', status: 'Active' })
    const inactiveParty = createExternalParty({
      id: '00000000-0000-4000-8000-000000000055',
      nameAr: 'جهة معطلة',
      status: 'Inactive',
    })
    let receivedPage: string | null = null
    server.use(
      http.get(`${API_BASE_URL}/external-parties`, ({ request }) => {
        receivedPage = new URL(request.url).searchParams.get('page')
        return okPageJson([activeParty, inactiveParty])
      }),
    )

    render(<ExternalPartiesPage />, { wrapper: PageWrapper })

    await waitFor(() => expect(screen.getByText('جهة نشطة')).toBeInTheDocument())
    expect(screen.getByText('جهة معطلة')).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إضافة جهة خارجية' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /تعطيل/ })).not.toBeInTheDocument()
    // One-based wire page: the table control's page IS the server's page, so
    // `page=0` (a 400 REQUEST_VALIDATION_FAILED on every load) is no longer
    // expressible from this screen.
    expect(receivedPage).toBe('1')
  })

  it('deactivates a party through the status route with the required version guard', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const party = createExternalParty({ nameAr: 'جهة قابلة للتعطيل', rowVersion: 3 })
    const receivedBodies: unknown[] = []
    let requestedMethod: string | null = null
    let requestedPath: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/external-parties`, () => okPageJson([party])),
      http.put(`${API_BASE_URL}/external-parties/${party.id}/status`, async ({ request }) => {
        requestedMethod = request.method
        requestedPath = new URL(request.url).pathname
        receivedBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<ExternalPartiesPage />, { wrapper: retryFreeWrapper })

    await user.click(await screen.findByRole('button', { name: `تعطيل ${party.nameAr}` }))
    await user.click(await screen.findByRole('button', { name: 'تعطيل الجهة' }))

    await waitFor(() => expect(receivedBodies).toHaveLength(1))
    // There is NO `POST /external-parties/{id}/deactivate` route to call; the
    // only status command is `PUT .../status`, and it binds BOTH members as
    // required — the ordinal (`Inactive` → 1), not the `"Inactive"` string the
    // projection serves, and the `rowVersion` the row was read with.
    expect(requestedMethod).toBe('PUT')
    expect(requestedPath).toBe(`/api/v1/external-parties/${party.id}/status`)
    expect(receivedBodies).toEqual([{ status: 1, expectedRowVersion: 3 }])
    expect(
      await screen.findByText('تم تعطيل الجهة الخارجية مع الاحتفاظ بالمراجع السابقة.'),
    ).toBeInTheDocument()
  })

  it('answers a row-version conflict with the recovery dialog instead of the generic toast', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const party = createExternalParty({ nameAr: 'جهة متعارضة', rowVersion: 3 })
    let statusRequests = 0

    server.use(
      http.get(`${API_BASE_URL}/external-parties`, () => okPageJson([party])),
      http.put(`${API_BASE_URL}/external-parties/${party.id}/status`, () => {
        statusRequests += 1
        return errJson(409, {
          code: 'EXTERNAL_PARTIES_ROW_VERSION_MISMATCH',
          message: 'The external party was modified concurrently.',
          details: {
            external_party_id: party.id,
            expected_row_version: 3,
            current_row_version: 4,
          },
        })
      }),
    )

    render(<ExternalPartiesPage />, { wrapper: retryFreeWrapper })

    await user.click(await screen.findByRole('button', { name: `تعطيل ${party.nameAr}` }))
    await user.click(await screen.findByRole('button', { name: 'تعطيل الجهة' }))

    // The recovery dialog, not the generic api-error toast whose advice is to
    // refresh the page — which would discard the version this flow holds.
    const dialog = await screen.findByRole('alertdialog', { name: 'تغيّرت البيانات لدى خادم' })
    expect(statusRequests).toBe(1)
    expect(dialog).toHaveTextContent('لم يحدّد الخادم ما إذا كانت العملية قد نُفّذت')
    expect(await screen.findByRole('button', { name: 'تحميل النسخة الحالية' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'تعطيل الجهة' })).not.toBeInTheDocument()

    // Recovering reloads the list and closes both dialogs, so the next attempt
    // carries a version the server actually has.
    await user.click(screen.getByRole('button', { name: 'تحميل النسخة الحالية' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('alertdialog', { name: 'تغيّرت البيانات لدى خادف' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('sends only the permitted create body and keeps the version guard on update', async () => {
    permissions.canManage = true
    const user = userEvent.setup()
    const party = createExternalParty({ nameAr: 'جهة للتحرير', rowVersion: 7 })
    const receivedBodies: unknown[] = []

    server.use(
      http.get(`${API_BASE_URL}/external-parties`, () => okPageJson([party])),
      http.post(`${API_BASE_URL}/external-parties`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return apiJson({ id: party.id }, { status: 201 })
      }),
      http.put(`${API_BASE_URL}/external-parties/${party.id}`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<ExternalPartiesPage />, { wrapper: retryFreeWrapper })

    await user.click(await screen.findByRole('button', { name: 'إضافة جهة خارجية' }))
    await user.type(screen.getByLabelText('اسم الجهة'), 'جهة جديدة')
    await user.click(screen.getByRole('button', { name: 'إضافة الجهة' }))
    await waitFor(() => expect(receivedBodies).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: `تعديل ${party.nameAr}` }))
    const nameInput = screen.getByLabelText('اسم الجهة')
    await user.clear(nameInput)
    await user.type(nameInput, 'الجهة بعد التعديل')
    await user.click(screen.getByRole('button', { name: 'حفظ التعديلات' }))
    await waitFor(() => expect(receivedBodies).toHaveLength(2))

    // `POST /external-parties` binds `additionalProperties: false` over exactly
    // {nameAr, code, contactInfo, notes}. The retired schema defaulted
    // `rowVersion ?? 0` and copied the record's `status` string in, so a create
    // was rejected by the binder for reasons nothing on screen could explain.
    expect(receivedBodies[0]).toEqual({
      nameAr: 'جهة جديدة',
      code: null,
      contactInfo: null,
      notes: null,
    })
    for (const body of receivedBodies) {
      expect(body).not.toHaveProperty('rowVersion')
      expect(body).not.toHaveProperty('status')
    }
    // Update additionally carries the REQUIRED guard, echoing the version the
    // list row served — verbatim, never renumbered and never 0.
    expect(receivedBodies[1]).toEqual({
      nameAr: 'الجهة بعد التعديل',
      code: party.code,
      contactInfo: party.contactInfo,
      notes: party.notes,
      expectedRowVersion: 7,
    })
  })
})
