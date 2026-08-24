import { useParams } from 'react-router'

import { AcquisitionProvenancePanel } from '@/modules/asset/components/acquisition-provenance-panel'
import {
  useAssetCustodyTimelineQuery,
  useAssetQuery,
} from '@/modules/asset/hooks/use-asset-queries'
import { ROUTE_METADATA } from '@/config/routes'
import type { Asset } from '@/shared/types/generated/eiams-v1'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'

/**
 * Asset detail page (e18-t03): contract spine of one asset with the
 * D-AST-02 derived status as the page's headline badge, plus the custody
 * timeline (`getAssetCustody`). Acquisition provenance and movement history
 * are separate beads (e18-t04/t05) and compose into this page later.
 */
export default function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const assetQuery = useAssetQuery(assetId)
  const asset = assetQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.assetDetail.labelAr}
        subtitle={
          asset === undefined
            ? undefined
            : `${asset.assetNumber} — ${asset.material.displayName}`
        }
        toolbar={
          asset === undefined ? null : (
            <StatusBadge entity="asset" status={asset.derivedStatus} />
          )
        }
      />

      {assetQuery.isLoading ? (
        <LoadingSpinner className="min-h-48" label="جارٍ تحميل بيانات الأصل..." />
      ) : assetQuery.isError ? (
        <ErrorState
          title="تعذّر تحميل الأصل"
          description="تعذّر جلب بيانات هذا الأصل. حاول مرة أخرى."
          action={
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm"
              onClick={() => void assetQuery.refetch()}
            >
              إعادة المحاولة
            </button>
          }
        />
      ) : asset !== undefined ? (
        <>
          <ContentCard
            title="بيانات الأصل"
            description="الهوية المؤسسية للأصل وحالته المشتقة من سجل الحركات والعهدة (v_asset_current_status)."
          >
            <SpineFields asset={asset} />
          </ContentCard>

          <AcquisitionProvenancePanel asset={asset} />

          <CustodySection assetId={asset.assetId} />
        </>
      ) : null}
    </div>
  )
}

function SpineFields({ asset }: { asset: Asset }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <DetailField label="رقم الأصل" ltr>
        <span className="font-mono">{asset.assetNumber}</span>
      </DetailField>
      <DetailField label="الرقم التسلسلي" ltr={asset.serialNumber != null}>
        {asset.serialNumber ?? '—'}
      </DetailField>
      <DetailField label="المادة">{asset.material.displayName}</DetailField>
      <DetailField label="المستودع الحالي">
        {asset.currentWarehouse?.displayName ?? '—'}
      </DetailField>
      <DetailField label="تاريخ الاقتناء" ltr={asset.acquisitionDate != null}>
        {asset.acquisitionDate ?? '—'}
      </DetailField>
      <DetailField label="انتهاء الضمان" ltr={asset.warrantyExpiry != null}>
        {asset.warrantyExpiry ?? '—'}
      </DetailField>
    </dl>
  )
}

function CustodySection({ assetId }: { assetId: string }) {
  const custodyQuery = useAssetCustodyTimelineQuery(assetId)
  const timeline = custodyQuery.data ?? []

  return (
    <ContentCard
      title="سجل العهدة"
      description="الحالات العهدية المرتبطة بهذا الأصل (شخصية أو تشغيلية) وفق التسلسل الزمني."
    >
      {custodyQuery.isLoading ? (
        <LoadingSpinner label="جارٍ تحميل سجل العهدة..." />
      ) : custodyQuery.isError || timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد عهدة مسجّلة لهذا الأصل.</p>
      ) : (
        <ol className="grid gap-3">
          {timeline.map((entry) => (
            <li
              key={entry.custodyId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border p-3"
            >
              <StatusBadge entity="custody" status={entry.status} />
              <span className="text-sm font-medium text-foreground">
                {entry.custodyKind === 'Personal' ? 'حفظ شخصي' : 'حفظ تشغيلي'}
              </span>
              <span className="text-sm text-muted-foreground">
                الحائز: {entry.holder.displayName}
              </span>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {entry.fromTs}
              </span>
            </li>
          ))}
        </ol>
      )}
    </ContentCard>
  )
}
