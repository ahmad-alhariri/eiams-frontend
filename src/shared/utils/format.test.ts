import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatDateTime,
  formatIdentifier,
  formatMonthYear,
  formatNumber,
  formatPercent,
  formatRelativeDate,
  formatTime,
  formatUuid,
  toArabicDigits,
} from '@/shared/utils/format'

describe('toArabicDigits', () => {
  it('converts Western digits to Eastern Arabic numerals', () => {
    expect(toArabicDigits('2026-08-15')).toBe('٢٠٢٦-٠٨-١٥')
  })

  it('converts numbers and leaves other characters intact', () => {
    expect(toArabicDigits(123)).toBe('١٢٣')
    expect(toArabicDigits('رقم 42!')).toBe('رقم ٤٢!')
  })
})

describe('formatNumber', () => {
  it('groups thousands with Arabic-Indic digits by default', () => {
    expect(formatNumber(1234567.89)).toBe('١٬٢٣٤٬٥٦٧٫٨٩')
  })

  it('keeps Latin digits on request', () => {
    expect(formatNumber(1234.5, { digits: 'latin' })).toBe('1,234.5')
  })

  it('respects max fraction digits', () => {
    expect(formatNumber(1.236, { maxFractionDigits: 0 })).toBe('١')
  })
})

describe('formatPercent', () => {
  it('renders a percentage with Arabic digits', () => {
    expect(formatPercent(12.5)).toBe('١٢٫٥٪')
  })
})

describe('formatDate', () => {
  it('formats a date in Arabic', () => {
    expect(formatDate(new Date(2026, 7, 15))).toBe('١٥ أغسطس ٢٠٢٦')
  })

  it('accepts an ISO string', () => {
    expect(formatDate('2026-08-15T10:30:00')).toBe('١٥ أغسطس ٢٠٢٦')
  })
})

describe('formatDateTime / formatTime', () => {
  it('formats a date with its time', () => {
    expect(formatDateTime('2026-08-15T10:30:00')).toBe('١٥ أغسطس ٢٠٢٦ ١٠:٣٠ ص')
  })

  it('uses the afternoon marker for 12-hour times', () => {
    expect(formatTime('2026-08-15T22:05:00')).toBe('١٠:٠٥ م')
    expect(formatTime('2026-08-15T12:00:00')).toBe('١٢:٠٠ م')
  })

  it('pads minutes', () => {
    expect(formatTime('2026-08-15T09:05:00')).toBe('٩:٠٥ ص')
  })
})

describe('formatMonthYear', () => {
  it('formats month and year in Arabic', () => {
    expect(formatMonthYear(new Date(2026, 7, 1))).toBe('أغسطس ٢٠٢٦')
  })
})

describe('formatRelativeDate', () => {
  it('renders today and yesterday', () => {
    expect(formatRelativeDate(new Date())).toBe('اليوم')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(formatRelativeDate(yesterday)).toBe('أمس')
  })

  it('renders a day count in Arabic', () => {
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    expect(formatRelativeDate(threeDaysAgo)).toBe('منذ ٣ أيام')
  })
})

describe('identifiers', () => {
  it('shortens a UUID for compact display', () => {
    expect(formatUuid('3f2a9b1c-1234-5678-9abc-def012345678')).toBe('3F2A9B1C…')
  })

  it('passes short identifiers through and truncates long ones', () => {
    expect(formatIdentifier('RC-2026-000123')).toBe('RC-2026-000123')
    expect(formatIdentifier('x'.repeat(40))).toBe(`${'x'.repeat(24)}…`)
  })
})
