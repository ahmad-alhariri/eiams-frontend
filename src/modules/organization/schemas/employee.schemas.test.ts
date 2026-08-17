import { describe, expect, it } from 'vitest'

import { employeeSchema } from './employee.schemas'

const VALID_VALUES = {
  employeeNumber: 'EMP-001',
  fullNameAr: 'موظف تجريبي',
  jobTitleAr: 'أمين مستودع',
  orgUnitId: '00000000-0000-4000-8000-000000000052',
  status: 'Active' as const,
}

describe('employeeSchema', () => {
  it('accepts the OpenAPI fullNameAr maximum of 250 characters', () => {
    const nameAtContractLimit = 'م'.repeat(250)

    expect(
      employeeSchema.safeParse({ ...VALID_VALUES, fullNameAr: nameAtContractLimit }).success,
    ).toBe(true)
    expect(employeeSchema.safeParse({ ...VALID_VALUES, fullNameAr: 'م'.repeat(251) }).success).toBe(
      false,
    )
  })

  it('rejects blank required identifiers so empty submissions never reach the server', () => {
    expect(employeeSchema.safeParse({ ...VALID_VALUES, fullNameAr: '' }).success).toBe(false)
    expect(employeeSchema.safeParse({ ...VALID_VALUES, fullNameAr: '   ' }).success).toBe(false)
    expect(employeeSchema.safeParse({ ...VALID_VALUES, employeeNumber: '' }).success).toBe(false)
    expect(employeeSchema.safeParse({ ...VALID_VALUES, employeeNumber: '   ' }).success).toBe(false)
  })
})
