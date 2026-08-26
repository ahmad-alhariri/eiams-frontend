import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import type { Resolver } from 'react-hook-form'
import { Controller, FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { usePlanCountMutation } from '@/modules/inventory-count/hooks/use-count-queries'
import { ActiveCountWarning } from '@/modules/inventory-count/components/active-count-warning'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import type { InventoryCountScopeType, InventoryCountType } from '@/shared/types/generated/eiams-v1'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Input } from '@/shared/ui/input'
import { Textarea } from '@/shared/ui/textarea'

const COUNT_TYPES: readonly InventoryCountType[] = [
  'Full',
  'Partial',
  'SpotCheck',
  'AssetVerification',
]

const COUNT_TYPE_LABELS_AR: Readonly<Record<InventoryCountType, string>> = {
  Full: 'جرد شامل',
  Partial: 'جرد جزئي',
  SpotCheck: 'جرد مفاجئ',
  AssetVerification: 'تحقق أصول',
}

/**
 * Count planning schema (e20-t03 / contract `InventoryCountPlanRequest`).
 * The v1 contract narrows the freeze policy to SoftFreeze only (PRD §12.6's
 * HardFreeze/NoFreeze options await a backend contract change), so the policy
 * is fixed and sent as a constant rather than offered as a choice.
 */
const countPlanningFormSchema = z.object({
  warehouseId: z.uuid('يجب اختيار مستودع الجرد من القائمة.'),
  countType: z.enum(['Full', 'Partial', 'SpotCheck', 'AssetVerification'], {
    message: 'يجب اختيار نوع الجرد.',
  }),
  scopeType: z.enum(['AllMaterials', 'ByDomain', 'ByCategory', 'ByMaterial'], {
    message: 'يجب اختيار نطاق الجرد.',
  }),
  scopeSummaryAr: z.string().trim().max(200, 'يجب ألا يتجاوز وصف النطاق 200 محرفاً.').optional(),
  notes: z.string().trim().max(500, 'يجب ألا تتجاوز الملاحظات 500 محرفاً.').optional(),
})

type CountPlanningFormValues = z.infer<typeof countPlanningFormSchema>

/** Scope-type hint shown under the select (Arabic, per PRD §12.6 scope semantics). */
function scopeHintAr(scopeType: InventoryCountScopeType | undefined): string | undefined {
  switch (scopeType) {
    case 'AllMaterials':
      return 'ستُجرد كل مواد المستودع.'
    case 'ByDomain':
      return 'اذكر معرّفات المجالات المطلوب جردها في وصف النطاق (v1).'
    case 'ByCategory':
      return 'اذكر معرّفات الأصناف المطلوب جردتها في وصف النطاق (v1).'
    case 'ByMaterial':
      return 'اذكر معرّفات المواد المطلوب جردتها في وصف النطاق (v1).'
    default:
      return undefined
  }
}

/**
 * New count planning page (e20-t03 / PRD §12.6 step 1): creates an
 * `InventoryCount` session in the Planned state with SoftFreeze policy.
 * Snapshot capture happens server-side at start (step 2) — not here.
 * A 409 conflict (another session InProgress for the same warehouse) is
 * surfaced as an Arabic alert.
 */
