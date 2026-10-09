import { describe, expect, it } from 'vitest'

import type { Organization } from '@/modules/organization/types/organization.types'
import {
  emptyOrganizationFormValues,
  organizationFormSchema,
  toCreateOrganizationRequest,
  toOrganizationFormValues,
  toUpdateOrganizationRequest,
} from '@/modules/organization/schemas/organization.schemas'

const ORGANIZATION: Organization = {
  id: '00000000-0000-4000-8000-000000000051',
  name: 'الهيئة العامة للرقابة والتفتيش',
  code: 'ORG-001',
  status: 'Active',
}

describe('organizationFormSchema', () => {
  it('requires both fields on create, at the lengths the validators enforce', () => {
    const schema = organizationFormSchema(true)

    expect(schema.safeParse({ name: 'جهة', code: 'ORG-001' }).success).toBe(true)
    expect(schema.safeParse({ name: 'جهة', code: '' }).error?.issues[0]?.message).toBe(
      'رمز الجهة مطلوب.',
    )
    expect(schema.safeParse({ name: 'جهة', code: 'x'.repeat(51) }).error?.issues[0]?.message).toBe(
      'رمز الجهة يجب ألّا يتجاوز 50 محرفاً.',
    )
    expect(schema.safeParse({ name: 'ه', code: 'ORG-001' }).error?.issues[0]?.message).toBe(
      'اسم الجهة يجب أن يتكون من حرفين على الأقل.',
    )
    expect(
      schema.safeParse({ name: 'ا'.repeat(201), code: 'ORG-001' }).error?.issues[0]?.message,
    ).toBe('اسم الجهة يجب ألّا يتجاوز 200 محرف.')
  })

  it('drops the create-only requirement for the code on update', () => {
    // `PUT /organizations/{id}` binds `name` only: the code is not part of the
    // update body, so an empty one must not block the edit of an existing row.
    const schema = organizationFormSchema(false)

    expect(schema.safeParse({ name: 'جهة محدّثة', code: '' }).success).toBe(true)
    expect(schema.safeParse({ name: '', code: 'ORG-001' }).success).toBe(false)
  })

  it('seeds create and edit forms from the record the projection serves', () => {
    expect(emptyOrganizationFormValues()).toEqual({ name: '', code: '' })
    expect(toOrganizationFormValues(null)).toEqual({ name: '', code: '' })
    // `name` and `code` are the fields the READ serves — no `nameAr` and no
    // `rowVersion`, because Organization is not a versioned aggregate.
    expect(toOrganizationFormValues(ORGANIZATION)).toEqual({
      name: ORGANIZATION.name,
      code: ORGANIZATION.code,
    })
  })
})

describe('organization request mappers', () => {
  it('sends name and code on create and nothing else', () => {
    expect(toCreateOrganizationRequest({ name: '  مديرية حسوب  ', code: '  ORG-HS  ' })).toEqual({
      name: 'مديرية حسوب',
      code: 'ORG-HS',
    })
  })

  it('sends name alone on update, never the create-only code', () => {
    const request = toUpdateOrganizationRequest({ name: '  جهة محدّثة  ', code: 'ORG-001' })

    expect(request).toEqual({ name: 'جهة محدّثة' })
    // The update route's request body is `additionalProperties: false` and binds
    // no `code`, so a code rename is not expressible through this API — nor is
    // a status, which is a separate command.
    expect(Object.keys(request)).toEqual(['name'])
    expect(request).not.toHaveProperty('code')
    expect(request).not.toHaveProperty('status')
  })
})
