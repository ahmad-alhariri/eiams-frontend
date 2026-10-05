import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { RouteAccessGuard } from '@/modules/auth/components/route-guards'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { useAuthSessionStore } from '@/modules/auth/store/auth-session.store'
import { PERMISSION_CODES, type PermissionCode } from '@/config/permissions'
import { ROUTE_METADATA, ROUTE_PATHS, type RouteKey } from '@/config/routes'
import { hasRoutePermission } from '@/modules/auth/hooks/use-permission'
import type { SessionResponse } from '@/modules/auth/types/session.types'

/**
 * Cross-module route-guard verification (e24-t06).
 *
 * D-RBAC-01 §Downstream.6 requires "guard behavior for every row of the
 * matrix". Before this file the entire suite exercised `RouteAccessGuard` with
 * exactly one route key, so 58 of the declared routes had no allow/deny
 * evidence at all. This file closes that gap and, importantly, derives every
 * expectation from `ROUTE_METADATA` so a guard that silently loses its metadata
 * fails here instead of quietly unlocking a page.
 */

const ALL_ROUTE_KEYS = Object.keys(ROUTE_METADATA) as RouteKey[]

/** Routes that render no page through the registry and are composed by hand. */
const HAND_COMPOSED: readonly RouteKey[] = []

/** Dev-only surface, stripped from production builds. */
const DEV_ONLY: readonly RouteKey[] = ['devGallery']

function protectedRoutes(): RouteKey[] {
  return ALL_ROUTE_KEYS.filter(
    (key) =>
      ROUTE_METADATA[key].public !== true &&
      !HAND_COMPOSED.includes(key) &&
      !DEV_ONLY.includes(key),
  )
}

function sessionWith(codes: readonly string[]): SessionResponse {
  return {
    user: {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'rbac.auditor@eiams.local',
      firstName: 'مدقق الصلاحيات',
      lastName: '',
      employeeId: null,
      employeeName: null,
    },
    role: {
      id: '10000000-0000-4000-8000-0000000000ff',
      name: 'TestRole',
      nameAr: 'Ø¯ÙˆØ± Ø§Ø®ØªØ¨Ø§Ø±ÙŠ',
      description: null,
    },
    permissionCodes: [...codes],
    activeScope: {
      scopeType: 'Warehouse',
      scopeId: '20000000-0000-4000-8000-000000000001',
      scopeName: 'المستودع المركزي',
    },
  }
}

const PROTECTED_CONTENT = 'محتوى محمي'

