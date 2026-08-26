import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useMemo, type FormEvent } from 'react'
import { FormProvider, useForm, useWatch, Controller, type Resolver } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'

import { AdjustmentLineEditor } from '@/modules/adjustment/components/adjustment-line-editor'
import { useCreateAdjustmentMutation } from '@/modules/adjustment/hooks/use-adjustment-queries'
import {
  adjustmentFormSchema,
  createEmptyAdjustmentLine,
  DRAFT_FORM_PURPOSES,
  DRAFT_FORM_PURPOSE_LABELS_AR,
  isDraftFormPurpose,
  toAdjustmentDraftRequest,
  type AdjustmentFormValues,
  type AdjustmentLineValues,
} from '@/modules/adjustment/schemas/adjustment-form.schemas'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useCountLinesQuery } from '@/modules/inventory-count/hooks/use-count-queries'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
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
  const { has } = usePermission()

  const launchCountId = searchParams.get('countId') ?? ''
  const launchWarehouseId = searchParams.get('warehouseId') ?? ''
  const launchPurposeParam = searchParams.get('purpose')
  const launchedFromCount = launchCountId !== '' && isDraftFormPurpose(launchPurposeParam)
  const lockedPurpose = launchedFromCount ? launchPurposeParam : null

  // CountVariance seed source: the session's own line list (snapshot vs actual).
  const countLinesQuery = useCountLinesQuery(
    launchedFromCount && lockedPurpose === 'CountVariance' ? launchCountId : null,
    { pageIndex: 0, pageSize: 200 },
  )
  const varianceSeed = useMemo<AdjustmentLineValues[] | undefined>(() => {
    if (!launchedFromCount || countLinesQuery.data === undefined) return undefined
    return countLinesQuery.data.items
      .filter((line) => line.difference !== 0)
      .map((line) => ({
        materialId: line.material.id,
        materialNameAr: line.material.displayName,
        ...(line.assetId === undefined || line.assetId === null ? {} : { assetId: line.assetId }),
        quantityDelta: line.difference,
        reason: line.reason ?? '',
      }))
  }, [launchedFromCount, countLinesQuery.data])
  const seedReady =
    !launchedFromCount || (lockedPurpose === 'CountVariance' ? varianceSeed !== undefined : true)

  if (!has('document.create')) {
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

  if (!seedReady) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title={ROUTE_METADATA.adjustmentNew.labelAr} />
        <LoadingSpinner className="min-h-48" label="جارٍ تحميل بنود الفروقات من جلسة الجرد..." />
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.adjustmentNew.labelAr}
        subtitle="أنشئ سند تسوية جديدًا: حدد المستودع والغرض والسبب، ثم بنود الفروقات الموقعة مع سبب لكل بند."
      />
      <AdjustmentDraftForm
        launchedFromCount={launchedFromCount}
        launchCountId={launchCountId || undefined}
        launchWarehouseId={launchedFromCount ? launchWarehouseId : ''}
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
  lockedPurpose,
  varianceSeed,
}: {
  launchedFromCount: boolean
  launchCountId: string | undefined
  launchWarehouseId: string
  lockedPurpose: string | null
  varianceSeed: AdjustmentLineValues[] | undefined
}) {
  const navigate = useNavigate()
  const warehouseSelector = useScopedWarehouseSelector()
  const createMutation = useCreateAdjustmentMutation()

  const defaultValues = useMemo<AdjustmentFormValues>(
    () => ({
      header: {
        // The count-launch deep-link carries the session's warehouse;
        // preseeding it keeps the locked control valid (QA defect D3).
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
  const isSubmitting = form.formState.isSubmitting
  const watchedPurpose = useWatch({ control: form.control, name: 'header.purpose' })

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
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
