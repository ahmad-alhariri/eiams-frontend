import type { LabelHTMLAttributes } from 'react'

import { cn } from '@/shared/utils/class-names'

type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

function Label({ className, ...props }: LabelProps) {
  return (
    <label
      {...props}
      data-slot="label"
      className={cn(
        'text-base font-semibold text-foreground select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60',
        className,
      )}
    />
  )
}

export { Label, type LabelProps }
