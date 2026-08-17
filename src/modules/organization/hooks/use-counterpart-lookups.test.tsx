import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CounterpartSelect } from '@/modules/organization/components/counterpart-select'
import { createQueryClient } from '@/shared/services/query.client'
import type { CounterpartOption, CounterpartPage } from '@/shared/types/generated/eiams-v1'
import { createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  useActiveCounterpartOptions,
  useCounterpartSearchQuery,
  useHistoricalCounterpartQuery,
} from './use-counterpart-lookups'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function createCounterpart(overrides: Partial<CounterpartOption> = {}): CounterpartOption {
  return {
    displayName: 'أحمد محمد',
    id: fixtureUuid(64),
    secondaryLabelAr: 'أمين مستودع',
    status: 'Active',
    type: 'Employee',
    ...overrides,
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('counterpart lookup hooks', () => {
  it('caches active write options by active scope and filters an unexpected inactive result', async () => {
    const active = createCounterpart()
    const inactive = createCounterpart({
      id: fixtureUuid(65),
      displayName: 'سجل قديم',
      status: 'Inactive',
    })
    let requestCount = 0
    let requestedType: string | null = null

    server.use(
      http.get(`${API_BASE_URL}/counterparts`, ({ request }) => {
        requestCount += 1
        requestedType = new URL(request.url).searchParams.get('type')
        return HttpResponse.json(createPage([active, inactive]) satisfies CounterpartPage)
      }),
    )

    const { result } = renderHook(() => useActiveCounterpartOptions({ type: 'Employee' }), {
      wrapper: createWrapper(),
    })

    await expect(result.current.loadOptions('أح')).resolves.toMatchObject([
      { value: active.id, label: 'أحمد محمد — أمين مستودع', payload: active },
    ])
    await expect(result.current.loadOptions('أح')).resolves.toHaveLength(1)

    expect(requestCount).toBe(1)
    expect(requestedType).toBe('Employee')
  })

  it('resolves an inactive counterpart for historical rendering without making it a write choice', async () => {
    const historical = createCounterpart({ status: 'Inactive', type: 'External' })

    server.use(
      http.get(`${API_BASE_URL}/counterparts/External/${historical.id}`, () =>
        HttpResponse.json(historical),
      ),
    )

    const { result } = renderHook(
      () => useHistoricalCounterpartQuery({ type: historical.type, id: historical.id }),
      { wrapper: createWrapper() },
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(historical)
  })

  it('does not request scope-protected active choices before a server scope is selected', async () => {
    activeScope.key = undefined
    let requestCount = 0

    server.use(
      http.get(`${API_BASE_URL}/counterparts`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([]) satisfies CounterpartPage)
      }),
    )

    const { result } = renderHook(() => useCounterpartSearchQuery({ search: 'أحمد' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(requestCount).toBe(0)
  })

  it('uses AsyncSelect without a free-text creation action and reports scoped search errors in Arabic', async () => {
    server.use(
      http.get(`${API_BASE_URL}/counterparts`, () =>
        HttpResponse.json({ status: 500 }, { status: 500 }),
      ),
    )

    render(<CounterpartSelect onValueChange={() => undefined} />, { wrapper: createWrapper() })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'جهة' } })

    await waitFor(
      () =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'تعذر البحث عن الجهات المتاحة ضمن نطاقك.',
        ),
      { timeout: 3_000 },
    )
    expect(screen.queryByText(/إضافة جديد/)).not.toBeInTheDocument()
  })
})
