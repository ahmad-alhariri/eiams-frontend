import { useState } from 'react'
import { useParams } from 'react-router'

import { ActiveCountWarning } from '@/modules/inventory-count/components/active-count-warning'
import { CountQuantityWorkspace } from '@/modules/inventory-count/components/count-quantity-workspace'
import { CountToAdjustmentLaunch } from '@/modules/inventory-count/components/count-to-adjustment-launch'
import { CountVarianceReview } from '@/modules/inventory-count/components/count-variance-review'
import {
  CountMaterialName,
  CountWarehouseName,
} from '@/modules/inventory-count/components/count-name-fields'
import {
  useCancelCountMutation,
  useCloseCountMutation,
  useCompleteCountMutation,
  useInventoryCountQuery,
  useSetFreezePolicyMutation,
  useStartCountMutation,
} from '@/modules/inventory-count/hooks/use-count-queries'
import {
  INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR,
  INVENTORY_COUNT_SCOPE_LABELS_AR,
  INVENTORY_COUNT_STATUS_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
  type CountFreezePolicy,
} from '@/modules/inventory-count/types/inventory-count.types'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { formatDateTime } from '@/shared/utils/format'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'

const FREEZE_POLICIES = Object.keys(
  INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR,
) as readonly CountFreezePolicy[]

/**
 * Live count detail (IC-FE-1). Flat DTO fields only (`warehouseId`,
 * `materialDomainId`, `*AtUtc`, `freezePolicy`, `summary`, `settlement`) — no
 * nested `warehouse` object, no `createdBy`, no `notes`, no reference
 * numbering. Permissions: Start and the freeze-policy control require
 * `count.plan`; abort is gated by its own `count.abort` (RESOLUTION-011) with
 * a mandatory, length-capped reason sent to `POST /{countId}/cancel`.
 */
