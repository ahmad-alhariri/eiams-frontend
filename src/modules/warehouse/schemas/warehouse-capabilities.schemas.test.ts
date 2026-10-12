import { describe, expect, it } from 'vitest'

import {
  grantCapabilitySchema,
  revokeCapabilitySchema,
} from '@/modules/warehouse/schemas/warehouse-capabilities.schemas'

const DOMAIN_ID = '1f0e2d3c-4b5a-4978-8691-a2b3c4d5e6f7'
const CAPABILITY_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

// The capability schemas are intentionally minimal: grant carries only the
// domain id, and revoke carries only the capability id (the id rides the route,
// not a body). Their job is to gate a well-formed UUID and speak Arabic when
// the input is not one — the reachability the lvtk.3 defect-7 fix requires.

describe('grantCapabilitySchema', () => {
  it('accepts a valid material domain id', () => {
    expect(grantCapabilitySchema.safeParse({ materialDomainId: DOMAIN_ID }).success).toBe(true)
  })

  it('rejects a non-UUID domain id with the Arabic message', () => {
    const result = grantCapabilitySchema.safeParse({ materialDomainId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب اختيار مجال مواد صالح.')
    }
  })

  it('rejects a missing domain id', () => {
    expect(grantCapabilitySchema.safeParse({}).success).toBe(false)
  })
})

describe('revokeCapabilitySchema', () => {
  it('accepts a valid capability id', () => {
    expect(revokeCapabilitySchema.safeParse({ capabilityId: CAPABILITY_ID }).success).toBe(true)
  })

  it('rejects a non-UUID capability id with the Arabic message', () => {
    const result = revokeCapabilitySchema.safeParse({ capabilityId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('تعذّر تحديد معرّف القدرة المطلوب إبطالها.')
    }
  })
})
