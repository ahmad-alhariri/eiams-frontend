import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import {
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  hasRoutePermission,
  usePermission,
  useRoutePermission,
} from '@/modules/auth/hooks/use-permission'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'

const sessionFixture: SessionResponse = {
  user: {
    userId: '10000000-0000-4000-8000-000000000001',
    username: 'warehouse.manager',
    displayName: 'مدير المستودع',
    status: 'Active',
    rowVersion: 1,
  },
  permissionCodes: ['document.view', 'document.create', 'inventory.view', 'future.backend.code'],
  availableScopes: [],
  scopeState: 'Selected',
  activeRoles: [],
}

function createQueryWrapper() {
  const client = createQueryClient()
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

  return { client, wrapper }
}

describe('permission predicates', () => {
  it('checks exact typed codes while ignoring unknown server-returned values', () => {
    expect(hasPermission(sessionFixture.permissionCodes, 'document.view')).toBe(true)
    expect(hasPermission(sessionFixture.permissionCodes, 'document.post')).toBe(false)
    expect(hasPermission(['future.backend.code'], 'document.view')).toBe(false)
  })

  it('keeps all and any semantics distinct, including empty metadata', () => {
    const permissions = ['document.view', 'document.create'] as const

    expect(hasAllPermissions(permissions, ['document.view', 'document.create'])).toBe(true)
    expect(hasAllPermissions(permissions, ['document.view', 'document.post'])).toBe(false)
    expect(hasAllPermissions(permissions, [])).toBe(true)
    expect(hasAnyPermission(permissions, ['document.post', 'document.create'])).toBe(true)
    expect(hasAnyPermission(permissions, ['document.post', 'audit.view'])).toBe(false)
    expect(hasAnyPermission(permissions, [])).toBe(false)
  })

  it('derives all, any, and public route metadata only from the canonical registry', () => {
    expect(hasRoutePermission(sessionFixture.permissionCodes, 'documentReceivingNew')).toBe(true)
    expect(hasRoutePermission(sessionFixture.permissionCodes, 'countNew')).toBe(false)
    expect(hasRoutePermission(sessionFixture.permissionCodes, 'dashboard')).toBe(true)
    expect(hasRoutePermission(['future.backend.code'], 'dashboard')).toBe(false)
    expect(hasRoutePermission([], 'login')).toBe(true)
  })
})

describe('usePermission', () => {
  it('reads the existing session query without triggering a second session request', async () => {
    const { client, wrapper } = createQueryWrapper()
    client.setQueryData(authSessionQueryKey, sessionFixture)

    const { result } = renderHook(() => usePermission(), { wrapper })

    expect(result.current.has('document.view')).toBe(true)
    expect(result.current.hasAll(['document.view', 'document.create'])).toBe(true)
    expect(result.current.hasAny(['audit.view', 'inventory.view'])).toBe(true)

    client.setQueryData<SessionResponse>(authSessionQueryKey, {
      ...sessionFixture,
      permissionCodes: ['audit.view'],
    })

    await waitFor(() => {
      expect(result.current.has('document.view')).toBe(false)
      expect(result.current.has('audit.view')).toBe(true)
    })
  })

  it('updates the route convenience predicate when the effective scope changes', async () => {
    const { client, wrapper } = createQueryWrapper()
    client.setQueryData(authSessionQueryKey, sessionFixture)

    const { result } = renderHook(() => useRoutePermission('documentReceivingNew'), { wrapper })
    expect(result.current).toBe(true)

    client.setQueryData<SessionResponse>(authSessionQueryKey, {
      ...sessionFixture,
      permissionCodes: ['document.view'],
    })

    await waitFor(() => expect(result.current).toBe(false))
  })
})
