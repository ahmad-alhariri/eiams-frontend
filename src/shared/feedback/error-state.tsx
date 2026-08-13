import { IconAlertTriangle } from '@tabler/icons-react'
import { useId, type ReactNode } from 'react'

import { cn } from '@/shared/utils/class-names'

type ErrorStateProps = {
  action?: ReactNode
  className?: string
  description?: string
  title?: string
}

function ErrorState({
  action,
  className,
  description = 'تعذر تحميل البيانات. حاول مرة أخرى أو تواصل مع الدعم الفني إذا استمرت المشكلة.',
  title = 'حدث خطأ',
}: ErrorStateProps) {
  const titleId = useId()

  return (
    <section
      data-slot="error-state"
      role="alert"
      aria-labelledby={titleId}
      className={cn(
        'flex min-h-64 flex-col items-center justify-center rounded-xl border border-destructive/40 bg-popover p-8 text-center shadow-card',
        className,
      )}
    >
      <div
        data-slot="error-state-icon"
        className="mb-4 flex size-24 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden
      >
        <IconAlertTriangle className="size-12" />
      </div>
      <h2 id={titleId} className="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-base text-muted-foreground">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  )
}

export { ErrorState, type ErrorStateProps }
