import { createAxiosTransport } from '@/shared/api/axios-transport'
import axios from 'axios'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createAdminService } from '@/modules/admin/services/admin.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createPermissionCatalogEntry,
  createRole,
  createRoleProjection,
  createUserRoleScope,
  createUserSummary,
} from '@/test/msw/factories'
import { apiJson, errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const bundles: ApiClientBundle[] = []

function setupService() {
  const bundle = createApiClient({ baseURL: API_BASE_URL })
  bundles.push(bundle)
  return createAdminService(createAxiosTransport(bundle.client))
}

afterEach(() => {
  for (const bundle of bundles.splice(0)) {
    bundle.dispose()
  }
})

describe('AdminService', () => {
  it('maps permission, role, and user reads to their typed contract endpoints', async () => {
    const service = setupService()
    const permission = createPermissionCatalogEntry()
    const role = createRoleProjection()
    const user = createUserSummary()
    const assignment = createUserRoleScope({ userId: user.userId, role: createRole() })
    const requestedUrls: string[] = []

    server.use(
      // The catalogue and role list are paged server-side with top-level pagination, so the
      // mocks must answer with the paged envelope. Reading them as a bare array is exactly the
      // shape mismatch that silently truncated the catalogue at the default page size.
      http.get(`${API_BASE_URL}/admin/permissions`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return okPageJson([permission])
      }),
      http.get(`${API_BASE_URL}/admin/roles`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return okPageJson([role])
      }),
      http.get(`${API_BASE_URL}/admin/roles/${role.id}`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return okJson(role)
      }),
      http.get(`${API_BASE_URL}/admin/users`, ({ request }) => {
        const url = new URL(request.url)
        requestedUrls.push(`${url.pathname}${url.search}`)
        return okPageJson([user])
      }),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return okJson(user)
      }),
      http.get(`${API_BASE_URL}/admin/users/${user.userId}/role-scopes`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return okJson([assignment])
      }),
    )

    await expect(service.listPermissions()).resolves.toEqual([permission])
    await expect(service.listRoles()).resolves.toEqual([role])
    await expect(service.getRole(role.id)).resolves.toEqual(role)
    await expect(service.listUsers({ pageIndex: 2, search: 'مستخدم' })).resolves.toMatchObject({
      items: [user],
    })
    await expect(service.getUser(user.userId)).resolves.toEqual(user)
    await expect(service.getUserRoleScopes(user.userId)).resolves.toEqual([assignment])

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/admin/permissions`,
      `${API_BASE_URL}/admin/roles`,
      `${API_BASE_URL}/admin/roles/${role.id}`,
      `${API_BASE_URL}/admin/users?pageIndex=2&search=%D9%85%D8%B3%D8%AA%D8%AE%D8%AF%D9%85`,
      `${API_BASE_URL}/admin/users/${user.userId}`,
      `${API_BASE_URL}/admin/users/${user.userId}/role-scopes`,
    ])
  })

  it('sends only the fields each role operation owns', async () => {
    const service = setupService()
    const role = createRoleProjection({ name: 'AUDITOR', nameAr: 'مدقق' })
    const assignmentRole = createRole({ code: 'AUDITOR' })
    const user = createUserSummary({ username: 'auditor.user' })
    const assignment = createUserRoleScope({ userId: user.userId, role: assignmentRole })
    const encodedRoleId = 'role / دمشق'
    const encodedUserId = 'user / دمشق'
    const createRoleRequest = {
      name: role.name,
      nameAr: role.nameAr,
      description: role.description,
      permissionCodes: role.permissionCodes,
      allowedScopeTypes: role.allowedScopeTypes,
    }
    const metadataRequest = {
      name: role.name,
      nameAr: role.nameAr,
      description: role.description,
      expectedRowVersion: role.rowVersion,
      allowedScopeTypes: role.allowedScopeTypes,
    }
    const permissionsRequest = {
      permissionCodes: role.permissionCodes,
      expectedRowVersion: role.rowVersion,
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
          roleId: assignmentRole.roleId,
          scopeType: assignment.scope.scopeType,
          scopeId: assignment.scope.scopeId,
        },
      ],
      rowVersion: user.rowVersion,
    }
    const receivedBodies: unknown[] = []

    server.use(
      http.post(`${API_BASE_URL}/admin/roles`, async ({ request }) => {
        receivedBodies.push(JSON.parse(await request.text()))
        return apiJson(role, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/admin/roles/${encodeURIComponent(encodedRoleId)}`,
        async ({ request }) => {
          receivedBodies.push(JSON.parse(await request.text()))
          return okJson(role)
        },
      ),
      http.put(
        `${API_BASE_URL}/admin/roles/${encodeURIComponent(encodedRoleId)}/permissions`,
        async ({ request }) => {
          receivedBodies.push(JSON.parse(await request.text()))
          return okJson(role)
        },
      ),
      http.post(`${API_BASE_URL}/admin/users`, async ({ request }) => {
        receivedBodies.push(JSON.parse(await request.text()))
        return apiJson(user, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}`,
        async ({ request }) => {
          receivedBodies.push(JSON.parse(await request.text()))
          return okJson(user)
        },
      ),
      http.put(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}/role-scopes`,
        async ({ request }) => {
          receivedBodies.push(JSON.parse(await request.text()))
          return okJson([assignment])
        },
      ),
    )

    await expect(service.createRole(createRoleRequest)).resolves.toEqual(role)
    await expect(service.updateRoleMetadata(encodedRoleId, metadataRequest)).resolves.toEqual(role)
    await expect(
      service.replaceRolePermissions(encodedRoleId, permissionsRequest),
    ).resolves.toEqual(role)
    await expect(service.createUser(userRequest)).resolves.toEqual(user)
    await expect(service.updateUser(encodedUserId, userRequest)).resolves.toEqual(user)
    await expect(service.replaceUserRoleScopes(encodedUserId, roleScopesRequest)).resolves.toEqual([
      assignment,
    ])
    // Each request body is exactly its own operation's fields: the metadata update carries no
    // permissionCodes, and the permission replacement carries no metadata. The retired broad
    // upsert resubmitted the whole role record for both.
    expect(receivedBodies).toEqual([
      createRoleRequest,
      metadataRequest,
      permissionsRequest,
      userRequest,
      userRequest,
      roleScopesRequest,
    ])
    expect(receivedBodies[1]).not.toHaveProperty('permissionCodes')
    expect(receivedBodies[2]).not.toHaveProperty('nameAr')
  })

  it('leaves contract errors for the shared Arabic error normalizer', async () => {
    const service = setupService()

    server.use(
      http.get(`${API_BASE_URL}/admin/users/missing`, () =>
        errJson(404, { code: 'USERS_NOT_FOUND', message: 'User not found.' }),
      ),
    )

    const error = await service.getUser('missing').catch((reason: unknown) => reason)

    expect(axios.isAxiosError(error)).toBe(true)
    expect(normalizeApiError(error)).toMatchObject({
      status: 404,
      code: 'USERS_NOT_FOUND',
      titleAr: 'لم يتم العثور على البيانات المطلوبة.',
    })
  })
})
