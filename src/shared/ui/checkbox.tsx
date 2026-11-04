import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { IconCheck } from '@tabler/icons-react'

import { cn } from '@/shared/utils/class-names'

type CheckboxProps = CheckboxPrimitive.Root.Props

function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      {...props}
      data-slot="checkbox"
      className={cn(
        // The 16px box keeps its ui-design.md size. The invisible `after`
        // pseudo-element is the HIT AREA: it is sized against the PADDING box
        // (14.67px), so `-inset-3` (12px) reaches 38.67x38.67px — measured in
        // the browser, not assumed. Reaching a full 40px would need a 12.67px
        // inset, which is not a spacing token and would push the hit area over
        // the adjacent cell's link (4.67px clearance, measured) and turn a
        // link tap into a checkbox toggle.
        'peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-popover text-primary-foreground transition-[color,box-shadow,background-color] outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-3 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-disabled:cursor-not-allowed data-disabled:opacity-50',
        className,
      )}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <IconCheck aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox, type CheckboxProps }
