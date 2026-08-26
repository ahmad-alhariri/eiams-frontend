import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useState, type FormEvent } from 'react'
import { FormProvider, useForm, Controller, type Resolver } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { useCreateAdjustmentMutation } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { useDisposalEligibleAssetsQuery } from '@/modules/adjustment/hooks/use-adjustment-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import { ROUTE_PATHS } from '@/config/routes'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
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
  /** Selection-time display snapshot (never sent). */
  assetLabel: z.string(),
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
  const { has } = usePermission()
  const warehouseSelector = useScopedWarehouseSelector()
  const createMutation = useCreateAdjustmentMutation()

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="سند إعدام أصل"
        subtitle="إعدام أصل واحد بموجب محضر لجنة الفحص؛ الأصل يصبح مستبعدًا نهائيًا بعد الترحيل ولا يمكن عكس السند."
      />
      <AssetDisposalFormInner
        navigate={navigate}
        has={has}
        warehouseSelector={warehouseSelector}
        createMutation={createMutation}
      />
    </div>
  )
}

function AssetDisposalFormInner({
  navigate,
  has,
  warehouseSelector,
  createMutation,
}: {
  navigate: ReturnType<typeof useNavigate>
  has: (code: Parameters<ReturnType<typeof usePermission>['has']>[0]) => boolean
  warehouseSelector: ReturnType<typeof useScopedWarehouseSelector>
  createMutation: ReturnType<typeof useCreateAdjustmentMutation>
}) {
  const [warehouseId, setWarehouseId] = useState('')

  // Authoritative eligible-asset lookup — re-fetched per warehouse.
  const eligibleQuery = useDisposalEligibleAssetsQuery(
    warehouseId === '' ? undefined : { pageIndex: 0, pageSize: 50, warehouseId },
  )

  const defaultValues = useMemoDefaultValues()
  const form = useForm<DisposalFormValues>({
    resolver: zodResolver(disposalFormSchema) as Resolver<DisposalFormValues>,
    defaultValues,
    mode: 'onChange',
  })
  const isSubmitting = form.formState.isSubmitting

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      void form.handleSubmit((values) => {
        createMutation.mutate(
          {
            warehouseId: values.warehouseId,
            purpose: 'Disposal',
            reason: values.reason,
            lines: [
              {
                materialId: values.assetId === '' ? '' : values.assetId,
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

  if (!has('document.create')) {
    return (
      <ContentCard title="غير مصرّح">
        <p role="alert" className="text-sm text-destructive">
          لا تملك صلاحية إنشاء سندات الإعدام؛ هذه العملية حصرية لمديري المستودعات.
        </p>
      </ContentCard>
    )
  }

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
                    }}
                    loadOptions={warehouseSelector.loadOptions}
                    disabled={!warehouseSelector.scopeReady || isSubmitting}
                    placeholder="اختر المستودع..."
                    inputProps={{ 'aria-label': 'مستودع الإعدام' }}
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
                    value={field.value || null}
                    onValueChange={(value, option: AsyncSelectOption<Asset> | undefined) => {
                      field.onChange(value ?? '')
                      form.setValue(
                        'assetLabel',
                        option?.label ??
                          (option?.payload as { assetNumber?: string } | undefined)?.assetNumber ??
                          '',
                        { shouldValidate: false },
                      )
                    }}
                    loadOptions={
                      eligibleQuery.data !== undefined
                        ? () =>
                            Promise.resolve(
                              eligibleQuery.data.items.map((asset) => ({
                                value: asset.assetId,
                                label: `${asset.assetNumber} — ${asset.material.displayName}`,
                                payload: asset,
                              })),
                            )
                        : async () => []
                    }
                    disabled={warehouseId === '' || isSubmitting || eligibleQuery.isLoading}
                    placeholder={
                      warehouseId === '' ? 'اختر المستودع أولًا...' : 'ابحث برقم الأصل...'
                    }
                    inputProps={{ 'aria-label': 'الأصل المستبعد' }}
                  />
                )}
              />
              {warehouseId !== '' && eligibleQuery.isLoading ? (
                <LoadingSpinner className="min-h-8" label="جارٍ تحميل الأصول المؤهلة..." />
              ) : null}
              {warehouseId !== '' &&
              !eligibleQuery.isLoading &&
              (eligibleQuery.data?.items.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  لا توجد أصول مؤهلة للإعدام في هذا المستودع.
                </p>
              ) : null}
              {form.formState.errors.assetId ? (
                <p role="alert" className="text-sm text-destructive">
                  {form.formState.errors.assetId.message}
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

function useMemoDefaultValues(): DisposalFormValues {
  return {
    warehouseId: '',
    assetId: '',
    assetLabel: '',
    quantityDelta: -1,
    reason: '',
  }
}
