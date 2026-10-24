import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import type { Resolver } from 'react-hook-form'
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { ActiveCountWarning } from '@/modules/inventory-count/components/active-count-warning'
import { CountMaterialName } from '@/modules/inventory-count/components/count-name-fields'
import { useMaterialDomainsQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import { useScopedMaterialSelector } from '@/modules/catalog/hooks/use-scoped-material-selector'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.types'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { usePlanCountMutation } from '@/modules/inventory-count/hooks/use-count-queries'
import {
  INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR,
  INVENTORY_COUNT_SCOPE_LABELS_AR,
  INVENTORY_COUNT_TYPE_LABELS_AR,
  type CountFreezePolicy,
  type CountScopeType,
  type CountType,
} from '@/modules/inventory-count/types/inventory-count.types'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Textarea } from '@/shared/ui/textarea'
import { IconX } from '@tabler/icons-react'

const COUNT_TYPES = Object.keys(INVENTORY_COUNT_TYPE_LABELS_AR) as readonly CountType[]
const SCOPE_TYPES = Object.keys(INVENTORY_COUNT_SCOPE_LABELS_AR) as readonly CountScopeType[]
const FREEZE_POLICIES = Object.keys(
  INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR,
) as readonly CountFreezePolicy[]

/** Contract ceiling on `materialIds` for SelectedMaterials plans. */
const MAX_SELECTED_MATERIALS = 100

/**
 * Count planning schema (IC-FE-1 / live `POST /inventory-counts` body —
 * closed schema, so ONLY these keys reach the wire). `materialDomainId` and
 * `materialIds` are validated cross-field: the domain is required exactly for
 * `MaterialDomain`, and picking `SelectedMaterials` needs 1..100 unique ids.
 */
const countPlanningFormSchema = z
  .object({
    warehouseId: z.uuid('يجب اختيار مستودع الجرد من القائمة.'),
    countType: z.enum(['Scheduled', 'Surprise', 'Cycle'], {
      message: 'يجب اختيار نوع الجرد.',
    }),
    scopeType: z.enum(['EntireWarehouse', 'MaterialDomain', 'SelectedMaterials'], {
      message: 'يجب اختيار نطاق الجرد.',
    }),
    materialDomainId: z.string().optional(),
    materialIds: z.array(z.string()),
    freezePolicy: z.enum(['SoftFreeze', 'HardFreeze', 'NoFreeze'], {
      message: 'يجب اختيار سياسة التجميد.',
    }),
    freezePolicyReason: z
      .string()
      .trim()
      .max(500, 'يجب ألا يتجاوز سبب سياسة التجميد 500 محرفاً.')
      .optional(),
  })
  .superRefine((values, context) => {
    if (values.scopeType === 'MaterialDomain' && (values.materialDomainId ?? '') === '') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['materialDomainId'],
        message: 'يجب اختيار مجال المواد لهذا النطاق.',
      })
    }
    if (values.scopeType === 'SelectedMaterials') {
      if (values.materialIds.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['materialIds'],
          message: 'يجب اختيار مادة واحدة على الأقل.',
        })
      }
      if (new Set(values.materialIds).size !== values.materialIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['materialIds'],
          message: 'لا يجوز اختيار المادة نفسها أكثر من مرة.',
        })
      }
      if (values.materialIds.length > MAX_SELECTED_MATERIALS) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['materialIds'],
          message: `يجب ألا تتجاوز المواد المحددة ${MAX_SELECTED_MATERIALS} مادة.`,
        })
      }
    }
    if (values.freezePolicy !== 'SoftFreeze' && (values.freezePolicyReason ?? '') === '') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['freezePolicyReason'],
        message: 'يجب إدخال سبب عند اختيار تجميد غير مرن.',
      })
    }
  })

type CountPlanningFormValues = z.infer<typeof countPlanningFormSchema>

function scopeHintAr(scopeType: CountScopeType | undefined): string | undefined {
  switch (scopeType) {
    case 'EntireWarehouse':
      return 'ستُجرد كل مواد المستودع.'
    case 'MaterialDomain':
      return 'اختر مجال المواد الذي تُجرد موادّه.'
    case 'SelectedMaterials':
      return `اختر ما يصل إلى ${MAX_SELECTED_MATERIALS} مادة ضمن نطاقك.`
    default:
      return undefined
  }
}

