import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import CountPlanningFormPage from './count-planning-form-page'
import { createPage, createWarehouse } from '@/test/msw/factories'
import { server } from '@/test/msw/server'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '553e4567-e89b-42d3-a456-426614174005'
const COUNT_ID = '663e4567-e89b-42d3-a456-426614174006'

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'count.manager',
      displayName: 'مدير الجرد',
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

let postedBody: Record<string, unknown> | undefined
let postStatus = 201

function useHandlers() {
  postedBody = undefined
  postStatus = 201
  const warehouse = createWarehouse({ warehouseId: WAREHOUSE_ID, nameAr: 'المستودع المركزي' })
  server.use(
    http.get(`${API_BASE_URL}/warehouses`, () => HttpResponse.json(createPage([warehouse]))),
    http.post(`${API_BASE_URL}/inventory-counts`, async ({ request }) => {
      postedBody = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(
        {
          countId: COUNT_ID,
          referenceNumber: 'EIAMS-CNT-2026-0100',
          documentStatus: 'Planned',
          status: 'Planned',
          ...postedBody,
        },
        { status: postStatus },
      )
    }),
  )
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(authSessionQueryKey, sessionWith(['count.view', 'count.plan']))
  return render(
    <MemoryRouter initialEntries={['/counts/new']}>
      <QueryClientProvider client={client}>
        <Routes>
          <Route path="/counts/new" element={<CountPlanningFormPage />} />
          <Route
            path="/counts/:countId"
            element={<span data-testid="detail-stub">DETAIL-LANDING</span>}
          />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function selectOption(
  user: ReturnType<typeof userEvent.setup>,
  triggerLabel: string,
  optionText: string,
) {
  await new Promise((resolve) => setTimeout(resolve, 150))
  await user.click(screen.getByLabelText(triggerLabel))
  const options = await screen.findAllByRole('option')
  const target = options.find((option) => (option.textContent ?? '').includes(optionText))
  expect(target).toBeDefined()
  if (target) await user.click(target)
}

describe('CountPlanningFormPage (e20-t03)', () => {
  it('renders the planning fields with Arabic labels', async () => {
    useHandlers()
    renderPage()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'جلسة جرد جديدة' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('مستودع الجرد')).toBeInTheDocument()
    expect(screen.getByLabelText('نوع الجرد')).toBeInTheDocument()
    expect(screen.getByLabelText('نطاق الجرد')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تخطيط الجلسة' })).toBeInTheDocument()
  })

  it('blocks submission without warehouse, count type, and scope selections', async () => {
    useHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'جلسة جرد جديدة' })
    await user.click(screen.getByRole('button', { name: 'تخطيط الجلسة' }))

    // The scoped picker validates via its own required rule; enum fields show Arabic messages.
    expect(await screen.findByText('يجب اختيار نوع الجرد.')).toBeInTheDocument()
    expect(screen.getByText('يجب اختيار نطاق الجرد.')).toBeInTheDocument()
  }, 20000)

  it('plans a SoftFreeze session with the contract payload and navigates to detail', async () => {
    useHandlers()
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'جلسة جرد جديدة' })

    // Pick the source warehouse.
    const whCombo = screen.getByLabelText('مستودع الجرد')
    await user.click(whCombo)
    await user.type(whCombo, 'مركزي')
    const whOptions = await screen.findAllByRole('option')
    const whTarget = whOptions.find((o) => (o.textContent ?? '').includes('المستودع المركزي'))
    expect(whTarget).toBeDefined()
    if (whTarget) await user.click(whTarget)

    await selectOption(user, 'نوع الجرد', 'جرد جزئي')
    await selectOption(user, 'نطاق الجرد', 'حسب الصنف')
    await user.type(screen.getByLabelText('وصف النطاق (اختياري)'), 'أجهزة الحاسوب')

    await user.click(screen.getByRole('button', { name: 'تخطيط الجلسة' }))
    await waitFor(
      () => {
        expect(screen.getByTestId('detail-stub')).toBeInTheDocument()
      },
      { timeout: 8000 },
    )

    expect(postedBody?.['countType']).toBe('Partial')
    expect(postedBody?.['freezePolicy']).toBe('SoftFreeze')
    const scope = postedBody?.['scope'] as Record<string, unknown>
    expect(scope['scopeType']).toBe('ByCategory')
    expect(scope['summaryAr']).toBe('أجهزة الحاسوب')
  }, 40000)

  it('surfaces a conflict when another session is already InProgress', async () => {
    useHandlers()
    postStatus = 409
    const user = userEvent.setup()
    renderPage()

    await screen.findByRole('heading', { level: 1, name: 'جلسة جرد جديدة' })

    const whCombo = screen.getByLabelText('مستودع الجرد')
    await user.click(whCombo)
    await user.type(whCombo, 'مركزي')
    const whOptions = await screen.findAllByRole('option')
    const whTarget = whOptions.find((o) => (o.textContent ?? '').includes('المستودع المركزي'))
    if (whTarget) await user.click(whTarget)

    await selectOption(user, 'نوع الجرد', 'جرد جزئي')
    await selectOption(user, 'نطاق الجرد', 'كل المواد')

    await user.click(screen.getByRole('button', { name: 'تخطيط الجلسة' }))
    await waitFor(
      () => {
        expect(screen.getByText(/تعذّر إنشاء جلسة الجرد/)).toBeInTheDocument()
      },
      { timeout: 8000 },
    )
  }, 40000)
})
