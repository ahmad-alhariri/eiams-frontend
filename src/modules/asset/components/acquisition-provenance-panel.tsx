import type { AssetDetails } from '@/modules/asset/types/asset.types'
import { ContentCard } from '@/shared/layout/content-card'
import { formatDate } from '@/shared/utils/format'

export interface AcquisitionProvenancePanelProps {
  asset: AssetDetails
}

/**
 * Acquisition provenance panel: the origin record of one asset — the receiving
 * document and line that created it, plus the acquisition and warranty dates
 * captured at reception.
 *
 * The live detail row carries `receiptDocumentId`, `receiptDocumentReference`
 * and `receiptLineId`; the ids are rendered verbatim because resolving a
 * receipt line to its document is not an admitted contract operation, and the
 * reference number is rendered as the server sent it.
 */
export function AcquisitionProvenancePanel({ asset }: AcquisitionProvenancePanelProps) {
  // Presence semantics: the server sends `null` for a field it has no value
  // for, so "no provenance" means every receipt field is null.
  const hasProvenance =
    asset.receiptDocumentId !== null ||
    asset.receiptLineId !== null ||
    asset.receiptDocumentReference !== null

  return (
    <ContentCard
      title="مصدر الاقتناء"
      description="سند الاستلام الذي أنشأ هذا الأصل وتواريخ الاقتناء والضمان المسجّلة عند الاستلام."
    >
      {hasProvenance ? (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="border-b border-border pb-4 sm:border-b-0 sm:col-span-2 lg:col-span-3">
            <dt className="text-sm font-medium text-muted-foreground">سند الاستلام المرجعي</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {asset.receiptDocumentReference === null ? (
                '—'
              ) : (
                <span className="font-mono text-sm">{asset.receiptDocumentReference}</span>
              )}
            </dd>
          </div>
          <div className="border-b border-border pb-4 sm:border-b-0">
            <dt className="text-sm font-medium text-muted-foreground">بند الاستلام</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {asset.receiptLineId === null ? (
                '—'
              ) : (
                <span className="font-mono text-sm">{asset.receiptLineId}</span>
              )}
            </dd>
          </div>
          <div className="border-b border-border pb-4 sm:border-b-0">
            <dt className="text-sm font-medium text-muted-foreground">تاريخ الاقتناء</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {/* A DateOnly ("2024-03-01") goes through the shared date
                  formatter, like every other date in the module. */}
              {formatDate(asset.acquisitionDate)}
            </dd>
          </div>
          <div className="border-b border-border pb-4 last:border-b-0 sm:border-b-0">
            <dt className="text-sm font-medium text-muted-foreground">انتهاء الضمان</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {asset.warrantyExpiry === null ? '—' : formatDate(asset.warrantyExpiry)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">لا توجد بيانات اقتناء مسجّلة لهذا الأصل.</p>
      )}
    </ContentCard>
  )
}
