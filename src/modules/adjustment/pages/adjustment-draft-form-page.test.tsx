import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import AdjustmentDraftFormPage from './adjustment-draft-form-page'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { server } from '@/test/msw/server'
import type {
  InventoryAdjustment,
  InventoryCountLinePage,
  SessionResponse,
} from '@/shared/types/generated/eiams-v1'

const COUNT_ID = '223e4567-e89b-42d3-a456-426614174002'

/** Serves the count-lines query the page now runs before seeding variance rows. */
function useCountLinesHandler() {
  server.use(
    http.get(`*/api/v1/inventory-counts/${COUNT_ID}/lines`, () =>
      HttpResponse.json<InventoryCountLinePage>({
        items: [
          {
            countLineId: 'a23e4567-e89b-42d3-a456-426614174001',
            difference: -2,
            material: { id: MATERIAL_ID, displayName: 'حاسوب مكتبي' },
            reason: null,
            rowVersion: 1,
            snapshotQuantity: 25,
            actualQuantity: 23,
          },
          {
            countLineId: 'b23e4567-e89b-42d3-a456-426614174002',
            difference: 0,
            material: { id: '743e4567-e89b-42d3-a456-426614174008', displayName: 'ورق تصوير A4' },
            reason: null,
            rowVersion: 1,
            snapshotQuantity: 10,
            actualQuantity: 10,
          },
        ],
        meta: { pageIndex: 0, pageSize: 200, totalItems: 2, totalPages: 1 },
      }),
    ),
  )
}

vi.mock('@/modules/warehouse/hooks/use-scoped-warehouse-selector', () => ({
  useScopedWarehouseSelector: () => ({
    scopeReady: true,
    loadOptions: vi.fn().mockImplementation((search: string) =>
      Promise.resolve(
        [
          { value: '823e4567-e89b-42d3-a456-426614174008', label: 'المستودع المركزي', payload: {} },
          { value: '833e4567-e89b-42d3-a456-426614174009', label: 'مستودع الفرع', payload: {} },
        ]
          .filter((option) => option.label.includes(search ?? ''))
          .map((option) => ({ ...option })),
      ),
    ),
  }),
}))

vi.mock('@/modules/catalog/hooks/use-scoped-material-selector', () => ({
  useScopedMaterialSelector: () => ({
    scopeReady: true,
    loadOptions: vi.fn().mockImplementation((search: string) =>
      Promise.resolve(
        [
          {
            value: '723e4567-e89b-42d3-a456-426614174007',
            label: 'حاسوب مكتبي',
            payload: { nameAr: 'حاسوب مكتبي' },
          },
          {
            value: '743e4567-e89b-42d3-a456-426614174008',
            label: 'ورق تصوير A4',
            payload: { nameAr: 'ورق تصوير A4' },
          },
        ]
          .filter((option) => option.label.includes(search ?? ''))
          .map((option) => ({ ...option })),
      ),
    ),
  }),
}))

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const WAREHOUSE_ID = '823e4567-e89b-42d3-a456-426614174008'
const MATERIAL_ID = '723e4567-e89b-42d3-a456-426614174007'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'adjustment.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [
      {
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      },
    ],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

let capturedCreateBody: unknown = null

function useCreateHandler() {
  capturedCreateBody = null
  server.use(
    http.post('*/api/v1/adjustments', async ({ request }) => {
      capturedCreateBody = await request.json()
      return HttpResponse.json<InventoryAdjustment>(
        {
          adjustmentId: '423e4567-e89b-42d3-a456-426614174004',
          countReference: null,
          createdAt: '2026-08-26T08:00:00.000Z',
          createdBy: { id: fixtureUserId(), displayName: 'مدير المستودع' },
          documentId: '523e4567-e89b-42d3-a456-426614174005',
          documentReference: 'EIAMS-ADJ-DRAFT-0001',
          lines: [],
          policy: {
            actions: [],
            advisories: [],
            blockers: [],
            documentId: '523e4567-e89b-42d3-a456-426614174005',
            documentStatus: 'Draft',
            evaluatedAt: '2026-08-26T08:00:00.000Z',
            policyKind: 'Adjustment',
            rowVersion: 0,
            signedOriginalSatisfied: false,
          },
          postedAt: null,
          purpose: 'DirectCorrection',
          reason: 'تصحيح',
          rowVersion: 0,
          status: 'Draft',
          warehouse: {
            id: WAREHOUSE_ID,
            displayName: 'المستودع المركزي',
          },
        },
        { status: 201 },
      )
    }),
  )
}

function fixtureUserId(): string {
  return '923e4567-e89b-42d3-a456-426614174009'
}

function renderForm(initialEntry = '/adjustments/new') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(['document.view', 'document.create']))
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/adjustments/new" element={<AdjustmentDraftFormPage />} />
          <Route path="/adjustments" element={<p>القائمة</p>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function fillAndSubmitValidDirectCorrection(user: ReturnType<typeof userEvent.setup>) {
  // AsyncSelect is a type-to-search combobox: type ≥2 chars, wait for the
  // debounced load, then pick from the opened listbox.
  await user.type(screen.getByRole('combobox', { name: 'مستودع التسوية' }), 'المستودع')
  await user.click(await screen.findByRole('option', { name: /المستودع المركزي/ }))

  const reason = screen.getByLabelText('سبب التسوية')
  await user.type(reason, 'تصحيح خطأ إدخال')

  await user.type(screen.getByRole('combobox', { name: 'مادة البند 1' }), 'حاسوب')
  await user.click(await screen.findByRole('option', { name: /حاسوب مكتبي/ }))

  // jsdom sanitizes per-keystroke values on <input type=number>; set directly.
  fireEvent.change(screen.getByLabelText(/فرق الكمية/), { target: { value: '-2' } })
  await user.type(screen.getByLabelText('سبب الفرق'), 'عجز مرصود أثناء التدقيق')

  await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))
}

