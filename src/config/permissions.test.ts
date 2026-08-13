import { describe, expect, it } from 'vitest'

import { isPermissionCode, PERMISSION_CODES, type PermissionCode } from '@/config/permissions'

describe('Permission vocabulary (D-RBAC-01)', () => {
  it('exposes exactly the 29 v1 codes from the matrix', () => {
    expect(PERMISSION_CODES).toHaveLength(29)
    expect(PERMISSION_CODES).toEqual([
      'catalog.view',
      'catalog.manage',
      'organization.view',
      'organization.manage',
      'warehouse.view',
      'warehouse.manage',
      'inventory.view',
      'document.view',
      'document.create',
      'document.update',
      'document.submit',
      'document.post',
      'document.reject',
      'document.revise',
      'document.cancel',
      'document.reverse',
      'count.view',
      'count.plan',
      'count.enter',
      'count.complete',
      'count.close',
      'asset.view',
      'custody.assign',
      'audit.view',
      'report.view',
      'admin.user.view',
      'admin.user.manage',
      'admin.role.view',
      'admin.role.manage',
    ])
  })

  it('is a const tuple usable as a literal type', () => {
    const code: PermissionCode = 'document.post'
    expect(code).toBe('document.post')
  })

  it('narrows only known codes', () => {
    expect(isPermissionCode('inventory.view')).toBe(true)
    expect(isPermissionCode('inventory.delete')).toBe(false)
    expect(isPermissionCode('')).toBe(false)
  })

  it('rejects codes that are not in the vocabulary', () => {
    const unknown = 'secret.admin' as string
    if (isPermissionCode(unknown)) {
      throw new Error('isPermissionCode must never narrow unknown codes')
    }
    expect(unknown).toBe('secret.admin')
  })
})
