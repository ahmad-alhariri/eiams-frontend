import { create } from 'zustand'

/**
 * App chrome UI state (AGENTS: Zustand for UI state only — never server data).
 * Sidebar collapse (desktop) and drawer (mobile) are pure view state.
 */
type UiState = {
  /** Desktop (lg+): sidebar collapsed to icons (64px). */
  sidebarCollapsed: boolean
  /** Mobile (<lg): sidebar drawer open. */
  sidebarDrawerOpen: boolean
  toggleSidebarCollapsed: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSidebarDrawerOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  sidebarDrawerOpen: false,
  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setSidebarDrawerOpen: (open) => set({ sidebarDrawerOpen: open }),
}))
