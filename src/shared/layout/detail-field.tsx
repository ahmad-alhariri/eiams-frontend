import type { ReactNode } from 'react'

export interface DetailFieldProps {
  children: ReactNode
  label: string
  /** Renders the value in a left-to-right reading direction (codes, IDs). */
  ltr?: boolean
}

/** Read-only labeled value row used by contract-backed detail pages. */
export function DetailField({ children, label, ltr = false }: DetailFieldProps) {
  return (
    <div className="border-b border-border pb-4 last:border-b-0 sm:border-b-0">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-base font-medium text-foreground" dir={ltr ? 'ltr' : undefined}>
        {children}
      </dd>
    </div>
  )
}
