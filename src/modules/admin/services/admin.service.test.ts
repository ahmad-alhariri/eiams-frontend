import axios from 'axios'
import { HttpResponse, http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createAdminService } from '@/modules/admin/services/admin.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createPage,
  createPermission,
  createRole,
  createUserRoleScope,
  createUserSummary,
} from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
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
        return HttpResponse.json(createPage([user]))
      }),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return HttpResponse.json(user)
      }),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}/role-scopes`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return HttpResponse.json([assignment])
      }),
    )

    await expect(service.listPermissions()).resolves.toEqual([permission])
    await expect(service.listRoles()).resolves.toEqual([role])
    await expect(service.getRole(role.roleId)).resolves.toEqual(role)
    await expect(service.listUsers({ pageIndex: 2, search: 'مستخدم' })).resolves.toMatchObject({
      items: [user],
    })
    await expect(service.getUser(user.userId)).resolves.toEqual(user)
    await expect(service.getUserRoleScopes(user.userId)).resolves.toEqual([assignment])

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/admin/permissions`,
      `${API_BASE_URL}/admin/roles`,
      `${API_BASE_URL}/admin/roles/${role.roleId}`,
      `${API_BASE_URL}/admin/users?pageIndex=2&search=%D9%85%D8%B3%D8%AA%D8%AE%D8%AF%D9%85`,
      `${API_BASE_URL}/admin/users/${user.userId}`,
      `${API_BASE_URL}/admin/users/${user.userId}/role-scopes`,
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
    const roleScopesRequest = {
      assignments: [
        {
          roleId: role.roleId,
          scopeType: assignment.scope.scopeType,
          scopeId: assignment.scope.scopeId,
        },
      ],
      rowVersion: user.rowVersion,
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
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}/role-scopes`,
        async ({ request }) => {
          receivedBodies.push(await request.json())
          return HttpResponse.json([assignment])
        },
      ),
    )

    await expect(service.createRole(roleRequest)).resolves.toEqual(role)
    await expect(service.updateRole(encodedRoleId, roleRequest)).resolves.toEqual(role)
    await expect(service.createUser(userRequest)).resolves.toEqual(user)
    await expect(service.updateUser(encodedUserId, userRequest)).resolves.toEqual(user)
    await expect(service.replaceUserRoleScopes(encodedUserId, roleScopesRequest)).resolves.toEqual([
      assignment,
    ])
    expect(receivedBodies).toEqual([
      roleRequest,
      roleRequest,
      userRequest,
      userRequest,
      roleScopesRequest,
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
    expect(normalizeApiError(error)).toMatchObject({ status: 404, code: 'admin.user_not_found' })
  })
})
