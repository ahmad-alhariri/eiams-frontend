import { QueryClientProvider } from '@tanstack/react-query'
import { okJson } from '@/test/msw/envelope'
import { renderHook, waitFor } from '@testing-library/react'
import { http } from 'msw'
import { type PropsWithChildren } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { adminQueryKeys } from '@/modules/admin/hooks/use-admin-queries'
import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import { queryKeys } from '@/shared/services/query-keys'
import { createRoleProjection, createUserRoleScope, createUserDetail } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useReplaceUserRoleScopeMutation } from './use-admin-mutations'

const API_BASE_URL = '/api/v1'

describe('admin mutation hooks', () => {
  it('invalidates admin resources and the session after replacing a role scope', async () => {
    const client = createQueryClient()
    const scope = { kind: 'enterprise' as const }
    const user = createUserDetail()
    const role = createRoleProjection()
    const assignment = createUserRoleScope({ roleId: role.id, roleName: role.name })
    const usersKey = adminQueryKeys.users(scope, {})
    const assignmentKey = adminQueryKeys.userRoleScope(scope, user.id)
    const warehouseKey = queryKeys.scoped(scope, 'warehouse', 'warehouses')
    client.setQueryData(usersKey, [])
    client.setQueryData(assignmentKey, null)
    client.setQueryData(warehouseKey, [])
    client.setQueryData(authSessionQueryKey, { permissionCodes: [] })

    server.use(
      http.put(`${API_BASE_URL}/admin/users/${user.id}/role-scope`, () => okJson(assignment)),
    )

    function QueryWrapper({ children }: PropsWithChildren) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }

    const { result } = renderHook(() => useReplaceUserRoleScopeMutation(), {
      wrapper: QueryWrapper,
    })

    await result.current.mutateAsync({
      userId: user.id,
      request: {
        roleId: assignment.roleId,
        scopeType: assignment.scopeType,
        scopeId: assignment.scopeId,
        expectedRowVersion: assignment.rowVersion,
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
