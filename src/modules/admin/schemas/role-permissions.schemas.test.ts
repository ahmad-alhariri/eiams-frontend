import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'

import { classifyRolePermissionWriteError } from '@/modules/admin/schemas/role-permissions.schemas'
import { normalizeApiError } from '@/shared/services/api-error'

/**
 * Both role-permission surfaces submit the same operation, so they must classify the same
 * failure the same way. These cases pin the classification that the page and the catalog
 * dialog both branch on; the dialog previously fell through to the generic per-status copy
 * for a stale version, so an identical conflict read differently depending on which surface
 * the administrator used.
 */

/**
 * Builds the error the transport actually rejects with. `normalizeApiError` gates on
 * `axios.isAxiosError`, so a plain object with a `response` property is classified as
 * 'unexpected' and would make every assertion here pass or fail for the wrong reason.
 */
function serverError(status: number, code: string, details?: Record<string, unknown>) {
  return new AxiosError('server message', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    data: {
      success: false,
      error: {
        code,
        message: 'server message',
        details: details ?? {},
        request_id: 'req-1',
      },
    },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  })
}

describe('classifyRolePermissionWriteError', () => {
  it('treats a stale role version as a reload, never a replay', () => {
    const outcome = classifyRolePermissionWriteError(serverError(409, 'ROLES_ROW_VERSION_MISMATCH'))

    expect(outcome.kind).toBe('stale-version')
  })

  it('recognises the scope-mismatch refusal and carries the shared Arabic copy', () => {
    const outcome = classifyRolePermissionWriteError(
      serverError(400, 'ROLES_PERMISSION_CODES_NOT_ALLOWED_FOR_ROLE_SCOPES'),
    )

    expect(outcome.kind).toBe('scope-mismatch')
    if (outcome.kind !== 'scope-mismatch') return
    // The wording comes from the shared error table, not a local constant, so editing the
    // copy once changes both surfaces.
    expect(outcome.titleAr.length).toBeGreaterThan(0)
    const shared = normalizeApiError(
      serverError(400, 'ROLES_PERMISSION_CODES_NOT_ALLOWED_FOR_ROLE_SCOPES'),
    )
    expect(outcome.titleAr).toBe(shared.titleAr)
  })

  it('falls through to field mapping for anything else', () => {
    expect(classifyRolePermissionWriteError(serverError(422, 'ROLES_NAME_NOT_UNIQUE')).kind).toBe(
      'other',
    )
    expect(classifyRolePermissionWriteError(new Error('network down')).kind).toBe('other')
  })
})

describe('the three role codes introduced with permission replacement have Arabic copy', () => {
  it.each([
    'ROLES_ROW_VERSION_MISMATCH',
    'ROLES_UNKNOWN_PERMISSION_CODES',
    'ROLES_PERMISSION_CODES_NOT_ALLOWED_FOR_ROLE_SCOPES',
  ])('%s does not fall back to generic per-status text', (code) => {
    const normalized = normalizeApiError(serverError(409, code))
    const generic = normalizeApiError(serverError(409, 'SOME_CODE_THAT_IS_NOT_IN_THE_TABLE'))

    expect(normalized.titleAr).not.toBe(generic.titleAr)
    expect(normalized.titleAr.trim().length).toBeGreaterThan(0)
  })
})

describe('the Tranche C seeded-role guard has Arabic copy', () => {
  // The wire form of `Roles.SeededRoleScopeTypesImmutable`. Keying on the dotted form would
  // never match, which is the same trap as the three codes above.
  it('resolves ROLES_SEEDED_ROLE_SCOPE_TYPES_IMMUTABLE to real copy', () => {
    const normalized = normalizeApiError(
      serverError(409, 'ROLES_SEEDED_ROLE_SCOPE_TYPES_IMMUTABLE'),
    )
    const generic = normalizeApiError(serverError(409, 'SOME_CODE_THAT_IS_NOT_IN_THE_TABLE'))

    expect(normalized.titleAr).not.toBe(generic.titleAr)
    expect(normalized.titleAr.trim().length).toBeGreaterThan(0)
    expect(normalized.detailAr).not.toBeNull()
  })
})
