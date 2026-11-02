/**
 * The Arabic-Indic numerals, and the helpers that render a number in them.
 *
 * WHY THIS IS A MODULE OF ITS OWN. `format.ts` needs `dayjs` — and the
 * Arabic dayjs locale — for the Arabic month names, so a module that only
 * wants to turn a number into Arabic-Indic digits must not import it. The
 * header is part of the ENTRY chunk: importing `format.ts` there pulled
 * `dayjs` and its Arabic locale into the entry bundle, 9768 bytes past the
 * committed ceiling in `src/config/bundle-budget.json`.
 *
 * `format.ts` re-exports these three helpers, so the call sites that are not
 * on the entry path keep working. An EAGERLY loaded module — one that lands in
 * the entry chunk — must import them from HERE.
 */

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']

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
