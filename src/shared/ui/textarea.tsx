import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/class-names'

type TextareaProps = ComponentProps<'textarea'>

function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      {...props}
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-16 w-full resize-y rounded-md border border-input bg-popover px-3 py-2 text-start text-base text-foreground transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 read-only:cursor-default read-only:bg-muted/50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30',
        className,
      )}
    />
  )
}

export { Textarea, type TextareaProps }
