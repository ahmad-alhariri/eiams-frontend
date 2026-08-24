import type { Asset } from '@/shared/types/generated/eiams-v1'
import { ContentCard } from '@/shared/layout/content-card'

export interface AcquisitionProvenancePanelProps {
  asset: Asset
}

/**
 * Acquisition provenance panel (e18-t04): the contract-backed origin record
 * of one asset — the receiving line that created it (`receiptLineId`) plus
 * the acquisition and warranty dates captured at reception. The id is
 * rendered verbatim because resolving a receipt line to its document is not
 * yet an admitted contract operation; when the backend exposes that link,
 * this panel becomes clickable without shape changes.
 */
export function AcquisitionProvenancePanel({ asset }: AcquisitionProvenancePanelProps) {
  // Presence semantics: an explicit null date still means the server recorded
  // provenance ("no date"); only a record with no receipt line and no date
  // fields at all renders the empty state.
  const hasProvenance =
    asset.receiptLineId !== undefined ||
    asset.acquisitionDate !== undefined ||
    asset.warrantyExpiry !== undefined

  return (
    <ContentCard
      title="مصدر الاقتناء"
      description="سند الاستلام الذي أنشأ هذا الأصل وتواريخ الاقتناء والضمان المسجّلة عند الاستلام."
    >
      {hasProvenance ? (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="border-b border-border pb-4 sm:border-b-0 sm:col-span-2 lg:col-span-3">
            <dt className="text-sm font-medium text-muted-foreground">
              بند الاستلام المرجعي
            </dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {asset.receiptLineId === undefined ? (
                '—'
              ) : (
                <span className="font-mono text-sm">{asset.receiptLineId}</span>
              )}
            </dd>
          </div>
          <div className="border-b border-border pb-4 last:border-b-0 sm:border-b-0">
            <dt className="text-sm font-medium text-muted-foreground">تاريخ الاقتناء</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {asset.acquisitionDate ?? '—'}
            </dd>
          </div>
          <div className="border-b border-border pb-4 last:border-b-0 sm:border-b-0">
            <dt className="text-sm font-medium text-muted-foreground">انتهاء الضمان</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {asset.warrantyExpiry ?? '—'}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">
          لا توجد بيانات اقتناء مسجّلة لهذا الأصل.
        </p>
      )}
    </ContentCard>
  )
}
