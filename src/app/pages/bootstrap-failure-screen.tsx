import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'

/**
 * Startup-failure screen rendered before providers exist (no QueryClient,
 * router, or toast surface is mounted at this point). It is deliberately
 * dependency-free so the screen itself can never fail to mount; the reload
 * action is the standard remedy for a transient mock-worker activation
 * failure, while the error detail guides developers in the console.
 */
type BootstrapFailureScreenProps = {
  error: unknown
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function BootstrapFailureScreen({ error }: BootstrapFailureScreenProps) {
  const detail = errorMessage(error)

  return (
    <main
      dir="rtl"
      aria-labelledby="bootstrap-failure-title"
      className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-8"
    >
      <section
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-border bg-popover p-8 text-center shadow-modal sm:p-10"
      >
        <span
          className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          aria-hidden
        >
          <IconAlertTriangle className="size-7" />
        </span>
        <h1 id="bootstrap-failure-title" className="mt-5 text-2xl font-bold text-foreground">
          تعذر تشغيل التطبيق
        </h1>
        <p className="mt-3 leading-7 text-muted-foreground">
          تعذّرت تهيئة بيئة العمل قبل عرض الواجهة. أعد تحميل الصفحة لإعادة المحاولة، أو راجع سجل
          المتصفح للاطلاع على التفاصيل.
        </p>
        {detail ? (
          <pre
            data-slot="bootstrap-failure-detail"
            className="mt-5 max-h-40 overflow-auto rounded-lg border border-border bg-muted px-4 py-3 text-start text-xs leading-6 text-foreground"
            dir="ltr"
          >
            {detail}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <IconRefresh className="size-4" aria-hidden />
          إعادة تحميل الصفحة
        </button>
      </section>
    </main>
  )
}

export { BootstrapFailureScreen, type BootstrapFailureScreenProps }
