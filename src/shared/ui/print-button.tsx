/**
 * Print button — informal print trigger (e23-t10, D-RPT-03 §6).
 *
 * This is a UX convenience only. It triggers `window.print()` which shows
 * the currently-visible filtered table. No server audit log is written,
 * no pagination guarantee, and browser controls headers/footers.
 *
 * This button MUST NOT be represented as an official export.
 * Per D-RPT-03 §6.2 it is hidden when formal export becomes available.
 *
 * This button appears ONLY on report tables — never on the dashboard.
 */

import { IconPrinter } from '@tabler/icons-react'

import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'

interface PrintButtonProps {
  /** aria-label override; defaults to Arabic default */
  label?: string
  /** Show spinner when printing (e.g., large table) */
  isLoading?: boolean
  /** Disable the button */
  disabled?: boolean
  /** Additional CSS classes */
  className?: string
}

const DEFAULT_LABEL = 'طباعة هذا التقرير'
const DASHBOARD_EXCLUDED_NOTICE =
  'هذه طباعة غير رسمية — للحصول على تقرير رسمي، استخدم التصدير بعد التحديث القادم للنظام.'

/**
 * Informal print button.
 *
 * Usage:
 * ```
 * <PrintButton />
 * ```
 *
 * Always rendered on report tables. Hidden on dashboard.
 * The page-level `@media print` stylesheet controls the print layout.
 */
export function PrintButton({
  label = DEFAULT_LABEL,
  isLoading = false,
  disabled = false,
  className,
}: PrintButtonProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      title={DASHBOARD_EXCLUDED_NOTICE}
      disabled={disabled || isLoading}
      onClick={() => window.print()}
      // The `icon` size is 36px (ui-design.md 5.1). The print trigger is a
      // PRIMARY control, so it reaches the 40px mobile floor through
      // min-height/min-width — which beat the size's width/height whatever the
      // cascade order is — and keeps 36px from the `sm` breakpoint up.
      className={cn('min-h-10 min-w-10 sm:min-h-9 sm:min-w-9', className)}
    >
      {isLoading ? (
        /* Spinner — use Loader2 to match the Button's loading spinner */
        <IconPrinter className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        <IconPrinter className="size-4" aria-hidden />
      )}
    </Button>
  )
}
