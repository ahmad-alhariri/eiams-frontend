import { describe, expect, it } from 'vitest'

import {
  fromIssueInfo,
  ISSUE_RECIPIENT_TYPE_LABELS_AR,
  ISSUE_RECIPIENT_TYPES,
  issueInfoSchema,
  recipientTypeLabelAr,
  toIssueInfo,
} from '@/modules/issue/schemas/issue-info.schema'

const VALID_RECIPIENT_ID = '123e4567-e89b-42d3-a456-426614174000'

describe('issueInfoSchema', () => {
  it('accepts every contract recipient type with a recipient and reason', () => {
    for (const recipientType of ISSUE_RECIPIENT_TYPES) {
      const result = issueInfoSchema.safeParse({
        recipientType,
        recipientId: VALID_RECIPIENT_ID,
        issueReason: 'صرف أدوات مكتبية',
      })
      expect(result.success).toBe(true)
    }
  })

  it('rejects an empty recipient type with an Arabic message', () => {
    const result = issueInfoSchema.safeParse({
      recipientType: '',
      recipientId: VALID_RECIPIENT_ID,
      issueReason: 'صرف أدوات مكتبية',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب اختيار نوع الجهة المستلمة.')
    }
  })

  it('rejects an empty recipient id and a non-UUID recipient id', () => {
    const empty = issueInfoSchema.safeParse({
      recipientType: 'Employee',
      recipientId: '',
      issueReason: 'صرف أدوات مكتبية',
    })
    expect(empty.success).toBe(false)
    if (!empty.success) {
      expect(empty.error.issues[0]?.message).toBe('يجب اختيار الجهة المستلمة من القائمة.')
    }

    const malformed = issueInfoSchema.safeParse({
      recipientType: 'Site',
      recipientId: 'not-a-uuid',
      issueReason: 'صرف أدوات مكتبية',
    })
    expect(malformed.success).toBe(false)
    if (!malformed.success) {
      expect(malformed.error.issues[0]?.message).toBe('يجب اختيار الجهة المستلمة من القائمة.')
    }
  })

  it('rejects a blank issue reason with an Arabic message', () => {
    const result = issueInfoSchema.safeParse({
      recipientType: 'Employee',
      recipientId: VALID_RECIPIENT_ID,
      issueReason: '   ',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('يجب إدخال سبب الصرف.')
    }
  })

  it('enforces the presentation-level 500-char cap on the issue reason', () => {
    const result = issueInfoSchema.safeParse({
      recipientType: 'Employee',
      recipientId: VALID_RECIPIENT_ID,
      issueReason: 'م'.repeat(501),
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'يجب ألا يتجاوز سبب الصرف 500 محرفاً.',
      )
    }
  })
})

describe('toIssueInfo / fromIssueInfo', () => {
  it('maps form values to the contract shape, trimming the issue reason', () => {
    expect(
      toIssueInfo({
        recipientType: 'Employee',
        recipientId: VALID_RECIPIENT_ID,
        issueReason: '  صرف أدوات مكتبية  ',
      }),
    ).toEqual({
      issueReason: 'صرف أدوات مكتبية',
      recipientDisplayName: '',
      recipientId: VALID_RECIPIENT_ID,
      recipientType: 'Employee',
    })
  })

  it('uses the provided recipient display name when one is passed', () => {
    const info = toIssueInfo(
      {
        recipientType: 'OrganizationalUnit',
        recipientId: VALID_RECIPIENT_ID,
        issueReason: 'صرف أثاث مكتبي',
      },
      'وحدة المشتريات',
    )
    expect(info.recipientDisplayName).toBe('وحدة المشتريات')
  })

  it('round-trips a server record through the form values', () => {
    const server = {
      issueReason: 'صرف مستلزمات نظافة',
      recipientDisplayName: 'أحمد الخطيب',
      recipientId: VALID_RECIPIENT_ID,
      recipientType: 'Site' as const,
    }
    const values = fromIssueInfo(server)
    expect(values).toEqual({
      recipientType: 'Site',
      recipientId: VALID_RECIPIENT_ID,
      issueReason: 'صرف مستلزمات نظافة',
    })
    expect(toIssueInfo(values)).toEqual({ ...server, recipientDisplayName: '' })
    expect(fromIssueInfo(toIssueInfo(values))).toEqual(values)
  })

  it('defaults a missing petal to blank draft fields', () => {
    expect(fromIssueInfo(undefined)).toEqual({
      recipientType: '',
      recipientId: '',
      issueReason: '',
    })
  })

  it('treats a null petal like an absent one', () => {
    expect(fromIssueInfo(null)).toEqual({
      recipientType: '',
      recipientId: '',
      issueReason: '',
    })
  })
})

describe('recipient labels', () => {
  it('labels every contract recipient type in Arabic', () => {
    expect(ISSUE_RECIPIENT_TYPE_LABELS_AR).toMatchObject({
      Employee: 'موظف',
      OrganizationalUnit: 'وحدة تنظيمية',
      Site: 'موقع',
      External: 'جهة خارجية',
    })
  })

  it('renders an unknown server value as-is', () => {
    expect(recipientTypeLabelAr('Employee')).toBe('موظف')
    expect(recipientTypeLabelAr('MysteryCounterpart')).toBe('MysteryCounterpart')
  })
})
