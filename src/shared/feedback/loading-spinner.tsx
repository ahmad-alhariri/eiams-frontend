import { IconLoader2 } from '@tabler/icons-react'
import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/class-names'

type LoadingSpinnerProps = ComponentProps<'div'> & {
  label?: string
  size?: 'sm' | 'default' | 'lg'
}

const spinnerSizes: Record<NonNullable<LoadingSpinnerProps['size']>, string> = {
  sm: 'size-4',
  default: 'size-6',
  lg: 'size-12',
}

function LoadingSpinner({
  'aria-label': ariaLabel,
  className,
  label = 'جاري التحميل...',
  size = 'default',
  ...props
}: LoadingSpinnerProps) {
  return (
    <div
      {...props}
      data-slot="loading-spinner"
      role="status"
      aria-label={ariaLabel ?? label}
      aria-live="polite"
      className={cn(
        'inline-flex items-center justify-center gap-2 text-muted-foreground',
        className,
      )}
    >
      <IconLoader2
        data-slot="loading-spinner-icon"
        className={cn(
          'shrink-0 animate-spin text-accent motion-reduce:animate-none',
          spinnerSizes[size],
        )}
        aria-hidden
      />
      <span className="text-base">{label}</span>
    </div>
  )
}

export { LoadingSpinner, type LoadingSpinnerProps }
