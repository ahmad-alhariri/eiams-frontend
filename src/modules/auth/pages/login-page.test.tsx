import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProviders } from '@/app/providers/app-providers'
import LoginPage from '@/modules/auth/pages/login-page'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import type { AuthTokenResponse } from '@/shared/types/generated/eiams-v1'
import { server } from '@/test/msw/server'

const loginResponse: AuthTokenResponse = {
  accessToken: 'in-memory-login-token',
  expiresInSeconds: 300,
  tokenType: 'Bearer',
  session: {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'warehouse.keeper',
      displayName: 'أمين المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: ['document.create'],
    availableScopes: [],
    scopeState: 'SelectionRequired',
    activeRoles: [],
  },
}

const defaultInstallLogin = useAuthSessionStore.getState().installLogin

function renderLoginPage() {
  return render(
    <AppProviders>
      <LoginPage />
    </AppProviders>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthSessionStore.setState({
      installLogin: defaultInstallLogin,
      status: 'unauthenticated',
    })
  })

  it('shows Arabic accessible labels and validates the contract password minimum inline', async () => {
    const user = userEvent.setup()
    renderLoginPage()

    const username = screen.getByRole('textbox', { name: 'اسم المستخدم' })
    const password = screen.getByLabelText('كلمة المرور')
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')

    await user.type(username, 'warehouse.keeper')
    await user.type(password, '1234567')
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    expect(
      await screen.findByText('يجب أن تتكون كلمة المرور من 8 محارف على الأقل.'),
    ).toBeInTheDocument()
    expect(password).toHaveAttribute('aria-invalid', 'true')
  })

  it('submits unchanged credentials through MSW and hands the response only to installLogin', async () => {
    const user = userEvent.setup()
    const installLogin = vi.fn()
    useAuthSessionStore.setState({ installLogin })
    let received: unknown = null

    server.use(
      http.post('/api/v1/auth/login', async ({ request }) => {
        received = await request.json()
        return HttpResponse.json(loginResponse)
      }),
    )
    renderLoginPage()

    await user.type(screen.getByRole('textbox', { name: 'اسم المستخدم' }), ' warehouse.keeper ')
    await user.type(screen.getByLabelText('كلمة المرور'), ' password ')
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    await waitFor(() => {
      expect(installLogin).toHaveBeenCalledWith(loginResponse)
    })
    expect(received).toEqual({ username: ' warehouse.keeper ', password: ' password ' })
    expect(screen.getByLabelText(/./u, { selector: 'input[type="password"]' })).toHaveValue('')
  })

  it('locks credential fields and exposes a busy submit state while the login mutation is pending', async () => {
    const user = userEvent.setup()
    let resolveLogin: (() => void) | undefined
    server.use(
      http.post('/api/v1/auth/login', async () => {
        await new Promise<void>((resolve) => {
          resolveLogin = resolve
        })
        return HttpResponse.json(loginResponse)
      }),
    )
    renderLoginPage()

    const username = screen.getByRole('textbox', { name: 'اسم المستخدم' })
    const password = screen.getByLabelText('كلمة المرور')
    const submit = screen.getByRole('button', { name: 'تسجيل الدخول' })
    await user.type(username, 'warehouse.keeper')
    await user.type(password, 'password')
    await user.click(submit)

    await waitFor(() => {
      expect(resolveLogin).toBeDefined()
      expect(submit).toHaveAttribute('aria-busy', 'true')
    })
    expect(username).toBeDisabled()
    expect(password).toBeDisabled()

    resolveLogin?.()
    await waitFor(() => expect(submit).not.toHaveAttribute('aria-busy', 'true'))
  })

  it('maps contract field errors inline and presents the normalized error feedback', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/v1/auth/login', () =>
        HttpResponse.json(
          {
            status: 401,
            code: 'auth.invalid_credentials',
            titleAr: 'بيانات الدخول غير صحيحة.',
            traceId: 'login-invalid',
            fieldErrors: [
              { field: 'password', code: 'invalid', messageAr: 'تحقق من كلمة المرور.' },
            ],
          },
          { status: 401 },
        ),
      ),
    )
    renderLoginPage()

    await user.type(screen.getByRole('textbox', { name: 'اسم المستخدم' }), 'warehouse.keeper')
    await user.type(screen.getByLabelText('كلمة المرور'), 'password')
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    expect(await screen.findByText('تحقق من كلمة المرور.')).toBeInTheDocument()
    expect(screen.getByLabelText(/./u, { selector: 'input[type="password"]' })).toHaveValue('')
    await waitFor(() => {
      expect(document.querySelector('[data-slot="toast-title"]')).toHaveTextContent(
        'بيانات الدخول غير صحيحة.',
      )
    })
  })

  it('reports a network failure through the shared Arabic error normalizer', async () => {
    const user = userEvent.setup()
    server.use(http.post('/api/v1/auth/login', () => HttpResponse.error()))
    renderLoginPage()

    await user.type(screen.getByRole('textbox', { name: 'اسم المستخدم' }), 'warehouse.keeper')
    await user.type(screen.getByLabelText('كلمة المرور'), 'password')
    await user.click(screen.getByRole('button', { name: 'تسجيل الدخول' }))

    await waitFor(() => {
      expect(document.querySelector('[data-slot="toast-title"]')).toHaveTextContent(
        'تعذر الاتصال بالخدمة',
      )
    })
  })
})