function renderGuard(route: RouteKey, codes: readonly string[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(authSessionQueryKey, sessionWith(codes))
  useAuthSessionStore.setState({ status: 'authenticated' })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RouteAccessGuard route={route}>
                <p>{PROTECTED_CONTENT}</p>
              </RouteAccessGuard>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const DENIAL_HEADING = 'ليست لديك صلاحية الوصول'

describe('RouteAccessGuard across every guarded route (e24-t06)', () => {
  it('covers every non-public, registry-wired route', () => {
    // Guards off a completeness failure rather than asserting a fixed number.
    expect(protectedRoutes().length).toBeGreaterThanOrEqual(50)
    expect(protectedRoutes()).toHaveLength(
      ALL_ROUTE_KEYS.filter(
        (key) =>
          ROUTE_METADATA[key].public !== true &&
          !HAND_COMPOSED.includes(key) &&
          !DEV_ONLY.includes(key),
      ).length,
    )
  })

  for (const route of protectedRoutes()) {
    it(`admits a session holding exactly the codes ${route} declares`, () => {
      const required = ROUTE_METADATA[route].permissions ?? []
      const alternatives = ROUTE_METADATA[route].permissionAny ?? []
      const codes = alternatives.length > 0 ? [alternatives[0] as string] : [...required]

      renderGuard(route, codes)
      expect(screen.getByText(PROTECTED_CONTENT)).toBeInTheDocument()
      expect(screen.queryByText(DENIAL_HEADING)).toBeNull()
    })

    it(`denies a session missing one required code for ${route}`, () => {
      const required = ROUTE_METADATA[route].permissions ?? []
      const alternatives = ROUTE_METADATA[route].permissionAny ?? []
      const full = alternatives.length > 0 ? [alternatives[0] as string] : [...required]
      const withoutFirst = full.slice(1)

      renderGuard(route, withoutFirst)
      expect(screen.getByText(DENIAL_HEADING)).toBeInTheDocument()
      expect(screen.queryByText(PROTECTED_CONTENT)).toBeNull()
    })
  }
})

describe('RouteAccessGuard denies without ending the session (D-RBAC-01 rule 3)', () => {
  it('keeps the session authenticated after a permission denial', () => {
    renderGuard('inventoryBalances', [])
    expect(screen.getByText(DENIAL_HEADING)).toBeInTheDocument()
    expect(useAuthSessionStore.getState().status).toBe('authenticated')
  })

  it('ignores an unknown server permission string rather than granting with it', () => {
    // The vocabulary is open-ended; an unmapped code must unlock nothing.
    renderGuard('inventoryBalances', ['future.backend.code', 'inventory.delete'])
    expect(screen.getByText(DENIAL_HEADING)).toBeInTheDocument()
    expect(useAuthSessionStore.getState().status).toBe('authenticated')
  })
})

describe('dashboard permissionAny (the one alternative-guard row)', () => {
  it('admits a session holding any single operational view code', () => {
    for (const code of ROUTE_METADATA.dashboard.permissionAny ?? []) {
      const { unmount } = renderGuard('dashboard', [code])
      expect(screen.getByText(PROTECTED_CONTENT)).toBeInTheDocument()
      unmount()
    }
  })

  it('denies a session holding none of the alternative codes', () => {
    renderGuard('dashboard', ['admin.user.view'])
    expect(screen.getByText(DENIAL_HEADING)).toBeInTheDocument()
  })

  it('denies a session holding only non-operational codes', () => {
    const operational = new Set<string>(ROUTE_METADATA.dashboard.permissionAny ?? [])
    const nonOperational = PERMISSION_CODES.filter((code) => !operational.has(code))
    expect(nonOperational.length).toBeGreaterThan(0)
    renderGuard('dashboard', nonOperational)
    expect(screen.getByText(DENIAL_HEADING)).toBeInTheDocument()
  })
})

describe('guard metadata integrity', () => {
  for (const route of protectedRoutes()) {
    it(`${route} declares at least one guard code and only canonical ones`, () => {
      const required: readonly PermissionCode[] = ROUTE_METADATA[route].permissions ?? []
      const alternatives: readonly PermissionCode[] = ROUTE_METADATA[route].permissionAny ?? []
      expect(
        required.length + alternatives.length,
        `${route} must declare a guard`,
      ).toBeGreaterThan(0)
      for (const code of [...required, ...alternatives]) {
        expect(PERMISSION_CODES).toContain(code)
      }
    })
  }

  it('mounts a guard that agrees with the pure predicate for every route', () => {
    // The rendered guard and `hasRoutePermission` are two consumers of the same
    // metadata; a divergence between them would mean the shipped UI and the
    // navigation manifest disagree.
    for (const route of protectedRoutes()) {
      const required = ROUTE_METADATA[route].permissions ?? []
      const alternatives = ROUTE_METADATA[route].permissionAny ?? []
      const admit = alternatives.length > 0 ? [alternatives[0] as string] : [...required]
      const deny = admit.slice(1)
      expect(hasRoutePermission(admit, route)).toBe(true)
      expect(hasRoutePermission(deny, route)).toBe(false)
    }
  })

  it('declares the manager-only adjustment gate that keeps keepers off adjustment routes', () => {
    // D-ADJ-01: adjustment creation needs create AND post, not just view.
    for (const route of ['adjustmentNew', 'assetDisposalNew'] as const) {
      expect(ROUTE_METADATA[route].permissions).toEqual([
        'document.view',
        'document.create',
        'document.post',
      ])
    }
    // A generic document create route must NOT require post.
    expect(ROUTE_METADATA.documentReceivingNew.permissions).not.toContain('document.post')
  })

  it('keeps every guarded route off the dev-only gallery path', () => {
    expect(ROUTE_PATHS.devGallery).toBe('/dev/gallery')
    expect(ROUTE_METADATA.devGallery.devOnly).toBe(true)
  })
})
