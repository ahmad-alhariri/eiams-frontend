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

import { useReplaceUserRoleScopeMutation } from './use-admin-mutations'

const API_BASE_URL = '/api/v1'

describe('admin mutation hooks', () => {
  it('invalidates admin resources and the authoritative session after replacing the role scope', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const user = createUserSummary()
    const role = createRole()
    const seeded = createUserRoleScope({ userId: user.userId, role })
    const stored = { role: seeded.role, scope: seeded.scope }
    const usersKey = adminQueryKeys.users(scope, {})
    const assignmentKey = adminQueryKeys.userRoleScope(scope, user.userId)
    const warehouseKey = queryKeys.scoped(scope, 'warehouse', 'warehouses')
    client.setQueryData(usersKey, [])
    client.setQueryData(assignmentKey, [])
    client.setQueryData(warehouseKey, [])
    client.setQueryData(authSessionQueryKey, { permissionCodes: [] })

    server.use(
      http.put(`${API_BASE_URL}/admin/users/${user.userId}/role-scope`, () =>
        HttpResponse.json(stored),
      ),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useReplaceUserRoleScopeMutation(), {
      wrapper: QueryWrapper,
    })

    await result.current.mutateAsync({
      userId: user.userId,
      request: {
        roleId: role.roleId,
        scopeId: seeded.scope.scopeId,
        scopeType: seeded.scope.scopeType,
      },
    })

    await waitFor(() => {
      expect(client.getQueryState(usersKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(assignmentKey)?.isInvalidated).toBe(true)
      expect(client.getQueryState(authSessionQueryKey)?.isInvalidated).toBe(true)
    })
    expect(client.getQueryState(warehouseKey)?.isInvalidated).toBe(false)
  })
})
