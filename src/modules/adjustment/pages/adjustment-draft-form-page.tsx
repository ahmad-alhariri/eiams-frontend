import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useMemo, type FormEvent } from 'react'
import { FormProvider, useForm, useWatch, Controller, type Resolver } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'

import { AdjustmentLineEditor } from '@/modules/adjustment/components/adjustment-line-editor'
import { useCreateAdjustmentMutation } from '@/modules/adjustment/hooks/use-adjustment-queries'
import {
  adjustmentFormSchema,
  createEmptyAdjustmentLine,
  DRAFT_FORM_PURPOSES,
  DRAFT_FORM_PURPOSE_LABELS_AR,
  toAdjustmentDraftRequest,
  type AdjustmentFormValues,
  type AdjustmentLineValues,
} from '@/modules/adjustment/schemas/adjustment-form.schemas'
import { useRoutePermission } from '@/modules/auth/hooks/use-permission'
import {
  useAllCountLinesQuery,
  useInventoryCountQuery,
} from '@/modules/inventory-count/hooks/use-count-queries'
import {
  isCountAdjustmentEligible,
  summarizeCountLines,
} from '@/modules/inventory-count/utils/count-review'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ErrorState } from '@/shared/feedback/error-state'
import { EmptyState } from '@/shared/feedback/empty-state'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button, buttonVariants } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

/**
 * New adjustment draft page (e21-t04/t05). Manager-owned Draft capture shaped
 * exactly like `InventoryAdjustmentDraftRequest` (D-ADJ-01):
 *
 * - No shared document-header section: the adjustment contract carries no
 *   paper-document fields, so the form owns a purpose-driven header group
 *   (warehouse / purpose / justification) — a deliberate seam divergence.
 * - Launched from a count session (e21-t03 query params) the purpose locks to
 *   `CountVariance`; this page fetches the session's variance lines and seeds
 *   them as locked rows BEFORE mounting the form component. RHF captures
 *   `defaultValues` once at mount, so seeding must precede initialization —
 *   imperative post-mount mutation desyncs the field-array registry from the
 *   form values (phantom "lines: too_small" at submit; caught by browser QA).
 */
