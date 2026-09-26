import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createAdminService } from '@/modules/admin/services/admin.service'
import { normalizeError } from '@/shared/services/api.client'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createPermission,
  createRole,
  createUserRoleScope,
  createUserSummary,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = 'http://localhost/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createAdminService(bundle.client)
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('AdminService', () => {
  it('maps permission, role, and user reads to their typed contract endpoints', async () => {
    const service = setupService()
    const permission = createPermission()
    const role = createRole()
    const user = createUserSummary()
    const assignment = createUserRoleScope({ userId: user.userId, role })
    const requestedUrls: string[] = []

    server.use(
      http.get(`${API_BASE_URL}/admin/permissions`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return HttpResponse.json([permission])
      }),
      http.get(`${API_BASE_URL}/admin/roles`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return HttpResponse.json([role])
      }),
      http.get(`${API_BASE_URL}/admin/roles/${role.roleId}`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return HttpResponse.json(role)
      }),
      http.get(`${API_BASE_URL}/admin/users`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return HttpResponse.json({
          items: [user],
          meta: {
            page: 1,
            pageIndex: 1,
            pageSize: 20,
            itemCount: 1,
            totalItems: 1,
            totalCount: 1,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        })
      }),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return HttpResponse.json(user)
      }),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}/role-scope`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return HttpResponse.json({
          role: assignment.role,
          scope: assignment.scope,
        })
      }),
    )

    await expect(service.listPermissions()).resolves.toEqual([permission])
    await expect(service.listRoles()).resolves.toEqual([role])
    await expect(service.getRole(role.roleId)).resolves.toEqual(role)
    await expect(service.listUsers({ pageIndex: 2, search: 'مستخدم' })).resolves.toMatchObject({
      items: [user],
    })
    await expect(service.getUser(user.userId)).resolves.toEqual(user)
    await expect(service.getUserRoleScope(user.userId)).resolves.toEqual({
      role: assignment.role,
      scope: assignment.scope,
    })

    expect(requestedUrls).toEqual([
      '/api/v1/admin/permissions',
      '/api/v1/admin/roles',
      '/api/v1/admin/roles/00000000-0000-4000-8000-00000000000e',
      '/api/v1/admin/users?pageIndex=2&search=%D9%85%D8%B3%D8%AA%D8%AE%D8%AF%D9%85',
      '/api/v1/admin/users/00000000-0000-4000-8000-00000000000a',
      '/api/v1/admin/users/00000000-0000-4000-8000-00000000000a/role-scope',
    ])
  })

  it('encodes identifiers and forwards generated write payloads unchanged', async () => {
    const service = setupService()
    const role = createRole({ code: 'AUDITOR' })
    const user = createUserSummary({ username: 'auditor.user' })
    const assignment = createUserRoleScope({ userId: user.userId, role })
    const encodedRoleId = 'role / دمشق'
    const encodedUserId = 'user / دمشق'
    const roleRequest = {
      code: role.code,
      nameAr: role.nameAr,
      permissionCodes: role.permissionCodes,
      rowVersion: role.rowVersion,
      status: role.status,
    }
    const userRequest = {
      displayName: user.displayName,
      rowVersion: user.rowVersion,
      status: user.status,
      username: user.username,
      initialPassword: 'Initial-secret-123',
    }
    const roleScopeRequest = {
      roleId: role.roleId,
      scopeType: assignment.scope.scopeType,
      scopeId: assignment.scope.scopeId,
    }
    const roleScopeResponse = {
      role: { roleId: role.roleId, nameAr: role.nameAr },
      scope: assignment.scope,
    }
    const receivedBodies: unknown[] = []

    server.use(
      http.post(`${API_BASE_URL}/admin/roles`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(role, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/admin/roles/${encodeURIComponent(encodedRoleId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(role)
        },
      ),
      http.post(`${API_BASE_URL}/admin/users`, async ({ request }) => {
        receivedBodies.push(await request.json())
        return HttpResponse.json(user, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(user)
        },
      ),
      http.put(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}/role-scope`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json(roleScopeResponse)
        },
      ),
    )

    await expect(service.createRole(roleRequest)).resolves.toEqual(role)
    await expect(service.updateRole(encodedRoleId, roleRequest)).resolves.toEqual(role)
    await expect(service.createUser(userRequest)).resolves.toEqual(user)
    await expect(service.updateUser(encodedUserId, userRequest)).resolves.toEqual(user)
    await expect(service.replaceUserRoleScope(encodedUserId, roleScopeRequest)).resolves.toEqual(
      roleScopeResponse,
    )
    expect(receivedBodies).toEqual([
      roleRequest,
      roleRequest,
      userRequest,
      userRequest,
      roleScopeRequest,
    ])
  })

  it('leaves contract errors for the shared Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/admin/users/missing`, () =>
        HttpResponse.json(
          {
            status: 404,
            code: 'admin.user_not_found',
            titleAr: 'المستخدم غير موجود.',
            traceId: 'admin-user-missing',
          },
          { status: 404 },
        ),
      ),
    )

    const error = await service.getUser('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeError(error)).toMatchObject({ status: 404, code: 'admin.user_not_found' })
  })
})
