import { IconInbox } from '@tabler/icons-react'
import { useId, type ReactNode } from 'react'

import { cn } from '@/shared/utils/class-names'

type EmptyStateProps = {
  action?: ReactNode
  className?: string
  description?: string
  icon?: ReactNode
  title?: string
}

function EmptyState({
  action,
  className,
  description = 'لم يتم العثور على سجلات مطابقة.',
  icon,
  title = 'لا توجد بيانات',
}: EmptyStateProps) {
  const titleId = useId()

  return (
    <section
      data-slot="empty-state"
      aria-labelledby={titleId}
      className={cn(
        'flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-popover p-8 text-center shadow-card',
        className,
      )}
    >
      <div
        data-slot="empty-state-icon"
        className="mb-4 flex size-24 items-center justify-center rounded-full bg-muted text-golden-wheat"
        aria-hidden
      >
        {icon ?? <IconInbox className="size-12" />}
      </div>
      <h2 id={titleId} className="text-lg font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-base text-muted-foreground">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </section>
  )
}

export { EmptyState, type EmptyStateProps }
