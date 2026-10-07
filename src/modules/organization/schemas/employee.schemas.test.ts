import { describe, expect, it } from 'vitest'

import { employeeFormSchema } from './employee.schemas'

const VALID_VALUES = {
  employeeNumber: 'EMP-001',
  fullName: 'موظف تجريبي',
  jobTitle: 'أمين مستودع',
  orgUnitId: '00000000-0000-4000-8000-000000000052',
}

describe('employeeFormSchema', () => {
  it('accepts the contract fullName maximum of 250 characters', () => {
    const nameAtContractLimit = 'م'.repeat(250)

    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: nameAtContractLimit })
        .success,
    ).toBe(true)
    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: 'م'.repeat(251) }).success,
    ).toBe(false)
  })

  it('rejects blank required identifiers so empty submissions never reach the server', () => {
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: '' }).success).toBe(
      false,
    )
    expect(employeeFormSchema(true).safeParse({ ...VALID_VALUES, fullName: '   ' }).success).toBe(
      false,
    )
    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, employeeNumber: '' }).success,
    ).toBe(false)
    expect(
      employeeFormSchema(true).safeParse({ ...VALID_VALUES, employeeNumber: '   ' }).success,
    ).toBe(false)
  })

  it('requires the org unit and the employee number only in create mode', () => {
    // `PUT /employees/{id}` binds neither, so the edit form must not demand them.
    const withoutCreateOnly = { ...VALID_VALUES, orgUnitId: '', employeeNumber: '' }

    expect(employeeFormSchema(true).safeParse(withoutCreateOnly).success).toBe(false)
    expect(employeeFormSchema(false).safeParse(withoutCreateOnly).success).toBe(true)
  })

  it('carries no status field: neither write body binds one', () => {
    const parsed = employeeFormSchema(true).parse({ ...VALID_VALUES })

    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('rowVersion')
    expect(parsed).not.toHaveProperty('fullNameAr')
    expect(parsed).not.toHaveProperty('jobTitleAr')
  })
})
