import dayjs from 'dayjs'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useId, useRef, useState, type KeyboardEvent } from 'react'

import { Button, buttonVariants } from '@/shared/ui/button'
import { arMonthName, arWeekdaysFull, arWeekdayShorts } from '@/shared/ui/calendar-utils'
import { cn } from '@/shared/utils/class-names'

/** Saturday is the first day of the official week per the dayjs Arabic locale. */
const WEEK_START = 6
const WEEK_LENGTH = 7
const GRID_WEEKS = 6

export interface CalendarProps {
  /** The selected date. */
  value?: Date
  /** The initially selected date for the uncontrolled calendar. */
  defaultValue?: Date
  /** The month shown initially. Falls back to `value`/`defaultValue`, then today. */
  defaultMonth?: Date
  /** Called when a day is chosen. */
  onChange?: (date: Date) => void
  /** Called when the visible month changes through navigation. */
  onMonthChange?: (date: Date) => void
  /** Earliest selectable date (inclusive). */
  min?: Date
  /** Latest selectable date (inclusive). */
  max?: Date
  /** Disables the whole calendar. */
  disabled?: boolean
  className?: string
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

function sameDay(a: Date, b?: Date) {
  return (
    b !== undefined &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function buildWeeks(month: Date): Date[][] {
  const offset = (startOfMonth(month).getDay() - WEEK_START + WEEK_LENGTH) % WEEK_LENGTH
  const gridStart = dayjs(startOfMonth(month)).subtract(offset, 'day')
  return Array.from({ length: GRID_WEEKS }, (_, week) =>
    Array.from({ length: WEEK_LENGTH }, (_, day) =>
      gridStart.add(week * WEEK_LENGTH + day, 'day').toDate(),
    ),
  )
}

function Calendar({ className, ...props }: CalendarProps) {
  const {
    value,
    defaultValue,
    defaultMonth,
    onChange,
    onMonthChange,
    min,
    max,
    disabled: calendarDisabled = false,
  } = props

  const today = new Date()
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const selectedValue = value ?? uncontrolledValue
  const initialMonth = startOfMonth(defaultMonth ?? selectedValue ?? today)
  const [month, setMonth] = useState(initialMonth)
  const [focusedDate, setFocusedDate] = useState(() =>
    selectedValue && isSameMonth(selectedValue, initialMonth) ? selectedValue : initialMonth,
  )
  const captionId = useId()

  const weeks = buildWeeks(month)

  function moveMonth(direction: -1 | 1) {
    const next = dayjs(month).add(direction, 'month').toDate()
    setMonth(next)
    setFocusedDate(dayjs(focusedDate).add(direction, 'month').toDate())
    onMonthChange?.(next)
  }

  function isDayDisabled(date: Date) {
    if (calendarDisabled) {
      return true
    }
    if (min && dayjs(date).isBefore(dayjs(min), 'day')) {
      return true
    }
    if (max && dayjs(date).isAfter(dayjs(max), 'day')) {
      return true
    }
    return false
  }

  function isNavDisabled(direction: -1 | 1) {
    if (calendarDisabled) {
      return true
    }
    if (direction === -1 && min && dayjs(startOfMonth(month)).isSame(dayjs(min), 'month')) {
      return true
    }
    if (direction === 1 && max && dayjs(endOfMonth(month)).isSame(dayjs(max), 'month')) {
      return true
    }
    return false
  }

  function selectDate(date: Date) {
    if (isDayDisabled(date)) {
      return
    }
    if (!isSameMonth(date, month)) {
      setMonth(startOfMonth(date))
    }
    setFocusedDate(date)
    if (value === undefined) {
      setUncontrolledValue(date)
    }
    onChange?.(date)
  }

  function focusDate(date: Date) {
    const target = clampToGrid(date)
    setFocusedDate(target)
    dayButtons.current[target.toDateString()]?.focus()
  }

  /** Keeps keyboard navigation inside the visible 6x7 window. */
  function clampToGrid(date: Date) {
    const first = weeks[0]?.[0]
    const last = weeks[GRID_WEEKS - 1]?.[WEEK_LENGTH - 1]
    if (!first || !last) {
      return date
    }
    if (dayjs(date).isBefore(dayjs(first), 'day')) {
      return first
    }
    if (dayjs(date).isAfter(dayjs(last), 'day')) {
      return last
    }
    return date
  }

  const dayButtons = useRef<Record<string, HTMLButtonElement | null>>({})

  function handleKeyDown(event: KeyboardEvent) {
    const step: Record<string, number> = {
      ArrowDown: WEEK_LENGTH,
      ArrowUp: -WEEK_LENGTH,
      ArrowLeft: -1,
      ArrowRight: 1,
    }
    const offset = step[event.key]
    if (offset !== undefined) {
      event.preventDefault()
      focusDate(dayjs(focusedDate).add(offset, 'day').toDate())
      return
    }
    switch (event.key) {
      case 'Home':
        event.preventDefault()
        focusDate(startOfMonth(month))
        break
      case 'End':
        event.preventDefault()
        focusDate(endOfMonth(month))
        break
      case 'PageUp':
        event.preventDefault()
        focusDate(dayjs(focusedDate).subtract(1, 'month').toDate())
        break
      case 'PageDown':
        event.preventDefault()
        focusDate(dayjs(focusedDate).add(1, 'month').toDate())
        break
      case ' ':
      case 'Enter':
        event.preventDefault()
        selectDate(focusedDate)
        break
    }
  }

  const weekdays = arWeekdayShorts()
  const weekdaysFull = arWeekdaysFull()

  return (
    <div data-slot="calendar" className={cn('w-fit', className)}>
      <div
        data-slot="calendar-caption"
        aria-live="polite"
        className="flex items-center justify-between px-1 pb-2"
      >
        <div id={captionId} className="text-base font-semibold text-foreground">
          {arMonthName(month)} {month.getFullYear()}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="الشهر السابق"
            disabled={isNavDisabled(-1)}
            onClick={() => moveMonth(-1)}
          >
            <IconChevronLeft className="rtl:rotate-180" aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            aria-label="الشهر التالي"
            disabled={isNavDisabled(1)}
            onClick={() => moveMonth(1)}
          >
            <IconChevronRight className="rtl:rotate-180" aria-hidden />
          </Button>
        </div>
      </div>

      <div role="grid" aria-labelledby={captionId} className="w-fit" onKeyDown={handleKeyDown}>
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((short, index) => (
            <div
              key={short}
              role="columnheader"
              aria-label={weekdaysFull[index]}
              className="flex size-9 items-center justify-center text-base font-medium text-muted-foreground"
            >
              {short}
            </div>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} role="row" className="grid grid-cols-7">
            {week.map((date) => {
              const selected = sameDay(date, selectedValue)
              const isToday = sameDay(date, today)
              const outside = !isSameMonth(date, month)
              const isFocused = date.toDateString() === focusedDate.toDateString()
              const dayLabel = `${date.getDate()} ${arMonthName(date)} ${date.getFullYear()}`
              return (
                <div
                  key={date.toDateString()}
                  role="gridcell"
                  aria-selected={selected || undefined}
                  data-outside={outside || undefined}
                  className="p-0"
                >
                  <button
                    ref={(element) => {
                      dayButtons.current[date.toDateString()] = element
                    }}
                    type="button"
                    tabIndex={isFocused ? 0 : -1}
                    aria-label={dayLabel}
                    aria-disabled={isDayDisabled(date) || undefined}
                    disabled={isDayDisabled(date)}
                    onClick={() => selectDate(date)}
                    className={cn(
                      buttonVariants({ variant: 'ghost', size: 'icon' }),
                      'relative p-0 text-base font-normal',
                      outside && 'text-popover-foreground/40',
                      isToday && 'border border-accent',
                      selected &&
                        'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {date.getDate()}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export { Calendar }
