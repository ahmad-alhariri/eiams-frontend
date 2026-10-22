import { useParams } from 'react-router'

import { AcquisitionProvenancePanel } from '@/modules/asset/components/acquisition-provenance-panel'
import { AssetMovementLedger } from '@/modules/asset/components/asset-movement-ledger'
import { AssetStatusBadge } from '@/modules/asset/components/asset-status-badge'
import { ASSET_MOVEMENT_TYPE_LABELS_AR } from '@/modules/asset/asset-movement-labels'
import {
  useAssetCustodyTimelineQuery,
  useAssetCurrentStatusQuery,
  useAssetQuery,
} from '@/modules/asset/hooks/use-asset-queries'
import type { AssetDetails } from '@/modules/asset/types/asset.types'
import { ROUTE_METADATA } from '@/config/routes'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { formatDate, formatDateTime } from '@/shared/utils/format'

/**
 * Asset detail page: the asset record and its acquisition provenance, the
 * DERIVED status projection the server owns, the custody timeline, and the
 * immutable movement ledger.
 *
 * The live rows are flat (`materialNameAr`, `warehouseName`, `currentStatus`,
 * `id`), so nothing here reads the nested `material` / `currentWarehouse` /
 * `holder` objects of the frozen design snapshot.
 */
export default function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>()
  const assetQuery = useAssetQuery(assetId)
  const asset = assetQuery.data
  const statusQuery = useAssetCurrentStatusQuery(assetId)

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.assetDetail.labelAr}
        subtitle={
          asset === undefined ? undefined : `${asset.assetNumber} — ${asset.materialNameAr}`
        }
        toolbar={
          statusQuery.data === undefined ? null : (
            <AssetStatusBadge status={statusQuery.data.currentStatus} />
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void assetQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          }
        />
      ) : asset !== undefined ? (
        <>
          <ContentCard
            title="بيانات الأصل"
            description="الهوية المؤسسية للأصل: رقمه، مادته، مستودعه وتواريخ الاقتناء والضمان."
          >
            <SpineFields asset={asset} />
          </ContentCard>

          <AcquisitionProvenancePanel asset={asset} />

          <CurrentStatusSection assetId={asset.id} />

          <CustodySection assetId={asset.id} />

          <ContentCard
            title="سجل حركات الأصل"
            description="السجل غير القابل للتعديل لكل أحداث هذا الأصل: استلام، تحويل، صرف، إرجاع، استبعاد."
          >
            <AssetMovementLedger assetId={asset.id} />
          </ContentCard>
        </>
      ) : null}
    </div>
  )
}

function SpineFields({ asset }: { asset: AssetDetails }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      <DetailField label="رقم الأصل" ltr>
        <span className="font-mono">{asset.assetNumber}</span>
      </DetailField>
      <DetailField label="الرقم التسلسلي" ltr={asset.serialNumber != null}>
        {asset.serialNumber ?? '—'}
      </DetailField>
      <DetailField label="المادة">{asset.materialNameAr}</DetailField>
      <DetailField label="رمز المادة" ltr>
        <span className="font-mono">{asset.materialCode}</span>
      </DetailField>
      <DetailField label="المستودع الحالي">{asset.warehouseName}</DetailField>
      {/* The two DateOnly fields go through the shared date formatter like
          every other date in the module. */}
      <DetailField label="تاريخ الاقتناء" ltr>
        {formatDate(asset.acquisitionDate)}
      </DetailField>
      <DetailField label="انتهاء الضمان" ltr={asset.warrantyExpiry != null}>
        {asset.warrantyExpiry === null ? '—' : formatDate(asset.warrantyExpiry)}
      </DetailField>
    </dl>
  )
}

/**
 * The DERIVED status projection (`v_asset_current_status`): who holds the
 * asset right now, and its last movement.
 *
 * It is read from `GET /assets/{assetId}/current-status` — the endpoint that
 * serves exactly this projection — while the asset record and its provenance
 * come from `GET /assets/{assetId}`. The STATUS itself is the page's headline
 * badge (above the title); this card carries the facts around it, so the
 * status is stated once and only once.
 */
