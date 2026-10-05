import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { useLocation } from 'react-router'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { AppProviders } from '@/app/providers/app-providers'
import { ROUTE_PATHS } from '@/config/routes'
import { SessionUserMenu } from '@/modules/auth/components/session-user-menu'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { queryClient } from '@/shared/services/query.client'
import type { SessionResponse, SessionScope } from '@/modules/auth/types/session.types'
import { errJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = '20000000-0000-4000-8000-000000000001'

const warehouseScope: SessionScope = {
  scopeType: 'Warehouse',
  scopeId: WAREHOUSE_ID,
  scopeName: 'المستودع المركزي',
}

/**
 * `displayName` is the name the header should SHOW, not a field the session carries. The
 * session projection has `firstName`/`lastName` and no `displayName`, so the fixture puts
 * the wanted label in `firstName` and leaves the family name empty.
 */
function sessionWith(displayName: string, permissionCodes: readonly string[] = ['inventory.view']) {
  return {
    user: {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'warehouse.manager@eiams.local',
      firstName: displayName,
      lastName: '',
      employeeId: null,
      employeeName: null,
    },
    role: {
      id: '10000000-0000-4000-8000-000000000002',
      name: 'WarehouseManager',
      nameAr: 'مدير مستودع',
      description: null,
    },
    permissionCodes,
    activeScope: warehouseScope,
  } satisfies SessionResponse
}

function CurrentPath() {
  const { pathname } = useLocation()
  return <span data-testid="current-path">{pathname}</span>
}

function renderMenu(session: SessionResponse | undefined) {
  act(() => {
    if (session === undefined) {
      queryClient.removeQueries({ queryKey: authSessionQueryKey })
    } else {
      queryClient.setQueryData(authSessionQueryKey, session)
    }
    useAuthSessionStore.setState({
      status: session === undefined ? 'initializing' : 'authenticated',
    })
  })

  return render(
    <MemoryRouter initialEntries={[ROUTE_PATHS.dashboard]}>
      <AppProviders>
        <CurrentPath />
        <SessionUserMenu />
      </AppProviders>
    </MemoryRouter>,
  )
}

/** The menu opens on mousedown; the store write lands on the next frame. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: 'قائمة المستخدم' })
  await user.click(trigger)
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
  return trigger
}

afterEach(() => {
  act(() => {
    queryClient.clear()
    useAuthSessionStore.setState({ status: 'initializing' })
  })
})

describe('SessionUserMenu', () => {
  it('renders nothing until a session is cached', () => {
    renderMenu(undefined)

    expect(screen.queryByRole('button', { name: 'قائمة المستخدم' })).not.toBeInTheDocument()
  })

  it('shows the signed-in identity on the caret trigger, with no role line', async () => {
    const user = userEvent.setup()
    renderMenu(sessionWith('أحمد الحريري'))

    const trigger = screen.getByRole('button', { name: 'قائمة المستخدم' })
    expect(trigger).toHaveTextContent('أح')
    expect(trigger).toHaveTextContent('أحمد الحريري')
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    // The session carries no role names, so the shell must not render a role
    // line. This used to assert 'أمين مستودع' from `session.activeRoles`, which
    // the backend does not send — the field is gone rather than guarded, so a
    // role line could only ever come from a hardcoded string.
    expect(trigger).not.toHaveTextContent('أمين مستودع')

    await openMenu(user)
    expect(screen.getAllByRole('menuitem')).toHaveLength(3)
  })

  it('navigates to the declared profile and settings routes', async () => {
    const user = userEvent.setup()
    renderMenu(sessionWith('أحمد الحريري'))

    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /الملف الشخصي/ }))
    await waitFor(() =>
      expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTE_PATHS.profile),
    )

    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: /الإعدادات/ }))
    await waitFor(() =>
      expect(screen.getByTestId('current-path')).toHaveTextContent(ROUTE_PATHS.settings),
    )
  })

  it('signs out on a single click with no confirmation dialog', async () => {
    const user = userEvent.setup()
    let logoutCalls = 0
    server.use(
      http.post(`${API_BASE_URL}/auth/logout`, () => {
        logoutCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    renderMenu(sessionWith('أحمد الحريري'))
    await openMenu(user)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: /تسجيل الخروج/ }))

    await waitFor(() => expect(logoutCalls).toBe(1))
    await waitFor(() => expect(useAuthSessionStore.getState().status).toBe('unauthenticated'))
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
    // One click is enough: the item is no longer reachable afterwards.
    expect(screen.queryByRole('menuitem', { name: /تسجيل الخروج/ })).not.toBeInTheDocument()
  })

  it('ends the session without claiming a failed sign-out when the server is unreachable', async () => {
    const user = userEvent.setup()
    server.use(http.post(`${API_BASE_URL}/auth/logout`, () => HttpResponse.error()))
    renderMenu(sessionWith('أحمد الحريري'))
    await openMenu(user)

    await user.click(screen.getByRole('menuitem', { name: /تسجيل الخروج/ }))

    await waitFor(() => expect(useAuthSessionStore.getState().status).toBe('unauthenticated'))
    expect(queryClient.getQueryData(authSessionQueryKey)).toBeUndefined()
    // Base UI mirrors each toast into a live region, so the text appears twice.
    expect(await screen.findAllByText('تم إنهاء الجلسة على هذا الجهاز.')).not.toHaveLength(0)
    expect(screen.queryByText(/تعذر تسجيل الخروج/)).not.toBeInTheDocument()
  })

  it('surfaces the contract reason for a denied logout origin without retrying', async () => {
    const user = userEvent.setup()
    let logoutCalls = 0
    server.use(
      http.post(`${API_BASE_URL}/auth/logout`, () => {
        logoutCalls += 1
        // The wire carries an English message only; the Arabic reason shown to
        // the user is resolved from the governed table by code.
        return errJson(403, {
          code: 'REFRESH_TOKEN_ORIGIN_REJECTED',
          message: 'The refresh token origin was rejected.',
        })
      }),
    )
    renderMenu(sessionWith('أحمد الحريري'))
    await openMenu(user)

    await user.click(screen.getByRole('menuitem', { name: /تسجيل الخروج/ }))

    await waitFor(() => expect(useAuthSessionStore.getState().status).toBe('unauthenticated'))
    await waitFor(() => expect(logoutCalls).toBe(1))
    // The toast states the locally-final outcome in its title and surfaces the
    // governed reason for the denied origin as the description.
    expect(await screen.findAllByText('تم إنهاء الجلسة على هذا الجهاز.')).not.toHaveLength(0)
    expect(
      await screen.findAllByText('افتح التطبيق من عنوانه المعتمد ثم حاول مجدداً.'),
    ).not.toHaveLength(0)
  })

  it('stays available to a user whose effective permission codes are empty', async () => {
    // Sign-out is not permission-gated (D-AUTH-01): a user whose permissions
    // were revoked must still be able to end the session.
    const user = userEvent.setup()
    renderMenu(sessionWith('أحمد الحريري', []))

    await openMenu(user)

    expect(screen.getByRole('menuitem', { name: /تسجيل الخروج/ })).toBeInTheDocument()
  })
})