export default function CountPlanningFormPage() {
  const navigate = useNavigate()
  const planMutation = usePlanCountMutation()
  const warehouseSelector = useScopedWarehouseSelector()

  const methods = useForm<CountPlanningFormValues>({
    resolver: zodResolver(countPlanningFormSchema) as Resolver<CountPlanningFormValues>,
    defaultValues: {
      warehouseId: '',
      countType: '' as unknown as InventoryCountType,
      scopeType: '' as unknown as InventoryCountScopeType,
      scopeSummaryAr: '',
      notes: '',
    },
    mode: 'onChange',
  })

  const scopeType = methods.watch('scopeType')
  const isSubmitting = planMutation.isPending
  const submitError =
    planMutation.error === null
      ? null
      : 'تعذّر إنشاء جلسة الجرد. راجع البيانات أو تحقق من عدم وجود جلسة جارية لنفس المستودع.'

  const scopeHint = useMemo(() => scopeHintAr(scopeType), [scopeType])

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.countNew.labelAr}
        subtitle="أنشئ جلسة جرد: اختر المستودع ونوع الجرد والنطاق. تُلتقط لقطة الأرصدة عند بدء الجلسة، لا عند التخطيط."
      />
      <FormProvider {...methods}>
        <form
          data-slot="count-planning-form"
          onSubmit={methods.handleSubmit((values) => {
            planMutation.mutate(
              {
                warehouseId: values.warehouseId,
                countType: values.countType,
                freezePolicy: 'SoftFreeze',
                rowVersion: 0,
                notes: values.notes === undefined || values.notes === '' ? null : values.notes,
                scope: {
                  scopeIds: [],
                  scopeType: values.scopeType,
                  ...(values.scopeSummaryAr !== undefined && values.scopeSummaryAr !== ''
                    ? { summaryAr: values.scopeSummaryAr }
                    : {}),
                },
              },
              {
                onSuccess: (count) => {
                  navigate(ROUTE_PATHS.countDetail.replace(':countId', count.countId))
                },
              },
            )
          })}
          noValidate
          className="grid max-w-3xl gap-5"
        >
          <Controller
            control={methods.control}
            name="warehouseId"
            rules={{ required: true }}
            render={({ field }) => (
              <div className="grid gap-2">
                <label htmlFor="count-warehouse" className="text-sm font-medium text-foreground">
                  المستودع
                </label>
                <AsyncSelect<InventoryCountWarehouse>
                  value={field.value === '' ? null : field.value}
                  loadOptions={warehouseSelector.loadOptions}
                  onValueChange={(next) => field.onChange(next ?? '')}
                  disabled={isSubmitting || !warehouseSelector.scopeReady}
                  inputProps={{
                    id: 'count-warehouse',
                    'aria-label': 'مستودع الجرد',
                  }}
                  placeholder={
                    warehouseSelector.scopeReady
                      ? 'ابحث عن مستودع ضمن نطاقك...'
                      : 'بانتظار اختيار النطاق...'
                  }
                  emptyMessage="لا توجد مستودعات نشطة مطابقة ضمن نطاقك."
                  errorMessage="تعذر البحث عن المستودعات ضمن نطاقك."
                />
                {methods.formState.errors.warehouseId !== undefined ? (
                  <p role="alert" className="text-sm text-destructive">
                    {methods.formState.errors.warehouseId.message}
                  </p>
                ) : null}
                <ActiveCountWarning warehouseId={methods.watch('warehouseId')} />
              </div>
            )}
          />

          <div className="grid gap-2">
            <span className="text-sm font-medium text-foreground">نوع الجرد</span>
            <Controller
              control={methods.control}
              name="countType"
              rules={{ required: true }}
              render={({ field }) => (
                <Select
                  value={field.value === undefined ? '' : field.value}
                  onValueChange={(next) =>
                    field.onChange(next === '' ? undefined : (next as InventoryCountType))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="نوع الجرد">
                    <SelectValue placeholder="اختر نوع الجرد...">
                      {field.value === undefined
                        ? 'اختر نوع الجرد...'
                        : COUNT_TYPE_LABELS_AR[field.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {COUNT_TYPE_LABELS_AR[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {methods.formState.errors.countType !== undefined ? (
              <p role="alert" className="text-sm text-destructive">
                {methods.formState.errors.countType.message}
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <span className="text-sm font-medium text-foreground">نطاق الجرد</span>
            <Controller
              control={methods.control}
              name="scopeType"
              rules={{ required: true }}
              render={({ field }) => (
                <Select
                  value={field.value === undefined ? '' : field.value}
                  onValueChange={(next) =>
                    field.onChange(next === '' ? undefined : (next as InventoryCountScopeType))
                  }
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="نطاق الجرد">
                    <SelectValue placeholder="اختر نطاق الجرد...">
                      {field.value === undefined
                        ? 'اختر نطاق الجرد...'
                        : SCOPE_LABELS_AR[field.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(SCOPE_LABELS_AR) as InventoryCountScopeType[]).map((type) => (
                      <SelectItem key={type} value={type}>
                        {SCOPE_LABELS_AR[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {scopeHint !== undefined ? (
              <p className="text-xs text-muted-foreground">{scopeHint}</p>
            ) : null}
            {methods.formState.errors.scopeType !== undefined ? (
              <p role="alert" className="text-sm text-destructive">
                {methods.formState.errors.scopeType.message}
              </p>
            ) : null}
          </div>

          <Controller
            control={methods.control}
            name="scopeSummaryAr"
            render={({ field }) => (
              <div className="grid gap-2">
                <label htmlFor="scope-summary" className="text-sm font-medium text-foreground">
                  وصف النطاق (اختياري)
                </label>
                <Input
                  {...field}
                  id="scope-summary"
                  maxLength={200}
                  placeholder="مثال: أجهزة الحاسوب والطابعات"
                  disabled={isSubmitting}
                />
              </div>
            )}
          />

          <Controller
            control={methods.control}
            name="notes"
            render={({ field }) => (
              <div className="grid gap-2">
                <label htmlFor="count-notes" className="text-sm font-medium text-foreground">
                  ملاحظات (اختياري)
                </label>
                <Textarea
                  {...field}
                  id="count-notes"
                  rows={3}
                  maxLength={500}
                  placeholder="ملاحظات فريق الجرد..."
                  disabled={isSubmitting}
                />
                {methods.formState.errors.notes !== undefined ? (
                  <p role="alert" className="text-sm text-destructive">
                    {methods.formState.errors.notes.message}
                  </p>
                ) : null}
              </div>
            )}
          />

          {submitError !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isSubmitting} className="min-w-36">
              {isSubmitting ? 'جارٍ التخطيط...' : 'تخطيط الجلسة'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => navigate(ROUTE_PATHS.counts)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}

const SCOPE_LABELS_AR: Readonly<Record<InventoryCountScopeType, string>> = {
  AllMaterials: 'كل المواد',
  ByDomain: 'حسب المجال',
  ByCategory: 'حسب الصنف',
  ByMaterial: 'حسب المادة',
}

interface InventoryCountWarehouse {
  warehouseId: string
  nameAr: string
}