function CurrentStatusSection({ assetId }: { assetId: string }) {
  const statusQuery = useAssetCurrentStatusQuery(assetId)
  const status = statusQuery.data

  return (
    <ContentCard
      title="الوضع الحالي"
      description="من يحتفظ بالأصل الآن، ونوع الحفظ، وآخر حركة مسجّلة عليه."
    >
      {statusQuery.isLoading ? (
        <LoadingSpinner label="جارٍ تحميل الوضع الحالي..." />
      ) : statusQuery.isError || status === undefined ? (
        <ErrorState
          title="تعذّر تحميل الوضع الحالي"
          description="تعذّر جلب الوضع الحالي لهذا الأصل. حاول مرة أخرى."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void statusQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          }
        />
      ) : (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="الحائز" ltr>
            {/* The live projection carries the holder TYPE and ID only — no
                display name — so the typed pair is what can be shown. */}
            {status.holderType === null || status.holderId === null
              ? '—'
              : `${status.holderType}/${status.holderId}`}
          </DetailField>
          <DetailField label="نوع الحفظ">
            {status.custodyKind === null
              ? '—'
              : status.custodyKind === 'Personal'
                ? 'حفظ شخصي'
                : 'حفظ تشغيلي'}
          </DetailField>
          <DetailField label="آخر حركة">
            {status.latestMovementType === null
              ? '—'
              : ASSET_MOVEMENT_TYPE_LABELS_AR[status.latestMovementType]}
          </DetailField>
          <DetailField label="تاريخ آخر حركة" ltr={status.latestMovementAtUtc != null}>
            {status.latestMovementAtUtc === null ? '—' : formatDateTime(status.latestMovementAtUtc)}
          </DetailField>
        </dl>
      )}
    </ContentCard>
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
      {/* e24-t10 / B4: these three states were one ternary, so a FAILED read
          rendered "no custody is recorded for this asset" — a claim about the
          asset's custody that the server never made, with no retry, and
          directly contradicting the sibling page, which reports the same failed
          read correctly. Failed read now degrades to its own retryable error;
          "no custody" is only ever rendered for a successful empty read. */}
      {custodyQuery.isLoading ? (
        <LoadingSpinner label="جارٍ تحميل سجل العهدة..." />
      ) : custodyQuery.isError ? (
        <ErrorState
          title="تعذّر تحميل سجل العهدة"
          description="تعذّر جلب سجل عهدة هذا الأصل. حاول مرة أخرى."
          action={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void custodyQuery.refetch()}
            >
              إعادة المحاولة
            </Button>
          }
        />
      ) : timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد عهدة مسجّلة لهذا الأصل.</p>
      ) : (
        <ol className="grid gap-3">
          {timeline.map((entry) => (
            <li
              key={entry.custodyId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border p-3"
            >
              {/* Live row has the status enum — Active | Closed — so the badge accepts it. */}
              <StatusBadge entity="custody" status={entry.status} />
              <span className="text-sm font-medium text-foreground">
                {entry.custodyKind === 'Personal' ? 'حفظ شخصي' : 'حفظ تشغيلي'}
              </span>
              <span className="text-sm text-muted-foreground" dir="ltr">
                الحائز: {entry.holderType}/{entry.holderId}
              </span>
              <span className="text-xs text-muted-foreground" dir="ltr">
                {formatDateTime(entry.fromUtc)}
              </span>
              {/* e24-t08: a closed custody row's end time is the only record of
                  when the asset came back. The custody timeline page already
                  shows it; omitting it here made the two surfaces of the same
                  append-only data disagree. */}
              {entry.status === 'Closed' && entry.toUtc ? (
                <span className="text-xs text-muted-foreground">
                  نهاية العهدة: <span dir="ltr">{formatDateTime(entry.toUtc)}</span>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </ContentCard>
  )
}