export default function CountDetailPage() {
  const { countId } = useParams<{ countId: string }>()
  const id = countId ?? ''
  const countQuery = useInventoryCountQuery(countId)
  const startMutation = useStartCountMutation(id)
  const completeMutation = useCompleteCountMutation(id)
  const closeMutation = useCloseCountMutation(id)
  const cancelMutation = useCancelCountMutation(id)
  const freezeMutation = useSetFreezePolicyMutation(id)
  const { has } = usePermission()
  const { confirm: openConfirm, element: confirmDialog } = useConfirm()
  const count = countQuery.data

  // Abort draft (count.abort): mandatory non-blank reason ≤ 500 chars,
  // validated in the UI before any request is built.
  const [abortReason, setAbortReason] = useState('')
  const [abortError, setAbortError] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Freeze-policy draft (count.plan): reason required unless SoftFreeze.
  const [freezePolicy, setFreezePolicy] = useState<CountFreezePolicy>(
    count?.freezePolicy ?? 'SoftFreeze',
  )
  const [freezePolicyReason, setFreezePolicyReason] = useState('')
  const [freezeError, setFreezeError] = useState<string | null>(null)

  if (countQuery.isLoading) {
    return <LoadingSpinner label="جارٍ تحميل جلسة الجرد..." />
  }
  if (countQuery.isError || count === undefined) {
    return (
      <ErrorState
        title="تعذّر تحميل جلسة الجرد"
        description="تعذّر جلب بيانات هذه الجلسة. حاول مرة أخرى."
        action={
          <Button variant="outline" onClick={() => void countQuery.refetch()}>
            إعادة المحاولة
          </Button>
        }
      />
    )
  }

  const handleStart = async () => {
    const confirmed = await openConfirm({
      title: 'بدء جلسة الجرد',
      message:
        'سيتم التقاط لقطة من أرصدة المستودع الحالية ككميات دفترية للجلسة، وستصبح الجلسة جارية. هل تريد المتابعة؟',
      confirmLabel: 'بدء الجلسة',
    })
    if (confirmed.confirmed) {
      startMutation.mutate(count.rowVersion)
    }
  }

  const handleComplete = async () => {
    const confirmed = await openConfirm({
      title: 'إكمال الجلسة',
      message: 'سيُحسب عدد البنود ذات الفرق ويُقفل الجرد. تأكد من إدخال سبب لكل فرق قبل الإكمال.',
      confirmLabel: 'إكمال',
    })
    if (confirmed.confirmed) {
      completeMutation.mutate(count.rowVersion)
    }
  }

  const handleClose = async () => {
    const confirmed = await openConfirm({
      title: 'إغلاق الجلسة',
      message: 'سيُغلق الجرد نهائياً ولا يمكن تعديله بعد الإغلاق. هل تريد المتابعة؟',
      confirmLabel: 'إغلاق',
    })
    if (confirmed.confirmed) {
      closeMutation.mutate(count.rowVersion)
    }
  }

  /** Blank or over-long reasons are refused BEFORE the wire request. */
  const handleAbort = () => {
    const reason = abortReason.trim()
    if (reason === '') {
      setAbortError('سبب الإلغاء مطلوب.')
      return
    }
    if (reason.length > 500) {
      setAbortError('يجب ألا يتجاوز سبب الإلغاء 500 محرف.')
      return
    }
    setAbortError(null)
    cancelMutation.mutate(
      { expectedRowVersion: count.rowVersion, reason },
      {
        onSuccess: () => {
          setAbortReason('')
          setCancelError(null)
        },
        onError: (error: unknown) => {
          const apiError = normalizeApiError(error)
          setCancelError(
            `${apiError.titleAr}${apiError.detailAr === null ? '' : ` — ${apiError.detailAr}`}`,
          )
        },
      },
    )
  }

  const handleFreezePolicySave = () => {
    if (freezePolicy === count.freezePolicy) {
      setFreezeError('السياسة المختارة هي السياسة الحالية بالفعل.')
      return
    }
    const reason = freezePolicyReason.trim()
    if (freezePolicy !== 'SoftFreeze' && reason === '') {
      setFreezeError('يجب إدخال سبب عند اختيار تجميد غير مرن.')
      return
    }
    setFreezeError(null)
    freezeMutation.mutate(
      {
        freezePolicy,
        ...(freezePolicy === 'SoftFreeze' ? {} : { freezePolicyReason: reason }),
        expectedRowVersion: count.rowVersion,
      },
      {
        onSuccess: () => {
          setFreezePolicyReason('')
          setFreezeError(null)
        },
      },
    )
  }

  const isPlanned = count.status === 'Planned'
  const isActive = count.status === 'InProgress'
  const isReviewable =
    count.status === 'InProgress' || count.status === 'Completed' || count.status === 'Closed'
  const canComplete = count.status === 'InProgress'
  const canClose = count.status === 'Completed'
  const canAbort = isPlanned || isActive

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={`${INVENTORY_COUNT_TYPE_LABELS_AR[count.countType]} — ${INVENTORY_COUNT_SCOPE_LABELS_AR[count.scopeType]}`}
        subtitle={INVENTORY_COUNT_STATUS_LABELS_AR[count.status]}
      />
      <div className="grid gap-5">
        <ContentCard title="بيانات الجلسة">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField label="الحالة">
              {INVENTORY_COUNT_STATUS_LABELS_AR[count.status]}
            </DetailField>
            {/* Display names resolve per id (`GET /warehouses/{id}`); the raw id never crashes. */}
            <DetailField label="المستودع">
              <CountWarehouseName warehouseId={count.warehouseId} />
            </DetailField>
            <DetailField label="نوع الجرد">
              {INVENTORY_COUNT_TYPE_LABELS_AR[count.countType]}
            </DetailField>
            {/* Freeze policy straight from the DTO (F9), never hard-coded. */}
            <DetailField label="سياسة التجميد">
              {INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR[count.freezePolicy]}
            </DetailField>
            <DetailField label="النطاق">
              <div className="flex flex-col gap-1">
                <span>{INVENTORY_COUNT_SCOPE_LABELS_AR[count.scopeType]}</span>
                {count.scopeType === 'MaterialDomain' && count.materialDomainId !== null ? (
                  <CountMaterialName materialId={count.materialDomainId} />
                ) : null}
                {count.scopeType === 'SelectedMaterials' ? (
                  <span className="text-muted-foreground">مواد محددة (انظر البنود)</span>
                ) : null}
              </div>
            </DetailField>
            <DetailField label="بدأت في" ltr>
              {count.startedAtUtc === null ? '—' : formatDateTime(count.startedAtUtc)}
            </DetailField>
            <DetailField label="اكتملت في" ltr>
              {count.completedAtUtc === null ? '—' : formatDateTime(count.completedAtUtc)}
            </DetailField>
            <DetailField label="أُغلقت في" ltr>
              {count.closedAtUtc === null ? '—' : formatDateTime(count.closedAtUtc)}
            </DetailField>
            <DetailField label="أُلغيت في" ltr>
              {count.abortedAtUtc === null ? '—' : formatDateTime(count.abortedAtUtc)}
            </DetailField>
          </dl>
        </ContentCard>

        {isPlanned ? (
          <ContentCard
            title="بدء الجلسة"
            description="عند بدء الجلسة يلتقط الخادم كميات الأرصدة الحالية ككميات دفترية لكل بند ضمن النطاق، وتنتقل الجلسة إلى قيد التنفيذ."
          >
            <div className="grid gap-4">
              {has('count.plan') ? (
                <Button onClick={() => void handleStart()} disabled={startMutation.isPending}>
                  {startMutation.isPending ? 'جارٍ البدء...' : 'بدء الجلسة والتقاط اللقطة'}
                </Button>
              ) : null}
              {startMutation.error !== null ? (
                <p role="alert" className="text-sm text-destructive">
                  تعذّر بدء الجلسة. تحقق من عدم وجود جلسة جارية أخرى لنفس المستودع.
                </p>
              ) : null}
              {has('count.plan') ? (
                <div className="grid gap-2 rounded-lg border border-border p-4">
                  <h3 className="text-sm font-medium text-foreground">تعديل سياسة التجميد</h3>
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grid gap-1">
                      <label htmlFor="count-freeze-policy" className="text-sm text-foreground">
                        السياسة
                      </label>
                      <Select
                        value={freezePolicy}
                        onValueChange={(value) =>
                          setFreezePolicy((value ?? 'SoftFreeze') as CountFreezePolicy)
                        }
                      >
                        <SelectTrigger id="count-freeze-policy" className="w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FREEZE_POLICIES.map((policy) => (
                            <SelectItem key={policy} value={policy}>
                              {INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR[policy]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <label htmlFor="count-freeze-reason" className="text-sm text-foreground">
                        السبب {freezePolicy === 'SoftFreeze' ? '(غير مطلوب)' : '(مطلوب)'}
                      </label>
                      <Textarea
                        id="count-freeze-reason"
                        value={freezePolicyReason}
                        onChange={(event) => setFreezePolicyReason(event.target.value)}
                        placeholder="سبب سياسة التجميد"
                        className="w-80"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleFreezePolicySave}
                      disabled={freezeMutation.isPending}
                    >
                      {freezeMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ السياسة'}
                    </Button>
                  </div>
                  {freezeError !== null ? (
                    <p role="alert" className="text-sm text-destructive">
                      {freezeError}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </ContentCard>
        ) : null}

        {/* Freeze advisory while the session is active (F9): the contract's own freeze-status endpoint. */}
        {isActive ? <ActiveCountWarning warehouseId={count.warehouseId} /> : null}

        {isActive ? (
          <ContentCard title="بنود الجرد">
            <CountQuantityWorkspace countId={count.id} countRowVersion={count.rowVersion} />
          </ContentCard>
        ) : null}

        {canAbort && has('count.abort') ? (
          <ContentCard
            title="إلغاء الجلسة"
            description="الإلغاء يرفع الجلسة قيد التنفيذ نهائياً؛ السبب إلزامي ويُوثَّق في سجل التفتيش."
          >
            <div className="grid gap-2">
              <Textarea
                aria-label="سبب إلغاء جلسة الجرد"
                value={abortReason}
                onChange={(event) => {
                  setAbortReason(event.target.value)
                  setAbortError(null)
                }}
                placeholder="سبب إلغاء الجلسة"
                className="w-full max-w-2xl"
              />
              {abortError !== null ? (
                <p role="alert" className="text-sm text-destructive">
                  {abortError}
                </p>
              ) : null}
              {cancelError !== null ? (
                <p role="alert" className="text-sm text-destructive">
                  {cancelError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                className="w-fit"
                data-slot="count-abort"
                onClick={handleAbort}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? 'جارٍ الإلغاء...' : 'إلغاء الجلسة'}
              </Button>
            </div>
          </ContentCard>
        ) : null}

        {isReviewable ? (
          <ContentCard title="مراجعة الفروقات">
            <CountVarianceReview
              countId={count.id}
              summary={count.summary}
              canComplete={canComplete}
              canClose={canClose}
              onComplete={() => void handleComplete()}
              onClose={() => void handleClose()}
              isCompleting={completeMutation.isPending}
              isClosing={closeMutation.isPending}
              completeError={
                completeMutation.error === null
                  ? null
                  : 'تعذّر إكمال الجلسة. تحقق من تسجيل أسباب الفروقات أو حدّث الصفحة.'
              }
              closeError={
                closeMutation.error === null
                  ? null
                  : 'تعذّر إغلاق الجلسة. حدّث الصفحة وحاول مجدداً.'
              }
            />
          </ContentCard>
        ) : null}

        <CountToAdjustmentLaunch count={count} />
      </div>
      {confirmDialog}
    </div>
  )
}
