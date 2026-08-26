import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useMemo, type FormEvent } from 'react'
import { useFieldArray, FormProvider, useForm, Controller, type Resolver } from 'react-hook-form'
import { useNavigate, useSearchParams } from 'react-router'

import { useCreateAdjustmentMutation } from '@/modules/adjustment/hooks/use-adjustment-queries'
import {
  adjustmentFormSchema,
  createEmptyAdjustmentLine,
  DRAFT_FORM_PURPOSES,
  DRAFT_FORM_PURPOSE_LABELS_AR,
  isDraftFormPurpose,
  toAdjustmentDraftRequest,
  type AdjustmentFormValues,
} from '@/modules/adjustment/schemas/adjustment-form.schemas'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'

/**
 * New adjustment draft page (e21-t04). Manager-owned Draft capture shaped
 * exactly like `InventoryAdjustmentDraftRequest` (D-ADJ-01):
 *
 * - No shared document-header section: the adjustment contract carries no
 *   paper-document fields, so the form owns a purpose-driven header group
 *   (warehouse / purpose / justification) instead of reusing the engine's
 *   spine schema — a deliberate seam divergence documented against contract.
 * - Launched from a count session (e21-t03 query params) the purpose locks
 *   to `CountVariance` with the session reference carried through; a bare
 *   `/adjustments/new` opens a `DirectCorrection` draft.
 * - Lines are signed stock differences with a mandatory reason each. Per
 *   D-ADJ-01 the frontend never infers available balances or posting
 *   eligibility — the server is authoritative at post time.
 */
export default function AdjustmentDraftFormPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { has } = usePermission()

  const launchCountId = searchParams.get('countId') ?? ''
  const launchWarehouseId = searchParams.get('warehouseId') ?? ''
  const launchPurposeParam = searchParams.get('purpose')
  const launchedFromCount = launchCountId !== '' && isDraftFormPurpose(launchPurposeParam)
  const lockedPurpose = launchedFromCount ? launchPurposeParam : null

  const warehouseSelector = useScopedWarehouseSelector()
  const materialSelector = useScopedMaterialSelector()
  const createMutation = useCreateAdjustmentMutation()

  const defaultValues = useMemo<AdjustmentFormValues>(
    () => ({
      header: {
        // The count-launch deep-link (e21-t03) carries the session's warehouse;
        // preseeding it keeps the locked control valid (QA defect D3).
        warehouseId: launchedFromCount ? launchWarehouseId : '',
        purpose: launchedFromCount ? 'CountVariance' : 'DirectCorrection',
        reason: '',
      },
      ...(launchedFromCount ? { countId: launchCountId } : {}),
      lines: [createEmptyAdjustmentLine()],
    }),
    [launchedFromCount, launchCountId, launchWarehouseId],
  )

  const form = useForm<AdjustmentFormValues>({
    // Cast mirrors the issue/transfer pages: z.coerce splits input/output
    // types, so the resolver is typed by the schema's output shape.
    resolver: zodResolver(adjustmentFormSchema) as Resolver<AdjustmentFormValues>,
    defaultValues,
    mode: 'onChange',
  })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' })
  const isSubmitting = form.formState.isSubmitting

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

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.adjustmentNew.labelAr}
        subtitle="أنشئ سند تسوية جديدًا: حدد المستودع والغرض والسبب، ثم بنود الفروقات الموقعة مع سبب لكل بند."
      />
      <FormProvider {...form}>
        <form
          data-slot="adjustment-draft-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          {launchedFromCount ? (
            <div
              data-slot="count-context-banner"
              className="rounded-md bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
            >
              هذا السند مرتبط بجلسة الجرد المطلوبة ولا يمكن فصله عنها؛ سجّل أسباب الفروقات على كل
              بند قبل الحفظ.
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
                        {/* Closed popups stay mounted: without children the
                        trigger would surface the raw English enum (QA defect D2). */}
                        <SelectValue>{DRAFT_FORM_PURPOSE_LABELS_AR[field.value]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {/* Explicit two-purpose list — the label map also
                        carries Disposal, which must never be offered here
                        (QA defect D1; disposal rides its own flow, e21-t08). */}
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
                    الغرض مقفل وفق جلسة الجرد المرتبطة ({DRAFT_FORM_PURPOSE_LABELS_AR.CountVariance}
                    ).
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

          <section
            data-slot="adjustment-lines-section"
            aria-label="بنود الفروقات"
            className="grid gap-3 rounded-md border border-border p-4"
          >
            <h2 className="text-sm font-medium text-foreground">بنود الفروقات</h2>
            {fields.map((field, index) => (
              <div
                key={field.id}
                data-slot="adjustment-line-row"
                className="grid items-start gap-3 rounded-md border border-border/60 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto]"
              >
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`line-material-${index}`}>المادة</Label>
                  <Controller
                    control={form.control}
                    name={`lines.${index}.materialId` as const}
                    render={({ field: materialField }) => (
                      <AsyncSelect
                        value={materialField.value || null}
                        onValueChange={(value, option) => {
                          materialField.onChange(value ?? '')
                          form.setValue(
                            `lines.${index}.materialNameAr` as const,
                            (option?.payload as { nameAr?: string } | undefined)?.nameAr ??
                              option?.label ??
                              '',
                            { shouldValidate: false },
                          )
                        }}
                        loadOptions={materialSelector.loadOptions}
                        disabled={!materialSelector.scopeReady || isSubmitting}
                        placeholder="ابحث عن المادة..."
                        inputProps={{ 'aria-label': `مادة البند ${index + 1}` }}
                      />
                    )}
                  />
                  {form.formState.errors.lines?.[index]?.materialId ? (
                    <p role="alert" className="text-sm text-destructive">
                      {form.formState.errors.lines[index]?.materialId?.message}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`line-delta-${index}`}>فرق الكمية (+/−)</Label>
                  <Input
                    id={`line-delta-${index}`}
                    type="number"
                    step="any"
                    dir="ltr"
                    {...form.register(`lines.${index}.quantityDelta` as const)}
                    disabled={isSubmitting}
                    aria-invalid={
                      form.formState.errors.lines?.[index]?.quantityDelta ? true : undefined
                    }
                  />
                  {form.formState.errors.lines?.[index]?.quantityDelta ? (
                    <p role="alert" className="text-sm text-destructive">
                      {form.formState.errors.lines[index]?.quantityDelta?.message}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`line-reason-${index}`}>سبب الفرق</Label>
                  <Textarea
                    id={`line-reason-${index}`}
                    rows={2}
                    {...form.register(`lines.${index}.reason` as const)}
                    disabled={isSubmitting}
                    placeholder="سبب إلزامي لكل فرق"
                    aria-invalid={form.formState.errors.lines?.[index]?.reason ? true : undefined}
                  />
                  {form.formState.errors.lines?.[index]?.reason ? (
                    <p role="alert" className="text-sm text-destructive">
                      {form.formState.errors.lines[index]?.reason?.message}
                    </p>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting || fields.length === 1}
                  onClick={() => remove(index)}
                  className="mt-6"
                  aria-label={`إزالة البند ${index + 1}`}
                >
                  إزالة
                </Button>
              </div>
            ))}
            {typeof form.formState.errors.lines?.message === 'string' ? (
              <p role="alert" className="text-sm text-destructive">
                {form.formState.errors.lines.message}
              </p>
            ) : null}
            {form.formState.errors.countId ? (
              <p role="alert" className="text-sm text-destructive">
                {form.formState.errors.countId.message}
              </p>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => append(createEmptyAdjustmentLine())}
            >
              إضافة بند
            </Button>
          </section>

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
    </div>
  )
}
