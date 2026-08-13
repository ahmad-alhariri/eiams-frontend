import { IconCalendar, IconX } from '@tabler/icons-react'
import { useId, useState } from 'react'

import { Calendar } from '@/shared/ui/calendar'
import { formatArabicDate } from '@/shared/ui/calendar-utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { cn } from '@/shared/utils/class-names'

export interface DatePickerProps {
  /** The selected date. */
  value?: Date
  /** The initially selected date for the uncontrolled picker. */
  defaultValue?: Date
  /** Called when the date changes through selection or clearing. */
  onChange?: (date: Date | undefined) => void
  /** Earliest selectable date (inclusive), forwarded to the calendar. */
  min?: Date
  /** Latest selectable date (inclusive), forwarded to the calendar. */
  max?: Date
  /** Disables the picker entirely. */
  disabled?: boolean
  /** Placeholder shown when no date is selected. Defaults to "اختر التاريخ". */
  placeholder?: string
  className?: string
}

function DatePicker({
  value,
  defaultValue,
  onChange,
  min,
  max,
  disabled = false,
  placeholder = 'اختر التاريخ',
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [pickerKey, setPickerKey] = useState(0)
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const triggerId = useId()
  const selected = value ?? uncontrolledValue

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setPickerKey((key) => key + 1)
    }
    setOpen(nextOpen)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <div className={cn('relative', className)}>
        <PopoverTrigger
          id={triggerId}
          data-slot="date-picker-trigger"
          disabled={disabled}
          aria-label={selected ? `التاريخ المحدد: ${formatArabicDate(selected)}` : placeholder}
          className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-popover px-3 py-2 text-start text-base text-foreground whitespace-nowrap transition-[color,box-shadow,background-color] outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-expanded:border-ring"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? formatArabicDate(selected) : placeholder}
          </span>
          <IconCalendar aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        {selected && !disabled ? (
          <button
            type="button"
            aria-label="مسح التاريخ"
            onClick={() => {
              if (value === undefined) {
                setUncontrolledValue(undefined)
              }
              onChange?.(undefined)
            }}
            className="absolute end-9 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors select-none outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <IconX aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      <PopoverContent side="bottom" sideOffset={4} align="start" className="w-fit p-2.5">
        <Calendar
          key={pickerKey}
          {...(min ? { min } : {})}
          {...(max ? { max } : {})}
          {...(selected ? { value: selected, defaultMonth: selected } : {})}
          onChange={(date) => {
            if (value === undefined) {
              setUncontrolledValue(date)
            }
            onChange?.(date)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }
