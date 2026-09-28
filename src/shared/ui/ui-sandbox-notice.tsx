import { IconFlask } from '@tabler/icons-react'

import { cn } from '@/shared/utils/class-names'

/**
 * Which development fixture is answering instead of the real backend.
 *
 * `mocks` replaces HTTP with an MSW worker; `authBypass` replaces the refresh
 * endpoint with a fixture session. Either one invalidates integration evidence,
 * which is why RESOLUTION-040 requires the sandbox to be explicitly opted into
 * and visibly marked.
 */
export type UiSandboxFixture = 'mocks' | 'authBypass'

const FIXTURE_LABELS: Readonly<Record<UiSandboxFixture, string>> = {
  mocks: 'بيانات تجريبية',
  authBypass: 'جلسة تجريبية',
}

export type UiSandboxNoticeProps = {
  /** Active fixtures, in display order. An empty list renders nothing. */
  fixtures: readonly UiSandboxFixture[]
  className?: string | undefined
}

/**
 * Marks a fixture-backed session so it can never be mistaken for evidence that
 * real login, refresh, authorization and session hydration work.
 *
 * Pure and presentational: it renders what it is told and holds no environment
 * knowledge, so the profile decision stays in `@/config/env` where it is
 * validated and production-checked.
 *
 * `role="status"` with `aria-live="polite"` announces the marker once on
 * appearance rather than interrupting whatever the user is doing.
 */
function UiSandboxNotice({ fixtures, className }: UiSandboxNoticeProps) {
  if (fixtures.length === 0) {
    return null
  }

  return (
    <div
      data-slot="ui-sandbox-notice"
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-xs font-semibold text-primary-foreground',
        className,
      )}
    >
      <IconFlask aria-hidden="true" className="size-4 shrink-0" />
      <span>
        بيئة الاختبار — البيانات لا تأتي من الخادم الحقيقي
        <span className="ms-2 font-normal opacity-90">
          ({fixtures.map((fixture) => FIXTURE_LABELS[fixture]).join('، ')})
        </span>
      </span>
    </div>
  )
}

export { UiSandboxNotice }