/** One picked material rendered as a removable chip with its resolved name. */
function SelectedMaterialChip({
  materialId,
  onRemove,
  disabled,
}: {
  materialId: string
  onRemove: () => void
  disabled: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-sm">
      <CountMaterialName materialId={materialId} />
      <button
        type="button"
        aria-label={`إزالة المادة ${materialId}`}
        disabled={disabled}
        onClick={onRemove}
        className="text-muted-foreground transition-colors hover:text-destructive"
      >
        <IconX size={14} aria-hidden />
      </button>
    </span>
  )
}

/**
 * New count planning page (e20-t03, IC-FE-1): builds the live
 * `POST /inventory-counts` body — `warehouseId`, `countType`, `scopeType`,
 * `materialDomainId` (only for `MaterialDomain`), `materialIds` (always
 * present), `freezePolicy` (+ non-blank `freezePolicyReason` only when the
 * policy is not SoftFreeze). No `rowVersion`, no `notes`, no `scope` object:
 * the live body is closed (`additionalProperties: false`).
 */
export default function CountPlanningFormPage() {
  const navigate = useNavigate()
  const planMutation = usePlanCountMutation()
  const warehouseSelector = useScopedWarehouseSelector()
  const materialSelector = useScopedMaterialSelector(true)

  const methods = useForm<CountPlanningFormValues>({
    resolver: zodResolver(countPlanningFormSchema) as Resolver<CountPlanningFormValues>,
    defaultValues: {
      warehouseId: '',
      countType: 'Scheduled',
      scopeType: 'EntireWarehouse',
      materialDomainId: '',
      materialIds: [],
      freezePolicy: 'SoftFreeze',
      freezePolicyReason: '',
    },
    mode: 'onChange',
  })

  const scopeType = useWatch({ control: methods.control, name: 'scopeType' })
  const freezePolicy = useWatch({ control: methods.control, name: 'freezePolicy' })
  const materialIds = useWatch({ control: methods.control, name: 'materialIds' })
  const warehouseId = useWatch({ control: methods.control, name: 'warehouseId' })

  /** Domain options from the domain LIST (small master data) — no full catalog fetch. */
  const domainsQuery = useMaterialDomainsQuery(
    { page: 1, pageSize: 100, status: 'Active' },
    { enabled: scopeType === 'MaterialDomain' },
  )
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
        subtitle="أنشئ جلسة جرد: اختر المستودع ونوع الجرد والنطاق وسياسة التجميد. تُلتقط لقطة الأرصدة عند بدء الجلسة، لا عند التخطيط."
      />
      <FormProvider {...methods}>
        <form
          data-slot="count-planning-form"
          onSubmit={methods.handleSubmit((values) => {
            planMutation.mutate(
              {
                warehouseId: values.warehouseId,
                countType: values.countType,
                scopeType: values.scopeType,
                // Absent unless MaterialDomain — any extra key on the wire is a 400.
                ...(values.scopeType === 'MaterialDomain' && values.materialDomainId
                  ? { materialDomainId: values.materialDomainId }
                  : {}),
                // Always present: the picked ids (or [] for other scopes).
                materialIds:
                  values.scopeType === 'SelectedMaterials' ? [...values.materialIds] : [],
                freezePolicy: values.freezePolicy,
                // Reason travels ONLY for non-SoftFreeze policies.
                ...(values.freezePolicy === 'SoftFreeze' || !values.freezePolicyReason
                  ? {}
                  : { freezePolicyReason: values.freezePolicyReason }),
              },
              {
                onSuccess: (created) => {
                  navigate(ROUTE_PATHS.countDetail.replace(':countId', created.id))
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
                <AsyncSelect<Warehouse>
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
                <ActiveCountWarning warehouseId={warehouseId ?? ''} />
              </div>
            )}
          />

          <div className="grid gap-2">
            <span className="text-sm font-medium text-foreground">نوع الجرد</span>
            <Controller
              control={methods.control}
              name="countType"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(next) => field.onChange(next)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="نوع الجرد">
                    <SelectValue placeholder="اختر نوع الجرد...">
                      {INVENTORY_COUNT_TYPE_LABELS_AR[field.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {COUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {INVENTORY_COUNT_TYPE_LABELS_AR[type]}
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
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(next) => field.onChange(next)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="نطاق الجرد">
                    <SelectValue placeholder="اختر نطاق الجرد...">
                      {INVENTORY_COUNT_SCOPE_LABELS_AR[field.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {SCOPE_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {INVENTORY_COUNT_SCOPE_LABELS_AR[type]}
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

          {scopeType === 'MaterialDomain' ? (
            <Controller
              control={methods.control}
              name="materialDomainId"
              render={({ field }) => (
                <div className="grid gap-2">
                  <label htmlFor="count-domain" className="text-sm font-medium text-foreground">
                    مجال المواد
                  </label>
                  <Select
                    value={field.value === '' ? undefined : field.value}
                    onValueChange={(next) => field.onChange(next ?? '')}
                    disabled={isSubmitting || domainsQuery.isLoading}
                  >
                    <SelectTrigger id="count-domain" aria-label="مجال المواد">
                      <SelectValue placeholder="اختر مجال المواد...">
                        {field.value === '' ? 'اختر مجال المواد...' : field.value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {(domainsQuery.data?.items ?? []).map((domain) => (
                        <SelectItem key={domain.id} value={domain.id}>
                          {domain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {methods.formState.errors.materialDomainId !== undefined ? (
                    <p role="alert" className="text-sm text-destructive">
                      {methods.formState.errors.materialDomainId.message}
                    </p>
                  ) : null}
                </div>
              )}
            />
          ) : null}

          {scopeType === 'SelectedMaterials' ? (
            <div className="grid gap-2">
              <label className="text-sm font-medium text-foreground">
                المواد المحددة ({materialIds?.length ?? 0}/{MAX_SELECTED_MATERIALS})
              </label>
              <AsyncSelect
                value={null}
                loadOptions={materialSelector.loadOptions}
                onValueChange={(_value, option) => {
                  if (option === undefined) {
                    return
                  }
                  const current = methods.getValues('materialIds')
                  if (!current.includes(option.value)) {
                    methods.setValue('materialIds', [...current, option.value], {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                }}
                disabled={isSubmitting || !materialSelector.scopeReady}
                placeholder="ابحث عن مادة لإضافتها إلى نطاق الجرد..."
                emptyMessage="لا توجد مواد نشطة مطابقة ضمن نطاقك."
                errorMessage="تعذر البحث عن المواد ضمن نطاقك."
                inputProps={{ 'aria-label': 'اختيار مادة للنطاق' }}
              />
              {materialIds !== undefined && materialIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {materialIds.map((materialId) => (
                    <SelectedMaterialChip
                      key={materialId}
                      materialId={materialId}
                      disabled={isSubmitting}
                      onRemove={() => {
                        methods.setValue(
                          'materialIds',
                          materialIds.filter((id) => id !== materialId),
                          { shouldDirty: true, shouldValidate: true },
                        )
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {methods.formState.errors.materialIds !== undefined ? (
                <p role="alert" className="text-sm text-destructive">
                  {methods.formState.errors.materialIds.message}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2">
            <span className="text-sm font-medium text-foreground">سياسة التجميد</span>
            <Controller
              control={methods.control}
              name="freezePolicy"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(next) => field.onChange(next)}
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="سياسة التجميد">
                    <SelectValue placeholder="اختر سياسة التجميد...">
                      {INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR[field.value]}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FREEZE_POLICIES.map((policy) => (
                      <SelectItem key={policy} value={policy}>
                        {INVENTORY_COUNT_FREEZE_POLICY_LABELS_AR[policy]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {methods.formState.errors.freezePolicy !== undefined ? (
              <p role="alert" className="text-sm text-destructive">
                {methods.formState.errors.freezePolicy.message}
              </p>
            ) : null}
          </div>

          {freezePolicy !== undefined && freezePolicy !== 'SoftFreeze' ? (
            <Controller
              control={methods.control}
              name="freezePolicyReason"
              render={({ field }) => (
                <div className="grid gap-2">
                  <label
                    htmlFor="count-freeze-reason"
                    className="text-sm font-medium text-foreground"
                  >
                    سبب سياسة التجميد (مطلوب)
                  </label>
                  <Textarea
                    {...field}
                    id="count-freeze-reason"
                    rows={3}
                    maxLength={500}
                    placeholder="سبب تقييد حركة المخزون أثناء الجلسة"
                    disabled={isSubmitting}
                  />
                  {methods.formState.errors.freezePolicyReason !== undefined ? (
                    <p role="alert" className="text-sm text-destructive">
                      {methods.formState.errors.freezePolicyReason.message}
                    </p>
                  ) : null}
                </div>
              )}
            />
          ) : null}

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
