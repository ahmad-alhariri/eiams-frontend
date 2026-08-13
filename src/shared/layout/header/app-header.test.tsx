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

  it('composes an injected scope switcher beside session controls', () => {
    renderHeader({ scopeSwitcher: <span data-testid="scope-switcher">نطاق دمشق</span> })

    expect(screen.getByTestId('scope-switcher')).toHaveTextContent('نطاق دمشق')
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

  it('keeps the collapse label consistent with the store', () => {
    renderHeader()

    useUiStore.setState({ sidebarCollapsed: true })
    renderHeader()

    expect(screen.getAllByRole('button', { name: 'توسيع القائمة الجانبية' })).toHaveLength(2)
  })
})
