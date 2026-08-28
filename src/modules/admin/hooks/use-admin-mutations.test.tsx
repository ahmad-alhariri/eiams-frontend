import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { adminQueryKeys } from '@/modules/admin/hooks/use-admin-queries'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import { createRole, createUserRoleScope, createUserSummary } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useReplaceUserRoleScopesMutation } from './use-admin-mutations'

const API_BASE_URL = '/api/v1'

describe('admin mutation hooks', () => {
  it('invalidates admin resources and the authoritative session after replacing role scopes', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const user = createUserSummary()
    const role = createRole()
    const assignment = createUserRoleScope({ userId: user.userId, role })
    const usersKey = adminQueryKeys.users(scope, {})
    const assignmentsKey = adminQueryKeys.userRoleScopes(scope, user.userId)
    const warehouseKey = queryKeys.scoped(scope, 'warehouse', 'warehouses')
    client.setQueryData(usersKey, [])
    client.setQueryData(assignmentsKey, [])
    client.setQueryData(warehouseKey, [])
    client.setQueryData(authSessionQueryKey, { permissionCodes: [] })

    server.use(
      http.put(`${API_BASE_URL}/admin/users/${user.userId}/role-scopes`, () =>
        HttpResponse.json([assignment]),
      ),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useReplaceUserRoleScopesMutation(), {
      wrapper: QueryWrapper,
    })

    await result.current.mutateAsync({
      userId: user.userId,
      request: {
        assignments: [
          {
            roleId: role.roleId,
            scopeId: assignment.scope.scopeId,
            scopeType: assignment.scope.scopeType,
          },
        ],
        rowVersion: user.rowVersion,
      },
    })

    await waitFor(() => {
      expect(client.getQueryState(usersKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(assignmentsKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(authSessionQueryKey)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(warehouseKey)?.isInvalidated).toBe(false)
  })
})
