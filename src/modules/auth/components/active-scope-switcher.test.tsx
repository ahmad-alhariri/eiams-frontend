import { act, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'

import { ActiveScopeSwitcher } from '@/modules/auth/components/active-scope-switcher'
import { AppProviders } from '@/app/providers/app-providers'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { queryClient } from '@/shared/services/query.client'
import type { ScopeContext, SessionResponse } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001'
const SITE_ID = '30000000-0000-4000-8000-000000000001'

const warehouseScope: ScopeContext = {
  scopeType: 'Warehouse',
  scopeId: WAREHOUSE_ID,
  warehouseId: WAREHOUSE_ID,
  siteId: SITE_ID,
  displayName: 'المستودع المركزي',
}

const siteScope: ScopeContext = {
  scopeType: 'Site',
  scopeId: SITE_ID,
  siteId: SITE_ID,
  displayName: 'موقع دمشق',
}

function sessionWith(
  activeScope: ScopeContext = warehouseScope,
  availableScopes: readonly ScopeContext[] = [warehouseScope, siteScope],
): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'warehouse.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: ['inventory.view'],
    availableScopes,
    activeScope,
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function renderSwitcher(session: SessionResponse) {
  act(() => {
    queryClient.setQueryData(authSessionQueryKey, session)
    useAuthSessionStore.setState({ status: 'authenticated' })
  })

  return render(
    <AppProviders>
      <ActiveScopeSwitcher />
    </AppProviders>,
  )
}

afterEach(() => {
  act(() => {
    queryClient.clear()
    useAuthSessionStore.setState({ status: 'initializing' })
  })
})

describe('ActiveScopeSwitcher', () => {
  it('renders a compact loading placeholder while the server session is loading', () => {
    server.use(http.get(`${API_BASE_URL}/auth/session`, () => new Promise<Response>(() => {})))
    useAuthSessionStore.setState({ status: 'authenticated' })

    render(
      <AppProviders>
        <ActiveScopeSwitcher />
      </AppProviders>,
    )

    expect(screen.getByLabelText('جارٍ تحميل نطاق العمل')).toHaveAttribute('aria-busy', 'true')
  })

  it('uses a read-only indicator when the server provides one effective scope', () => {
    renderSwitcher(sessionWith(warehouseScope, [warehouseScope]))

    expect(screen.getByLabelText('نطاق العمل الحالي')).toHaveTextContent('المستودع المركزي')
    expect(screen.queryByRole('button', { name: 'تبديل نطاق العمل' })).not.toBeInTheDocument()
  })

  it('switches only to a server-provided scope and reflects the returned session', async () => {
    const user = userEvent.setup()
    let requestPayload: unknown = null
    const nextSession = sessionWith(siteScope)
    server.use(
      http.put(`${API_BASE_URL}/auth/active-scope`, async ({ request }) => {
        requestPayload = await request.json()
        return HttpResponse.json(nextSession)
      }),
    )
    renderSwitcher(sessionWith())

    const trigger = screen.getByRole('combobox', { name: 'تبديل نطاق العمل' })
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: /موقع دمشق/ }))

    await waitFor(() => expect(requestPayload).toEqual({ scopeType: 'Site', scopeId: SITE_ID }))
    await waitFor(() => expect(trigger).toHaveTextContent('موقع دمشق'))
  })

  it('keeps the active scope and announces an Arabic error when the server rejects a switch', async () => {
    const user = userEvent.setup()
    server.use(
      http.put(`${API_BASE_URL}/auth/active-scope`, () =>
        HttpResponse.json(
          {
            status: 422,
            code: 'validation.scope',
            titleAr: 'تعذر تغيير نطاق العمل.',
            traceId: 'scope-change-failed',
          },
          { status: 422 },
        ),
      ),
    )
    renderSwitcher(sessionWith())

    const trigger = screen.getByRole('combobox', { name: 'تبديل نطاق العمل' })
    await user.click(trigger)
    await user.click(await screen.findByRole('option', { name: /موقع دمشق/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذر تغيير نطاق العمل.')
    expect(trigger).toHaveTextContent('المستودع المركزي')
  })
})
