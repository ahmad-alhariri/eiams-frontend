import type { ComponentProps, ReactNode } from 'react'

import { CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card'
import { cn } from '@/shared/utils/class-names'

type ContentCardProps = ComponentProps<'section'> & {
  action?: ReactNode
  description?: ReactNode
  footer?: ReactNode
  title?: ReactNode
}

function ContentCard({
  action,
  children,
  className,
  description,
  footer,
  title,
  ...props
}: ContentCardProps) {
  const hasHeader = Boolean(title || description || action)

  return (
    <section
      {...props}
      data-slot="content-card"
      className={cn(
        'mb-6 flex flex-col rounded-xl border border-border bg-popover p-6 text-card-foreground shadow-card [--card-spacing:--spacing(6)]',
        className,
      )}
    >
      {hasHeader ? (
        <CardHeader className="p-0">
          {title ? <CardTitle>{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
          {action ? <CardAction>{action}</CardAction> : null}
        </CardHeader>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
      {footer ? <CardFooter className="mt-4 border-t px-0 pt-4">{footer}</CardFooter> : null}
    </section>
  )
}

export { ContentCard, type ContentCardProps }