export default function AdjustmentDraftFormPage() {
  const [searchParams] = useSearchParams()
  const canCreate = useRoutePermission('adjustmentNew')

  const launchCountId = searchParams.get('countId') ?? ''
  const launchPurposeParam = searchParams.get('purpose')
  const invalidCountLink = launchCountId !== '' && launchPurposeParam !== 'CountVariance'
  const launchedFromCount = launchCountId !== '' && !invalidCountLink
  const lockedPurpose = launchedFromCount ? 'CountVariance' : null

  // CountVariance seed source: the session's server-provided differences.
  const countLinesQuery = useAllCountLinesQuery(
    canCreate && launchedFromCount ? launchCountId : null,
  )
  const countSummary = useMemo(
    () =>
      countLinesQuery.data === undefined ? undefined : summarizeCountLines(countLinesQuery.data),
    [countLinesQuery.data],
  )
  const varianceSeed = useMemo<AdjustmentLineValues[] | undefined>(() => {
    if (!launchedFromCount || countSummary === undefined) return undefined
    return countSummary.variance.map((line) => ({
      materialId: line.material.id,
      materialNameAr: line.material.displayName,
      ...(line.assetId === undefined || line.assetId === null ? {} : { assetId: line.assetId }),
      quantityDelta: line.difference,
      reason: line.reason ?? '',
    }))
  }, [launchedFromCount, countSummary])

  // Both warehouse identity and Arabic label come from the fetched count.
  const countQuery = useInventoryCountQuery(canCreate && launchedFromCount ? launchCountId : null)
  const launchWarehouseLabel =
    launchedFromCount && countQuery.data !== undefined
      ? countQuery.data.warehouse.displayName
      : undefined

  // Readiness gates BOTH seeds: the variance rows AND the launch-warehouse
  // label must be resolved before the form component mounts, so its
  // defaultValues and the combobox's initial option are complete.
  const seedReady =
    !launchedFromCount || (varianceSeed !== undefined && countQuery.data !== undefined)

  if (!canCreate) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title={ROUTE_METADATA.adjustmentNew.labelAr} />
        <ContentCard title="غير مصرّح">
          <p role="alert" className="text-sm text-destructive">
            لا تملك صلاحية إنشاء سندات التسوية؛ هذه العملية حصرية لمديري المستودعات.
          </p>
        </ContentCard>
      </div>
    )
  }

  if (invalidCountLink) {
    return (
      <ErrorState
        title="رابط الجرد غير صالح"
        description="افتح إنشاء سند التسوية من جلسة الجرد لربط فروقاتها بالسند."
      />
    )
  }

  if (countQuery.isError || countLinesQuery.isError) {
    return (
      <ErrorState
        title="تعذّر تحميل بيانات الجرد"
        description="تعذّر تحميل جلسة الجرد أو بنود الفروقات. حاول مرة أخرى."
        action={
          <Button
            type="button"
            variant="outline"
            disabled={countQuery.isFetching || countLinesQuery.isFetching}
            onClick={() => {
              void countQuery.refetch()
              void countLinesQuery.refetch()
            }}
          >
            إعادة المحاولة
          </Button>
        }
      />
    )
  }

  if (!seedReady) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title={ROUTE_METADATA.adjustmentNew.labelAr} />
        <LoadingSpinner className="min-h-48" label="جارٍ تحميل بنود الفروقات من جلسة الجرد..." />
      </div>
    )
  }

  if (launchedFromCount && countQuery.data !== undefined) {
    const returnToCount = (
      <Link
        to={ROUTE_PATHS.countDetail.replace(':countId', encodeURIComponent(launchCountId))}
        className={buttonVariants({ variant: 'outline' })}
      >
        العودة إلى جلسة الجرد
      </Link>
    )
    if (!isCountAdjustmentEligible(countQuery.data.status)) {
      return (
        <ErrorState
          title="جلسة الجرد غير جاهزة للتسوية"
          description="لا يمكن إنشاء سند تسوية قبل اكتمال جلسة الجرد. أكمل إدخال الكميات ومراجعة الفروقات أولاً."
          action={returnToCount}
        />
      )
    }
    if (countSummary !== undefined && countSummary.unentered.length > 0) {
      return (
        <ErrorState
          title="بيانات الجرد غير مكتملة"
          description="توجد بنود لم تُدخل كمياتها الفعلية. راجع جلسة الجرد قبل إنشاء التسوية."
          action={returnToCount}
        />
      )
    }
    if (varianceSeed?.length === 0) {
      return (
        <EmptyState
          title="لا توجد فروقات للتسوية"
          description="جميع بنود الجرد مطابقة؛ لا يلزم إنشاء سند تسوية لهذه الجلسة."
          action={returnToCount}
        />
      )
    }
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.adjustmentNew.labelAr}
        subtitle="أنشئ سند تسوية جديدًا: حدد المستودع والغرض والسبب، ثم بنود الفروقات الموقعة مع سبب لكل بند."
      />
      <AdjustmentDraftForm
        key={launchedFromCount ? launchCountId : 'direct-correction'}
        launchedFromCount={launchedFromCount}
        launchCountId={launchCountId || undefined}
        launchWarehouseId={launchedFromCount ? (countQuery.data?.warehouse.id ?? '') : ''}
        launchWarehouseLabel={launchWarehouseLabel}
        lockedPurpose={lockedPurpose}
        varianceSeed={lockedPurpose === 'CountVariance' ? varianceSeed : undefined}
      />
    </div>
  )
}

/**
 * The form itself. Mounted exactly once with its seed in place: `useForm`
 * reads `defaultValues` on the first render only, so all launch context must
 * already be resolved by the parent before this component exists.
 */
