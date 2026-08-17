import { DocumentTimeline } from '@/shared/documents/document-timeline'
import { useDocumentHistoryQuery } from '@/shared/documents/use-document-queries'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'

export type DocumentTimelineSectionProps = {
  /**
   * Route `:documentId`. When null (standalone composition without a routed
   * id) the section renders nothing and fires no query.
   */
  documentId: string | null
  className?: string | undefined
}

/**
 * Lifecycle timeline container (e12-t08): fetches the immutable event chain
 * via the shared history query and renders it inside the detail page's
 * lifecycle card. Owns loading, error + retry, and the separator before the
 * timeline; the empty state belongs to DocumentTimeline itself.
 */
function DocumentTimelineSection({ documentId, className }: DocumentTimelineSectionProps) {
  const historyQuery = useDocumentHistoryQuery(documentId, { enabled: documentId !== null })

  if (documentId === null) {
    return null
  }

  if (historyQuery.isPending) {
    return (
      <LoadingSpinner
        className={cn('min-h-48', className)}
        label="جارٍ تحميل سجل دورة حياة السند..."
      />
    )
  }

  if (historyQuery.isError) {
    return (
      <ErrorState
        className={cn(className)}
        title="تعذّر تحميل سجل دورة الحياة"
        description="تعذّر جلب سجل دورة حياة السند من الخادم. تحقق من الاتصال ثم أعد المحاولة."
        action={
          <Button type="button" onClick={() => void historyQuery.refetch()}>
            إعادة المحاولة
          </Button>
        }
      />
    )
  }

  if (historyQuery.data === undefined) {
    return null
  }

  return (
    <div
      data-slot="document-timeline-section"
      className={cn('mt-4 border-t border-border pt-4', className)}
    >
      <DocumentTimeline
        events={historyQuery.data.events}
        status={historyQuery.data.currentStatus}
      />
    </div>
  )
}

export { DocumentTimelineSection }
export default DocumentTimelineSection
