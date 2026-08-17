import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { FormProvider, useForm, type Resolver, type SubmitHandler } from 'react-hook-form'
import { z } from 'zod'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { AssetLineEditor } from '@/shared/documents/components/asset-line-editor'
import {
  assetLinesSchema,
  toAssetLineInputs,
  type AssetLineDocumentType,
  type AssetLinesContainer,
} from '@/shared/documents/schemas/document-lines.schemas'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Button } from '@/shared/ui/button'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import type { Warehouse } from '@/shared/types/generated/eiams-v1'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const DOCUMENT_TYPE_LABELS: Readonly<Record<AssetLineDocumentType, string>> = {
  Receiving: 'استلام',
  Opening: 'افتتاحية',
}

interface DemoFormValues extends AssetLinesContainer {
  header: { warehouseId: string }
}

const DEMO_RESOLVER = z.object({
  header: z.object({ warehouseId: z.string() }),
  lines: assetLinesSchema,
})

function DraftDump({ draft }: { draft: object | null }) {
  return (
    <pre
      dir="ltr"
      className="max-h-44 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-start text-xs text-foreground"
    >
      {draft
        ? JSON.stringify(draft, null, 2)
        : 'لا توجد مسودة بعد — اختر مادة أصل وسجّل وحداتها ثم اضغط «حفظ المسودة».'}
    </pre>
  )
}

/**
 * Dev-only surface for the asset-line capture editor: a self-contained draft
 * form hosting the shared `lines` FieldArray + a header group (document type
 * + scoped warehouse picker), served by the dev mock API. The submitted dump
 * shows the exact `DocumentLineInput` payload `toAssetLineInputs` produces.
 */
function AssetLineEditorDemo() {
  const [documentType, setDocumentType] = useState<AssetLineDocumentType>('Receiving')
  const [warehouse, setWarehouse] = useState<AsyncSelectOption<Warehouse> | null>(null)
  const warehouseSelector = useScopedWarehouseSelector()
  const form = useForm<DemoFormValues>({
    resolver: zodResolver(DEMO_RESOLVER) as Resolver<DemoFormValues>,
    defaultValues: { header: { warehouseId: '' }, lines: [] },
  })
  const [draft, setDraft] = useState<object | null>(null)

  const onSubmit: SubmitHandler<DemoFormValues> = (values, event) => {
    event?.preventDefault()
    setDraft({
      documentType,
      header: {
        warehouseId: values.header.warehouseId,
        warehouseDisplayName: warehouse?.payload?.nameAr ?? null,
      },
      assetLines: toAssetLineInputs(values.lines),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        محرر التقاط خطوط الأصول المشترك (D-MAT-01): مادة واحدة من نوع أصل لكل بند مع وحدة/أصل لكل
        وحدة كمية. رقم الأصل اختياري في المسودة — يمنحه الخادم آلياً عند الرصد — والرقم التسلسلي
        وتاريخا الحصول وانتهاء الضمان اختيارية؛ لا يوجد تحويل وحدات لخطوط الأصول.
      </p>
      <FormProvider {...form}>
        <form
          className="flex flex-col gap-4"
          aria-label="نموذج استلام/افتتاحية بخطوط أصول"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">نوع السند</span>
              <Select
                value={documentType}
                onValueChange={(value) => setDocumentType(value as AssetLineDocumentType)}
              >
                <SelectTrigger aria-label="نوع السند">
                  <SelectValue>{DOCUMENT_TYPE_LABELS[documentType]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(['Receiving', 'Opening'] as const).map((type) => (
                    <SelectItem key={type} value={type}>
                      {DOCUMENT_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-medium text-foreground">المستودع المصدر</span>
              <AsyncSelect<Warehouse>
                value={warehouse?.value ?? null}
                onValueChange={(value, option) => {
                  setWarehouse(option ?? null)
                  form.setValue('header.warehouseId', value ?? '')
                }}
                loadOptions={warehouseSelector.loadOptions}
                disabled={!warehouseSelector.scopeReady}
                placeholder={
                  warehouseSelector.scopeReady
                    ? 'اكتب اسم المستودع للبحث...'
                    : 'بانتظار اختيار النطاق...'
                }
                emptyMessage="لا توجد مستودعات نشطة ضمن نطاقك."
              />
            </div>
          </div>
          <AssetLineEditor
            documentType={documentType}
            warehouseId={warehouse?.value ?? undefined}
          />
          <div className="flex items-center gap-2">
            <Button type="submit">حفظ المسودة</Button>
            <Button type="button" variant="outline" onClick={() => void form.trigger()}>
              تحقق من الحقول
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                form.reset()
                setWarehouse(null)
                setDraft(null)
              }}
            >
              إعادة تعيين
            </Button>
          </div>
        </form>
      </FormProvider>
      <DraftDump draft={draft} />
    </div>
  )
}

export const assetLineEditorGallerySections: GallerySection[] = [
  {
    id: 'asset-line-editor',
    titleAr: 'محرر خطوط الأصول (AssetLineEditor)',
    descriptionAr:
      'التقاط مشترك لبنود مواد الأصول في سندات الاستلام والافتتاحية: بند لكل مادة أصل، وحدة/أصل لكل كمية، رقم أصل اختياري في المسودة (يُمنح آلياً عند الرصد)، مع تحقق عربي فوري وتلميحات قدرة المستودع.',
    render: () => <AssetLineEditorDemo />,
  },
]
