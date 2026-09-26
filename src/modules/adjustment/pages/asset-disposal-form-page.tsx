import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useState, type FormEvent } from 'react'
import { FormProvider, useForm, Controller, type Resolver } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { useDisposalEligibleAssetSelector } from '@/modules/adjustment/hooks/use-disposal-eligible-asset-selector'
import { useCreateAdjustmentMutation } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { useRoutePermission } from '@/modules/auth/hooks/use-permission'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_PATHS } from '@/config/routes'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Label } from '@/shared/ui/label'
import { Textarea } from '@/shared/ui/textarea'
import type { Asset } from '@/shared/types/generated/eiams-v1'

/**
 * Disposal adjustment form (e21-t08). D-ADJ-01 terminal flow:
 *
 * - exactly ONE line, backed by an asset selected ONLY from the server's
 *   disposal-eligible lookup (`GET /adjustments/disposal-eligible-assets`);
 *   free-text asset identities are never accepted;
 * - the line effect is exactly −1 (the canonical signed quantity);
 * - the reason records the disposal authorization;
 * - the posted result is TERMINAL — the asset becomes Disposed and no
 *   reversal action ever exists for it.
 */

const DISPOSAL_REASON_MAX = 500

const disposalFormSchema = z.object({
  warehouseId: z.uuid('يجب اختيار مستودع صالح من القائمة.'),
  assetId: z.uuid('يجب اختيار أصل صالح من القائمة.'),
  materialId: z.uuid('يجب اختيار أصل صالح من القائمة.'),
  /** Canonical signed quantity: always exactly −1 for a disposal. */
  quantityDelta: z.literal(-1),
  reason: z
    .string()
    .trim()
    .min(1, 'سبب الإعدام مطلوب.')
    .max(DISPOSAL_REASON_MAX, `يجب ألا يتجاوز سبب الإعدام ${DISPOSAL_REASON_MAX} محرفاً.`),
})

type DisposalFormValues = z.infer<typeof disposalFormSchema>

export default function AssetDisposalFormPage() {
  const navigate = useNavigate()
  const canCreate = useRoutePermission('assetDisposalNew')
  const warehouseSelector = useScopedWarehouseSelector()
  const createMutation = useCreateAdjustmentMutation()

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="سند إعدام أصل"
        subtitle="إعدام أصل واحد بموجب محضر لجنة الفحص؛ الأصل يصبح مستبعدًا نهائيًا بعد الترحيل ولا يمكن عكس السند."
      />
      {canCreate ? (
        <AssetDisposalFormInner
          navigate={navigate}
          warehouseSelector={warehouseSelector}
          createMutation={createMutation}
        />
      ) : (
        <ContentCard title="غير مصرّح">
          <p role="alert" className="text-sm text-destructive">
            لا تملك صلاحية إنشاء سندات الإعدام؛ هذه العملية حصرية لمديري المستودعات.
          </p>
        </ContentCard>
      )}
    </div>
  )
}