function AdjustmentDraftForm({
  launchedFromCount,
  launchCountId,
  launchWarehouseId,
  launchWarehouseLabel,
  lockedPurpose,
  varianceSeed,
}: {
  launchedFromCount: boolean
  launchCountId: string | undefined
  launchWarehouseId: string
  /** Pre-resolved Arabic label for the locked launch warehouse (or undefined). */
  launchWarehouseLabel: string | undefined
  lockedPurpose: string | null
  varianceSeed: AdjustmentLineValues[] | undefined
}) {
  const navigate = useNavigate()
  const warehouseSelector = useScopedWarehouseSelector()
  const createMutation = useCreateAdjustmentMutation()

  const defaultValues = useMemo<AdjustmentFormValues>(
    () => ({
      header: {
        // Seed from the fetched count, never the untrusted warehouse query parameter.
        warehouseId: launchedFromCount ? launchWarehouseId : '',
        purpose: launchedFromCount ? 'CountVariance' : 'DirectCorrection',
        reason: '',
      },
      ...(launchedFromCount && launchCountId !== undefined ? { countId: launchCountId } : {}),
      lines:
        lockedPurpose === 'CountVariance' && varianceSeed !== undefined && varianceSeed.length > 0
          ? varianceSeed
          : [createEmptyAdjustmentLine()],
    }),
    [launchedFromCount, launchCountId, launchWarehouseId, lockedPurpose, varianceSeed],
  )

  const form = useForm<AdjustmentFormValues>({
    // Cast mirrors the issue/transfer pages: z.coerce splits input/output
    // types, so the resolver is typed by the schema's output shape.
    resolver: zodResolver(adjustmentFormSchema) as Resolver<AdjustmentFormValues>,
    defaultValues,
    mode: 'onChange',
  })
  const isSubmitting = form.formState.isSubmitting || createMutation.isPending
  const watchedPurpose = useWatch({ control: form.control, name: 'header.purpose' })

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (createMutation.isPending) return
      void form.handleSubmit((values) => {
        createMutation.mutate(toAdjustmentDraftRequest(values), {
          onSuccess: () => {
            void navigate(ROUTE_PATHS.adjustments)
          },
        })
      })(event)
    },
    [createMutation, form, navigate],
  )

  return (
    <FormProvider {...form}>
      <form data-slot="adjustment-draft-form" onSubmit={onSubmit} noValidate className="grid gap-5">
        {launchedFromCount ? (
          <div
            data-slot="count-context-banner"
            className="rounded-md bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
          >
            هذا السند مرتبط بجلسة الجرد المطلوبة ولا يمكن فصله عنها؛ سجّل أسباب الفروقات على كل بند
            قبل الحفظ.
          </div>
        ) : null}

        <ContentCard title="بيانات السند">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="adjustment-warehouse">المستودع</Label>
              <Controller
                control={form.control}
                name="header.warehouseId"
                render={({ field }) => (
                  <AsyncSelect
                    value={field.value || null}
                    onValueChange={(value) => field.onChange(value ?? '')}
                    loadOptions={warehouseSelector.loadOptions}
                    disabled={!warehouseSelector.scopeReady || isSubmitting || launchedFromCount}
                    placeholder="اختر المستودع..."
                    initialOption={
                      launchedFromCount && launchWarehouseLabel !== undefined && field.value !== ''
                        ? { value: field.value, label: launchWarehouseLabel }
                        : null
                    }
                    inputProps={{ 'aria-label': 'مستودع التسوية' }}
                  />
                )}
              />
              {form.formState.errors.header?.warehouseId ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.header.warehouseId.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="adjustment-purpose">غرض التسوية</Label>
              <Controller
                control={form.control}
                name="header.purpose"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={isSubmitting || lockedPurpose !== null}
                  >
                    <SelectTrigger id="adjustment-purpose" aria-label="غرض التسوية">
                      {/* Closed popups stay mounted: without children the trigger
                      would surface the raw English enum (QA defect D2). */}
                      <SelectValue>{DRAFT_FORM_PURPOSE_LABELS_AR[field.value]}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {/* Explicit two-purpose list — the label map also carries
                      Disposal, which must never be offered here (QA defect D1;
                      disposal rides its own flow, e21-t08). */}
                      {DRAFT_FORM_PURPOSES.map((purpose) => (
                        <SelectItem key={purpose} value={purpose}>
                          {DRAFT_FORM_PURPOSE_LABELS_AR[purpose]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {lockedPurpose !== null ? (
                <p className="text-xs text-muted-foreground">
                  الغرض مقفل وفق جلسة الجرد المرتبطة ({DRAFT_FORM_PURPOSE_LABELS_AR.CountVariance}).
                </p>
              ) : null}
              {form.formState.errors.header?.purpose ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.header.purpose.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="adjustment-reason">سبب التسوية</Label>
              <Input
                id="adjustment-reason"
                {...form.register('header.reason')}
                disabled={isSubmitting}
                placeholder="السبب العام لسند التسوية"
                aria-invalid={form.formState.errors.header?.reason ? true : undefined}
              />
              {form.formState.errors.header?.reason ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.header.reason.message}
                </p>
              ) : null}
            </div>
          </div>
        </ContentCard>

        <AdjustmentLineEditor purpose={watchedPurpose} disabled={isSubmitting} />

        {form.formState.errors.lines?.message ? (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.lines.message}
          </p>
        ) : null}
        {form.formState.errors.countId ? (
          <p role="alert" className="text-sm text-destructive">
            {form.formState.errors.countId.message}
          </p>
        ) : null}

        {createMutation.error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            تعذّر حفظ مسودة التسوية. تحقق من البيانات وحاول مرة أخرى.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting} className="min-w-36">
            {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ المسودة'}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => void navigate(ROUTE_PATHS.adjustments)}
          >
            إلغاء
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
