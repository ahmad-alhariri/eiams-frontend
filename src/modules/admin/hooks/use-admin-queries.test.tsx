import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import {
  createPage,
  createPermission,
  createRole,
  createUserRoleScope,
  createUserSummary,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  adminQueryKeys,
  usePermissionsQuery,
  useRoleQuery,
  useRolesQuery,
  useUserQuery,
  useUserRoleScopesQuery,
  useUsersQuery,
} from './use-admin-queries'

const API_BASE_URL = '/api/v1'

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('admin query hooks', () => {
  it('uses scope-isolated keys for permission, role, user, and assignment resources', () => {
    const scope = { kind: 'enterprise' as const }
    const query = { pageIndex: 1, search: 'مدير' }

    expect(adminQueryKeys.permissions(scope)).toEqual([
      'scoped',
      'enterprise',
      null,
      'admin',
      'permissions',
    ])
    expect(adminQueryKeys.role(scope, 'role-1')).toEqual([
      'scoped',
      'enterprise',
      null,
      'admin',
      'roles',
      'role-1',
    ])
    expect(adminQueryKeys.users(scope, query)).toEqual([
      'scoped',
      'enterprise',
      null,
      'admin',
      'users',
      query,
    ])
    expect(adminQueryKeys.userRoleScopes(scope, 'user-1')).toEqual([
      'scoped',
      'enterprise',
      null,
      'admin',
      'users',
      'user-1',
      'role-scopes',
    ])
  })

  it('reads all administration resources through active-scope query keys', async () => {
    const permission = createPermission()
    const role = createRole()
    const user = createUserSummary()
    const assignment = createUserRoleScope({ userId: user.userId, role })

    server.use(
      http.get(`${API_BASE_URL}/admin/permissions`, () => HttpResponse.json([permission])),
      http.get(`${API_BASE_URL}/admin/roles`, () => HttpResponse.json([role])),
      http.get(`${API_BASE_URL}/admin/roles/${role.roleId}`, () => HttpResponse.json(role)),
      http.get(`${API_BASE_URL}/admin/users`, () => HttpResponse.json(createPage([user]))),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}`, () => HttpResponse.json(user)),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}/role-scopes`, () =>
        HttpResponse.json([assignment]),
      ),
    )

    const permissions = renderHook(() => usePermissionsQuery(), { wrapper: createWrapper() })
    const roles = renderHook(() => useRolesQuery(), { wrapper: createWrapper() })
    const roleDetail = renderHook(() => useRoleQuery(role.roleId), { wrapper: createWrapper() })
    const users = renderHook(() => useUsersQuery({ search: 'مدير' }), { wrapper: createWrapper() })
    const userDetail = renderHook(() => useUserQuery(user.userId), { wrapper: createWrapper() })
    const assignments = renderHook(() => useUserRoleScopesQuery(user.userId), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(permissions.result.current.isSuccess).toBe(true)
      expect(roles.result.current.isSuccess).toBe(true)
      expect(roleDetail.result.current.isSuccess).toBe(true)
      expect(users.result.current.isSuccess).toBe(true)
      expect(userDetail.result.current.isSuccess).toBe(true)
      expect(assignments.result.current.isSuccess).toBe(true)
    })

    expect(permissions.result.current.data).toEqual([permission])
    expect(roles.result.current.data).toEqual([role])
    expect(roleDetail.result.current.data).toEqual(role)
    expect(users.result.current.data?.items).toEqual([user])
    expect(userDetail.result.current.data).toEqual(user)
    expect(assignments.result.current.data).toEqual([assignment])
  })

  it('does not request administration data before a server-selected scope exists', async () => {
    activeScope.key = undefined
    let requestCount = 0

    server.use(
      http.get(`${API_BASE_URL}/admin/users`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([createUserSummary()]))
      }),
    )

    const { result } = renderHook(() => useUsersQuery({ search: 'مستخدم' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(result.current.data).toBeUndefined()
    expect(requestCount).toBe(0)
  })
})
