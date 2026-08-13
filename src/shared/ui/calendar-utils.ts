import 'dayjs/locale/ar'
import dayjs from 'dayjs'
import localeData from 'dayjs/plugin/localeData'

dayjs.extend(localeData)

/**
 * Arabic month name, e.g. "أغسطس" for August.
 */
export function arMonthName(date: Date) {
  return dayjs(date).locale('ar').format('MMMM')
}

function arWeekdayNames(which: 'short' | 'full') {
  const locale = dayjs().locale('ar')
  const data = locale.localeData()
  const weekStart = data.firstDayOfWeek()
  const weekdays = which === 'short' ? data.weekdaysShort() : data.weekdays()
  return [...weekdays.slice(weekStart), ...weekdays.slice(0, weekStart)]
}

/**
 * Arabic weekday short names rotated to the locale week start (Saturday): سبت، أحد، ...
 */
export function arWeekdayShorts() {
  return arWeekdayNames('short')
}

/**
 * Arabic weekday full names rotated to the locale week start.
 */
export function arWeekdaysFull() {
  return arWeekdayNames('full')
}

/**
 * Formats a date for display, e.g. "15 أغسطس 2026".
 */
export function formatArabicDate(date: Date) {
  return `${date.getDate()} ${arMonthName(date)} ${date.getFullYear()}`
}