describe('AdjustmentDraftFormPage (e21-t04)', () => {
  it('renders a DirectCorrection draft by default with manager controls', async () => {
    renderForm()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'سند تسوية جديد' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('غرض التسوية')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إضافة بند' })).toBeInTheDocument()
  })

  it('locks purpose and warehouse when launched from a count session', async () => {
    useCountLinesHandler()
    renderForm(
      '/adjustments/new?countId=223e4567-e89b-42d3-a456-426614174002&purpose=CountVariance',
    )

    expect(await screen.findByText(/هذا السند مرتبط بجلسة الجرد/)).toBeInTheDocument()
    expect(screen.getByText(/الغرض مقفل وفق جلسة الجرد/)).toBeInTheDocument()
  })

  it('preseeds the locked warehouse from the launch deep-link (QA defect D3)', async () => {
    useCountLinesHandler()
    renderForm(
      '/adjustments/new?countId=223e4567-e89b-42d3-a456-426614174002&purpose=CountVariance&warehouseId=823e4567-e89b-42d3-a456-426614174008',
    )

    await screen.findByText(/هذا السند مرتبط بجلسة الجرد/)
    // The warehouse control is disabled but must already hold the launched
    // session's warehouse — otherwise a locked draft can never be saved.
    const trigger = screen.getByRole('combobox', { name: 'مستودع التسوية' })
    expect(trigger).toBeDisabled()
    expect((trigger as HTMLInputElement).value).toBe('823e4567-e89b-42d3-a456-426614174008')
  })

  it('seeds locked variance rows from the count session lines (QA defect D4)', async () => {
    useCountLinesHandler()
    renderForm(
      '/adjustments/new?countId=223e4567-e89b-42d3-a456-426614174002&purpose=CountVariance&warehouseId=823e4567-e89b-42d3-a456-426614174008',
    )

    await screen.findByText(/هذا السند مرتبط بجلسة الجرد/)
    // The seeded row renders read-only material + signed delta; only the
    // reason stays editable — and the form holds the seeded line in its
    // values, so submission will not fail with "lines: too_small".
    expect(await screen.findByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('-2')).toBeInTheDocument()
    expect(screen.getAllByLabelText('سبب الفرق')).toHaveLength(1)
  })

  it('never offers Disposal in the purpose dropdown (QA defect D1)', async () => {
    renderForm()
    const user = userEvent.setup()

    await user.click(screen.getByRole('combobox', { name: 'غرض التسوية' }))
    const listbox = await screen.findByRole('listbox')
    const options = Array.from(listbox.querySelectorAll('[role="option"]')).map(
      (option) => option.textContent,
    )
    expect(options).toEqual(['تسوية فروقات الجرد', 'تسوية مباشرة'])
    expect(options.join(' ')).not.toContain('إعدام أصل')
  })

  it('renders the Arabic purpose label on the closed Select trigger (QA defect D2)', async () => {
    renderForm()

    // Default DirectCorrection must show its Arabic label, never the enum.
    await screen.findByRole('heading', { level: 1, name: 'سند تسوية جديد' })
    const trigger = screen.getByRole('combobox', { name: 'غرض التسوية' })
    expect(trigger.textContent).toContain('تسوية مباشرة')
    expect(trigger.textContent).not.toContain('DirectCorrection')

    const user = userEvent.setup()
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: 'تسوية فروقات الجرد' }))
    expect(screen.getByRole('combobox', { name: 'غرض التسوية' }).textContent).toContain(
      'تسوية فروقات الجرد',
    )
  })

  it('shows the keeper denial state without document.create', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(authSessionQueryKey, sessionWith(['document.view']))
    render(
      <MemoryRouter initialEntries={['/adjustments/new']}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/adjustments/new" element={<AdjustmentDraftFormPage />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('غير مصرّح')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حفظ المسودة' })).toBeNull()
  })

  it('submits a valid DirectCorrection draft and navigates to the list', async () => {
    useCreateHandler()
    const user = userEvent.setup()
    renderForm()

    await fillAndSubmitValidDirectCorrection(user)

    await waitFor(
      () => {
        expect(capturedCreateBody).toMatchObject({
          warehouseId: WAREHOUSE_ID,
          purpose: 'DirectCorrection',
          reason: 'تصحيح خطأ إدخال',
          rowVersion: 0,
          lines: [
            {
              materialId: MATERIAL_ID,
              quantityDelta: -2,
              reason: 'عجز مرصود أثناء التدقيق',
            },
          ],
        })
        expect(capturedCreateBody).not.toHaveProperty('countId')
      },
      { timeout: 4000 },
    )
    await screen.findByText('القائمة')
  }, 20000)

  it('blocks submission when required fields are missing', async () => {
    useCreateHandler()
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: 'حفظ المسودة' }))

    await waitFor(() => {
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
    })
    expect(capturedCreateBody).toBeNull()
  })

  it('adds and removes line rows through the field array', async () => {
    renderForm()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    expect(screen.getByLabelText('مادة البند 2')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /إزالة البند/ })[1]!)
    expect(screen.queryByLabelText('مادة البند 2')).toBeNull()
  })
})