function AssetDisposalFormInner({
  navigate,
  warehouseSelector,
  createMutation,
}: {
  navigate: ReturnType<typeof useNavigate>
  warehouseSelector: ReturnType<typeof useScopedWarehouseSelector>
  createMutation: ReturnType<typeof useCreateAdjustmentMutation>
}) {
  const [warehouseId, setWarehouseId] = useState('')
  const eligibleAssetSelector = useDisposalEligibleAssetSelector(warehouseId)

  const defaultValues = createDisposalDefaultValues()
  const form = useForm<DisposalFormValues>({
    resolver: zodResolver(disposalFormSchema) as Resolver<DisposalFormValues>,
    defaultValues,
    mode: 'onChange',
  })
  const isSubmitting = form.formState.isSubmitting || createMutation.isPending

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (createMutation.isPending) return
      void form.handleSubmit((values) => {
        createMutation.mutate(
          {
            warehouseId: values.warehouseId,
            purpose: 'Disposal',
            reason: values.reason,
            lines: [
              {
                materialId: values.materialId,
                assetId: values.assetId,
                quantityDelta: -1,
                reason: values.reason,
              },
            ],
            rowVersion: 0,
          },
          {
            onSuccess: () => {
              void navigate(ROUTE_PATHS.adjustments)
            },
          },
        )
      })(event)
    },
    [createMutation, form, navigate],
  )

  return (
    <FormProvider {...form}>
      <form data-slot="disposal-form" onSubmit={onSubmit} noValidate className="grid gap-5">
        <ContentCard title="بيانات الإعدام">
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="disposal-warehouse">المستودع</Label>
              <Controller
                control={form.control}
                name="warehouseId"
                render={({ field }) => (
                  <AsyncSelect
                    value={field.value || null}
                    onValueChange={(value) => {
                      field.onChange(value ?? '')
                      setWarehouseId(value ?? '')
                      form.setValue('assetId', '', { shouldValidate: false })
                      form.setValue('materialId', '', { shouldValidate: false })
                    }}
                    loadOptions={warehouseSelector.loadOptions}
                    disabled={!warehouseSelector.scopeReady || isSubmitting}
                    placeholder="اختر المستودع..."
                    inputProps={{ id: 'disposal-warehouse', 'aria-label': 'مستودع الإعدام' }}
                  />
                )}
              />
              {form.formState.errors.warehouseId ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.warehouseId.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="disposal-asset">الأصل المستبعد</Label>
              <Controller
                control={form.control}
                name="assetId"
                render={({ field }) => (
                  <AsyncSelect
                    key={warehouseId}
                    value={field.value || null}
                    onValueChange={(value, option: AsyncSelectOption<Asset> | undefined) => {
                      field.onChange(value ?? '')
                      form.setValue('materialId', option?.payload?.material.id ?? '', {
                        shouldValidate: false,
                      })
                    }}
                    loadOptions={eligibleAssetSelector.loadOptions}
                    disabled={!eligibleAssetSelector.scopeReady || isSubmitting}
                    placeholder={
                      warehouseId === '' ? 'اختر المستودع أولًا...' : 'ابحث برقم الأصل...'
                    }
                    emptyMessage="لا توجد أصول مؤهلة مطابقة في هذا المستودع."
                    errorMessage="تعذّر البحث في الأصول المؤهلة للإعدام. حاول مرة أخرى."
                    inputProps={{ id: 'disposal-asset', 'aria-label': 'الأصل المستبعد' }}
                  />
                )}
              />
              {form.formState.errors.assetId ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.assetId.message}
                </p>
              ) : null}
              {form.formState.errors.materialId && !form.formState.errors.assetId ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.materialId.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="disposal-reason">سبب الإعدام ومرجع المحضر</Label>
              <Textarea
                id="disposal-reason"
                rows={3}
                {...form.register('reason')}
                disabled={isSubmitting}
                placeholder="مثال: إعدام أصل تالف بموجب محضر لجنة الفحص رقم ..."
                aria-invalid={form.formState.errors.reason ? true : undefined}
              />
              {form.formState.errors.reason ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.reason.message}
                </p>
              ) : null}
            </div>
          </div>
        </ContentCard>

        <p className="rounded-md bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          الكمية الثابتة لهذا السند هي ‎-1‎ (أصل واحد). لا يمكن إعداد أكثر من أصل في السند نفسه،
          والترحيل نهائي.
        </p>

        {createMutation.error !== null ? (
          <p role="alert" className="text-sm text-destructive">
            تعذّر حفظ مسودة الإعدام. تحقق من البيانات وحاول مرة أخرى.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting} className="min-w-36">
            {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ مسودة الإعدام'}
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

function createDisposalDefaultValues(): DisposalFormValues {
  return {
    warehouseId: '',
    assetId: '',
    materialId: '',
    quantityDelta: -1,
    reason: '',
  }
}
