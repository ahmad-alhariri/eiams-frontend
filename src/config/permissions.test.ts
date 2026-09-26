import { describe, expect, it } from 'vitest'

import { isPermissionCode, PERMISSION_CODES, type PermissionCode } from '@/config/permissions'

describe('Permission vocabulary (D-RBAC-01)', () => {
  it('exposes exactly the 29 v1 codes from the matrix', () => {
    expect(PERMISSION_CODES).toHaveLength(29)
    expect(PERMISSION_CODES).toEqual([
      'materials:view',
      'materials:manage',
      'organizations:view',
      'organizations:manage',
      'warehouses:view',
      'warehouses:manage',
      'inventory:view',
      'warehouse-documents:view',
      'warehouse-documents:create',
      'warehouse-documents:edit',
      'warehouse-documents:submit',
      'warehouse-documents:post',
      'warehouse-documents:reject',
      'warehouse-documents:revise',
      'warehouse-documents:cancel',
      'warehouse-documents:reverse',
      'inventory-counts:view',
      'inventory-counts:plan',
      'inventory-counts:enter-actual',
      'inventory-counts:complete',
      'inventory-counts:close',
      'assets:view',
      'custody:manage',
      'audit-logs:view',
      'reports:view',
      'users:view',
      'users:manage',
      'roles:view',
      'roles:manage',
    ])
  })

  it('is a const tuple usable as a literal type', () => {
    const code: PermissionCode = 'warehouse-documents:post'
    expect(code).toBe('warehouse-documents:post')
  })

  it('narrows only known codes', () => {
    expect(isPermissionCode('inventory:view')).toBe(true)
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
