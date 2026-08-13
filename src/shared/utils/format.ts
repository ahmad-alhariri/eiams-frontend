import 'dayjs/locale/ar'
import dayjs from 'dayjs'

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

function toDate(date: Date | string) {
  return date instanceof Date ? dayjs(date) : dayjs(date)
}

/**
 * Converts Western digits in a string or number to Eastern Arabic numerals
 * (٠١٢٣٤٥٦٧٨٩). Non-digit characters pass through unchanged.
 */
export function toArabicDigits(value: string | number) {
  return String(value).replace(/[0-9]/g, (digit) => ARABIC_DIGITS[Number(digit)] ?? digit)
}

export interface FormatNumberOptions {
  /** Numerals to render. Defaults to the app-wide Arabic-Indic digits. */
  digits?: 'arabic' | 'latin'
  maxFractionDigits?: number
}

/**
 * Formats a number with thousand grouping, e.g. "١٢٬٣٤٥٫٦٧".
 */
export function formatNumber(value: number, options?: FormatNumberOptions) {
  const { digits = 'arabic', maxFractionDigits = 2 } = options ?? {}
  const grouped = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxFractionDigits,
  }).format(value)
  if (digits === 'latin') {
    return grouped
  }
  return toArabicDigits(grouped).replace(/,/g, '٬').replace(/\./g, '٫')
}

/**
 * Formats a percentage, e.g. "١٢٫٥٪".
 */
export function formatPercent(value: number) {
  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
  return `${toArabicDigits(formatted).replace(/\./g, '٫')}٪`
}

/**
 * Arabic month name, e.g. "أغسطس" for August.
 */
function arMonthName(date: Date | string) {
  return toDate(date).locale('ar').format('MMMM')
}

/**
 * Formats a date, e.g. "١٥ أغسطس ٢٠٢٦".
 */
export function formatDate(date: Date | string) {
  const day = toDate(date)
  return `${toArabicDigits(day.date())} ${arMonthName(date)} ${toArabicDigits(day.year())}`
}

/**
 * Formats a date with time, e.g. "١٥ أغسطس ٢٠٢٦ ١٠:٣٠ ص".
 */
export function formatDateTime(date: Date | string) {
  return `${formatDate(date)} ${formatTime(date)}`
}

/**
 * Formats a time of day, e.g. "١٠:٣٠ ص".
 */
export function formatTime(date: Date | string) {
  const day = toDate(date)
  const hour = day.hour()
  const period = hour < 12 ? 'ص' : 'م'
  const hour12 = hour % 12 || 12
  return `${toArabicDigits(hour12)}:${toArabicDigits(day.minute().toString().padStart(2, '0'))} ${period}`
}

/**
 * Formats a month and year, e.g. "أغسطس ٢٠٢٦".
 */
export function formatMonthYear(date: Date | string) {
  return `${arMonthName(date)} ${toArabicDigits(toDate(date).year())}`
}

/**
 * Formats a date relative to today, e.g. "اليوم", "أمس", "منذ ٣ أيام".
 */
export function formatRelativeDate(date: Date | string) {
  const day = toDate(date).startOf('day')
  const today = dayjs().startOf('day')
  const diff = today.diff(day, 'day')
  if (diff === 0) {
    return 'اليوم'
  }
  if (diff === 1) {
    return 'أمس'
  }
  if (diff === -1) {
    return 'غداً'
  }
  const count = toArabicDigits(Math.abs(diff))
  return diff > 0 ? `منذ ${count} أيام` : `بعد ${count} أيام`
}

/**
 * Shortens a UUID for compact table display, e.g. "3F2A9B1C…".
 */
export function formatUuid(id: string) {
  return `${id.slice(0, 8).toUpperCase()}…`
}

const FILE_SIZE_UNITS = ['بايت', 'ك.ب', 'م.ب', 'ج.ب'] as const

/**
 * Formats a byte count in Arabic units, e.g. "٤٫٥ م.ب". The unit name stays
 * Arabic while the number follows the app-wide Arabic-Indic digits.
 */
export function formatFileSize(bytes: number) {
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const digits = value >= 10 ? value.toFixed(0) : value.toFixed(1)
  return `${toArabicDigits(digits).replace(/\./g, '٫')} ${FILE_SIZE_UNITS[unitIndex]}`
}

/**
 * Truncates a long identifier for table display. Server-owned references pass
 * through unchanged until they exceed `maxLength`.
 */
export function formatIdentifier(value: string, maxLength = 24) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}…`
}
