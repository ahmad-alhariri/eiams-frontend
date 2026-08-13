import { describe, expect, it } from 'vitest'

import { useUiStore } from '@/shared/store/ui.store'

describe('UI store (sidebar chrome)', () => {
  it('starts with an expanded sidebar and closed drawer', () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    expect(useUiStore.getState().sidebarDrawerOpen).toBe(false)
  })

  it('toggles desktop collapse', () => {
    useUiStore.getState().toggleSidebarCollapsed()
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    useUiStore.getState().toggleSidebarCollapsed()
    expect(useUiStore.getState().sidebarCollapsed).toBe(false)
  })

  it('handles explicit collapse and drawer setters', () => {
    useUiStore.getState().setSidebarCollapsed(true)
    useUiStore.getState().setSidebarDrawerOpen(true)
    expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    expect(useUiStore.getState().sidebarDrawerOpen).toBe(true)
  })
})
