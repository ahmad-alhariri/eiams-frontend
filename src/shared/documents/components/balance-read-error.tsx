import { Button } from '@/shared/ui/button'

/**
 * The single Arabic sentence both outbound forms show when a per-line balance
 * read fails (e24-t10 / B3). It is deliberately ONE line rather than one
 * message per line: the failure is a single failed read, and a per-line
 * message would invite the reader to compare numbers that were never fetched.
 *
 * The wording reports what happened and nothing more. It does not say why the
 * read failed and does not claim the material is out of stock — the server
 * never said that, and the forms must not state it.
 */
export const BALANCE_READ_FAILED_AR = 'تعذّر جلب الأرصدة المتاحة. أعد المحاولة قبل الحفظ.'

/**
 * Inline failure surface for the live balance lookups behind the outbound
 * document forms (Issue, Transfer). Extracted as a shared component because
 * both forms must fail the same way: AGENTS.md rules 3 and 5 make the balance
 * check load-bearing, so a failed read has to be loud, retryable, and
 * consistent across the two surfaces.
 */
export function BalanceReadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      data-slot="balance-read-error"
      data-testid="balance-read-error"
      className="flex flex-wrap items-center gap-3 rounded-md bg-destructive/5 px-3 py-2 text-sm font-medium text-destructive"
    >
      <span>{BALANCE_READ_FAILED_AR}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </div>
  )
}
