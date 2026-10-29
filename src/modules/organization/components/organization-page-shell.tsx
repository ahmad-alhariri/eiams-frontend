import type { PropsWithChildren, ReactNode } from 'react'
import { PageHeader } from '@/shared/layout/page-header'

export interface OrganizationPageShellProps extends PropsWithChildren {
  titleAr: string
  subtitle?: string
  actions?: ReactNode
}

/**
 * The header every organization page repeats: the Arabic title, an optional
 * subtitle and the page's own actions.
 *
 * It owns the header ONLY. The permission gate belongs to the route guard
 * (`src/config/routes.ts`), and the loading / error / empty states belong to
 * each page's own table, which carries the page-specific Arabic wording.
 */
export function OrganizationPageShell({
  titleAr,
  subtitle,
  actions,
  children,
}: OrganizationPageShellProps) {
  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader title={titleAr} subtitle={subtitle} actions={actions} />
      {children}
    </div>
  )
}
