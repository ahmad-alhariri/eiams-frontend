import type { ComponentProps } from 'react'

import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { cn } from '@/shared/utils/class-names'

type FullPageSpinnerProps = ComponentProps<'div'> & {
  label?: string
}

function FullPageSpinner({ className, label = 'جاري التحميل...', ...props }: FullPageSpinnerProps) {
  return (
    <div
      {...props}
      data-slot="full-page-spinner"
      className={cn('flex min-h-96 w-full items-center justify-center p-8', className)}
    >
      <LoadingSpinner label={label} size="lg" className="flex-col gap-3 text-center" />
    </div>
  )
}

export { FullPageSpinner, type FullPageSpinnerProps }
