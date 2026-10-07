import { describe, expect, it } from 'vitest'

import { loginSchema } from '@/modules/auth/schemas/auth.schemas'

describe('loginSchema', () => {
  it('accepts the contract password bounds without transforming credentials', () => {
    const password = `  ${'a'.repeat(196)}  `
    const result = loginSchema.safeParse({ username: ' warehouse.keeper ', password })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ username: ' warehouse.keeper ', password })
    }
  })

  it('enforces the contract username and password bounds with Arabic messages', () => {
    const missingUsername = loginSchema.safeParse({ username: '', password: 'password' })
    const shortPassword = loginSchema.safeParse({
      username: 'warehouse.keeper',
      password: '1234567',
    })
    const longPassword = loginSchema.safeParse({
      username: 'warehouse.keeper',
      password: 'a'.repeat(201),
    })
    const longUsername = loginSchema.safeParse({
      username: 'u'.repeat(101),
      password: 'password',
    })

    expect(missingUsername.error?.issues[0]?.message).toBe('اسم المستخدم مطلوب.')
    expect(shortPassword.error?.issues[0]?.message).toBe(
      'يجب أن تتكون كلمة المرور من 8 محارف على الأقل.',
    )
    expect(longPassword.error?.issues[0]?.message).toBe('يجب ألا تتجاوز كلمة المرور 200 محرف.')
    expect(longUsername.error?.issues[0]?.message).toBe('يجب ألا يتجاوز اسم المستخدم 100 محرف.')
  })
})
