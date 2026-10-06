import { createAxiosTransport } from '@/shared/api/axios-transport'
import axios from 'axios'
import { http } from 'msw'
import { afterEach, describe, expect, it } from 'vitest'

import { createAdminService } from '@/modules/admin/services/admin.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { createApiClient, type ApiClientBundle } from '@/shared/services/api.client'
import {
  createPermissionCatalogEntry,
  createRoleProjection,
  createUserRoleScope,
  createUserDetail,
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
    const user = createUserDetail()
    const assignment = createUserRoleScope({ roleId: role.id, roleName: role.name })
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
      http.get(`${API_BASE_URL}/admin/users/${user.id}`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return okJson(user)
      }),
      // Singular resource (D-SRS-01): the backend publishes only
      // /admin/users/{userId}/role-scope, and it answers one assignment object.
      http.get(`${API_BASE_URL}/admin/users/${user.id}/role-scope`, ({ request }) => {
        requestedUrls.push(new URL(request.url).pathname)
        return okJson(assignment)
      }),
    )

    await expect(service.listPermissions()).resolves.toEqual([permission])
    await expect(service.listRoles()).resolves.toEqual([role])
    await expect(service.getRole(role.id)).resolves.toEqual(role)
    await expect(service.listUsers({ page: 3, search: 'user' })).resolves.toMatchObject({
      items: [user],
    })
    await expect(service.getUser(user.id)).resolves.toEqual(user)
    await expect(service.getUserRoleScope(user.id)).resolves.toEqual(assignment)

    expect(requestedUrls).toEqual([
      `${API_BASE_URL}/admin/permissions`,
      `${API_BASE_URL}/admin/roles`,
      `${API_BASE_URL}/admin/roles/${role.id}`,
      `${API_BASE_URL}/admin/users?page=3&search=user`,
      `${API_BASE_URL}/admin/users/${user.id}`,
      `${API_BASE_URL}/admin/users/${user.id}/role-scope`,
    ])
  })

  it('sends only the fields each role operation owns', async () => {
    const service = setupService()
    const role = createRoleProjection({ name: 'AUDITOR', nameAr: 'مدقق' })
    const assignmentRole = createRoleProjection({ name: 'AUDITOR', nameAr: 'مدقق' })
    const user = createUserDetail({ email: 'auditor.user@eiams.local' })
    const assignment = createUserRoleScope({
      roleId: assignmentRole.id,
      roleName: assignmentRole.name,
    })
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
    // Creation carries the account AND its sole assignment: D-SRS-01 makes them one
    // server-owned operation, and the backend rejects a bare account.
    const createUserRequest = {
      email: user.email,
      username: 'auditor.user',
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      password: 'Initial-secret-123',
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
    }
    const createdUser = {
      id: user.id,
      email: user.email,
      username: 'auditor.user',
      firstName: user.firstName,
      lastName: user.lastName,
      assignment,
    }
    // Update carries only the account metadata, and NO username (immutable after
    // creation) and NO status (its own operation).
    const updateUserRequest = {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      expectedRowVersion: user.rowVersion,
    }
    // Suspension is a dedicated operation with its own route and guards, and it
    // carries the same concurrency token.
    const setUserStatusRequest = {
      status: 'Suspended' as const,
      expectedRowVersion: user.rowVersion,
    }
    // The replacement carries exactly one assignment and the version it was read at.
    // `expectedRowVersion` is required: the backend binds this body with
    // additionalProperties:false, so omitting it is rejected outright.
    const roleScopeRequest = {
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId,
      expectedRowVersion: assignment.rowVersion,
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
        // Creation answers 201 with the account plus its sole assignment.
        return apiJson(createdUser, { status: 201 })
      }),
      http.put(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}/status`,
        async ({ request }) => {
          receivedBodies.push(JSON.parse(await request.text()))
          return okJson(undefined)
        },
      ),
      http.put(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}`,
        async ({ request }) => {
          receivedBodies.push(JSON.parse(await request.text()))
          // Update answers an empty body.
          return okJson(undefined)
        },
      ),
      http.put(
        `${API_BASE_URL}/admin/users/${encodeURIComponent(encodedUserId)}/role-scope`,
        async ({ request }) => {
          receivedBodies.push(JSON.parse(await request.text()))
          return okJson(assignment)
        },
      ),
    )

    await expect(service.createRole(createRoleRequest)).resolves.toEqual(role)
    await expect(service.updateRoleMetadata(encodedRoleId, metadataRequest)).resolves.toEqual(role)
    await expect(
      service.replaceRolePermissions(encodedRoleId, permissionsRequest),
    ).resolves.toEqual(role)
    await expect(service.createUser(createUserRequest)).resolves.toEqual(createdUser)
    // Update answers an empty body, so it resolves to void and the caller re-reads.
    await expect(service.updateUser(encodedUserId, updateUserRequest)).resolves.toBeUndefined()
    await expect(
      service.setUserStatus(encodedUserId, setUserStatusRequest),
    ).resolves.toBeUndefined()
    await expect(service.replaceUserRoleScope(encodedUserId, roleScopeRequest)).resolves.toEqual(
      assignment,
    )
    // Each request body is exactly its own operation's fields: the metadata update carries no
    // permissionCodes, and the permission replacement carries no metadata. The retired broad
    // upsert resubmitted the whole role record for both.
    expect(receivedBodies).toEqual([
      createRoleRequest,
      metadataRequest,
      permissionsRequest,
      createUserRequest,
      updateUserRequest,
      setUserStatusRequest,
      roleScopeRequest,
    ])
    expect(receivedBodies[1]).not.toHaveProperty('permissionCodes')
    expect(receivedBodies[2]).not.toHaveProperty('nameAr')
    // The metadata update carries neither the immutable login nor the lifecycle
    // status, and always carries the concurrency token it was read at.
    expect(receivedBodies[4]).not.toHaveProperty('username')
    expect(receivedBodies[4]).not.toHaveProperty('status')
    expect(receivedBodies[4]).toHaveProperty('expectedRowVersion')
    // The status operation carries ONLY the status plus that token.
    expect(receivedBodies[5]).toEqual({
      status: 'Suspended',
      expectedRowVersion: user.rowVersion,
    })
  })

  it('reports no assignment as null instead of an error', async () => {
    const service = setupService()
    const user = createUserDetail()

    server.use(
      http.get(`${API_BASE_URL}/admin/users/${user.id}/role-scope`, () =>
        errJson(404, {
          code: 'UserRoleScopes.AssignmentNotFound',
          message: 'The user does not have a role and scope assignment',
        }),
      ),
    )

    // An account can exist before its assignment does. That is a normal empty state,
    // and the backend expects expectedRowVersion: 0 for the first write against it.
    await expect(service.getUserRoleScope(user.id)).resolves.toBeNull()
  })

  it.each([
    {
      label: 'an unknown user',
      status: 404,
      code: 'USERS_NOT_FOUND',
    },
    {
      // The real outside-scope refusal is 403 with its own code; the 404 absent-row
      // code must NOT be reused to mean "forbidden".
      label: 'an assignment outside the administrator scope',
      status: 403,
      code: 'UserRoleScopes.AssignmentOutsideAdministratorScope',
    },
    {
      label: 'a forbidden assignment read',
      status: 403,
      code: 'UserRoleScopes.Forbidden',
    },
  ])('propagates $label rather than swallowing it', async ({ status, code }) => {
    const service = setupService()
    const user = createUserDetail()

    server.use(
      http.get(`${API_BASE_URL}/admin/users/${user.id}/role-scope`, () =>
        errJson(status, { code, message: 'refused' }),
      ),
    )

    // Only the exact "row is absent" code on a 404 is a null. Matching the status
    // alone would hide a genuine unknown-user 404 behind an empty assignment.
    await expect(service.getUserRoleScope(user.id)).rejects.toBeDefined()
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
