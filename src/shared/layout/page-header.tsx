import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/shared/utils/class-names'

type PageHeaderProps = Omit<ComponentProps<'section'>, 'title'> & {
  actions?: ReactNode
  subtitle?: ReactNode
  title: ReactNode
  titleId?: string
  toolbar?: ReactNode
}

function PageHeader({
  actions,
  children,
  className,
  subtitle,
  title,
  titleId,
  toolbar,
  ...props
}: PageHeaderProps) {
  const generatedTitleId = useId()
  const resolvedTitleId = titleId ?? generatedTitleId

  return (
    <section
      {...props}
      data-slot="page-header"
      aria-labelledby={resolvedTitleId}
      className={cn(
        'mb-6 flex flex-col gap-4 rounded-xl border border-border bg-popover p-6 text-card-foreground shadow-card',
        className,
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 id={resolvedTitleId} className="text-xl leading-tight font-semibold text-foreground">
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? (
          <div data-slot="page-header-actions" className="flex flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {toolbar || children ? (
        <div data-slot="page-header-toolbar" className="border-t border-border pt-4">
          {toolbar ?? children}
        </div>
      ) : null}
    </section>
  )
}

export { PageHeader, type PageHeaderProps }
