import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AppHeader, type HeaderUser } from '@/shared/layout/header/app-header'
import { useUiStore } from '@/shared/store/ui.store'

function renderHeader(props?: Partial<React.ComponentProps<typeof AppHeader>>) {
  return render(<AppHeader {...props} />)
}

describe('AppHeader', () => {
  it('mounts the forest bar with brand and navigation triggers', () => {
    renderHeader()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'الرئيسية' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'فتح قائمة التنقل' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'طي القائمة الجانبية' })).toBeInTheDocument()
  })

  it('renders the notification bell without a badge at zero count', () => {
    renderHeader()

    expect(screen.getByRole('button', { name: 'الإشعارات' })).toBeInTheDocument()
    expect(screen.queryByText(/\d+/)).not.toBeInTheDocument()
  })

  it('shows the damask badge with the count when notifications exist', () => {
    renderHeader({ notificationsCount: 3 })

    expect(screen.getByLabelText('3 إشعارات غير مقروءة')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('keeps the breadcrumb region empty until e05-t06 provides the trail', () => {
    renderHeader()

    const region = document.querySelector('[data-slot="app-header-breadcrumb"]')
    expect(region).toBeInTheDocument()
    expect(region).not.toHaveTextContent('مسار')
  })

  it('renders a supplied breadcrumb inside the header region', () => {
    renderHeader({ breadcrumb: <span>المستودعات / دمشق</span> })

    expect(screen.getByText('المستودعات / دمشق')).toBeInTheDocument()
  })

  it('composes an injected user menu beside session controls', () => {
    renderHeader({ userMenu: <span data-testid="user-menu">مستخدم النظام</span> })

    expect(screen.getByTestId('user-menu')).toHaveTextContent('مستخدم النظام')
  })

  it('hides the user block when no session identity exists (e06 wiring)', () => {
    renderHeader()

    expect(document.querySelector('[data-slot="app-header-user"]')).toBeNull()
  })

  it('shows the avatar initials, name, and role for a signed-in user', () => {
    const user: HeaderUser = { displayName: 'أحمد الحريري', roleName: 'أمين مستودع' }
    renderHeader({ user })

    expect(screen.getByText('أح')).toBeInTheDocument()
    expect(screen.getByText('أحمد الحريري')).toBeInTheDocument()
    expect(screen.getByText('أمين مستودع')).toBeInTheDocument()
  })

  it('composes an injected user menu in place of the static identity block', () => {
    const user: HeaderUser = { displayName: 'أحمد الحريري', roleName: 'أمين مستودع' }
    renderHeader({ user, userMenu: <span data-testid="user-menu">قائمة المستخدم</span> })

    expect(screen.getByTestId('user-menu')).toHaveTextContent('قائمة المستخدم')
    // One identity source only: the injected auth composition replaces the
    // static block when both are supplied.
    expect(document.querySelector('[data-slot="app-header-user"]')).toBeNull()
  })

  it('keeps the collapse label consistent with the store', () => {
    renderHeader()

    useUiStore.setState({ sidebarCollapsed: true })
    renderHeader()

    expect(screen.getAllByRole('button', { name: 'توسيع القائمة الجانبية' })).toHaveLength(2)
  })
})
