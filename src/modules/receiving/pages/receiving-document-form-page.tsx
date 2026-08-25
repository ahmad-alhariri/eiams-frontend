import { zodResolver } from '@hookform/resolvers/zod'
import type { FormEvent } from 'react'
import type { DeepPartial, Resolver } from 'react-hook-form'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ReceivingPetalForm } from '@/modules/receiving/components/receiving-petal-form'
import {
  fromReceivingInfo,
  receivingInfoSchema,
  toReceivingInfo,
} from '@/modules/receiving/schemas/receiving-info.schema'
import { AssetLineEditor } from '@/shared/documents/components/asset-line-editor'
import { QuantityLineEditor } from '@/shared/documents/components/quantity-line-editor'
import {
  buildDraftRequest,
  DocumentHeaderSection,
  documentHeaderSchema,
} from '@/shared/documents/document-header-form'
import {
  assetLineSchema,
  createEmptyQuantityLine,
  linesHaveUniqueMaterials,
  quantityLineSchema,
  toAssetLineInputs,
  toDocumentLineInputs,
} from '@/shared/documents/schemas/document-lines.schemas'
import {
  documentDraftMutationError,
  useCreateDocumentMutation,
} from '@/shared/documents/use-document-draft-mutations'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'

/**
 * The form mirrors the RHF groups the shared sections register: the spine
 * lives under `header.*`, the ReceivingInfo petal under
 * `petal.receivingInfo.*`, the quantity lines under `lines.*` and the asset
 * capture lines under `assetLines.*` (the asset editor's `namePrefix`).
 * Material kinds are partitioned between the two containers by the editors'
 * loaders, so cross-container duplicates are impossible; each container only
 * guards internal uniqueness.
 *
 * The "at least one line" rule cannot live in an outer `superRefine`: this
 * zod version skips an object's refinements when an inner `z.number()`
 * fails (the empty `paperDocumentYear`), so the submit path enforces it
 * before the resolver runs.
 */
const receivingDocumentFormSchema = z.object({
  header: documentHeaderSchema,
  petal: z.object({
    receivingInfo: receivingInfoSchema,
  }),
  lines: z.array(quantityLineSchema).refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  }),
  assetLines: z.array(assetLineSchema).refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  }),
})

export type ReceivingDocumentFormValues = z.infer<typeof receivingDocumentFormSchema>

const DEFAULT_VALUES: DeepPartial<ReceivingDocumentFormValues> = {
  header: {
    warehouseId: '',
    paperDocumentNumber: '',
  },
  petal: {
    receivingInfo: fromReceivingInfo(undefined),
  },
  lines: [createEmptyQuantityLine()],
  assetLines: [],
}

/**
 * New receiving document form (e13-t05): the shared header spine (source
 * warehouse + paper number/year), the ReceivingInfo petal (type + supplier),
 * and the two shared line editors composed side by side — quantity lines
 * (price/batch/expiry features) and asset capture lines for Asset-kind
 * materials (one per-unit `AssetInput` row). A document may carry quantity
 * lines, asset lines, or both; the combined "at least one line" rule is the
 * only cross-container validation.
 *
 * Submission flattens header + merged lines + petal into a contract-typed
 * `WarehouseDocumentDraftRequest` via `buildDraftRequest`, persists it as a
 * draft through the shared create mutation, and navigates to the created
 * document's detail page.
 */
export default function ReceivingDocumentFormPage() {
  const navigate = useNavigate()
  const createMutation = useCreateDocumentMutation()
  const form = useForm<ReceivingDocumentFormValues>({
    resolver: zodResolver(receivingDocumentFormSchema) as Resolver<ReceivingDocumentFormValues>,
    defaultValues: DEFAULT_VALUES,
  })
  const isSubmitting = form.formState.isSubmitting
  const submitErrorMessage =
    createMutation.error === null ? null : documentDraftMutationError(createMutation.error)
  const headerWarehouseId = useWatch({ control: form.control, name: 'header.warehouseId' })

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const { lines, assetLines } = form.getValues()
    if (lines.length + assetLines.length === 0) {
      void form.trigger().then(() => {
        form.setError('lines', { type: 'manual', message: 'أضف بنداً واحداً على الأقل.' })
      })
      return
    }
    form.clearErrors('lines')
    void form.handleSubmit((values) => {
      const draft = buildDraftRequest<'Receiving'>({
        documentType: 'Receiving',
        header: values.header,
        lines: [...toDocumentLineInputs(values.lines), ...toAssetLineInputs(values.assetLines)],
        petals: { receivingInfo: toReceivingInfo(values.petal.receivingInfo) },
        rowVersion: 0,
      })
      createMutation.mutate(draft, {
        onSuccess: (document) => {
          navigate(ROUTE_PATHS.documentReceivingDetail.replace(':documentId', document.documentId))
        },
      })
    })(event)
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.documentReceivingNew.labelAr}
        subtitle="سجّل استلاماً جديداً في مستودعك: بيانات المستند الورقي، نوع الاستلام والمورد، ثم بنود المواد والأصول المستلمة."
      />
      <FormProvider {...form}>
        <form
          data-slot="receiving-document-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          <DocumentHeaderSection
            documentType="Receiving"
            petalSlot={<ReceivingPetalForm disabled={isSubmitting} />}
            disabled={isSubmitting}
          />
          <section
            data-slot="receiving-lines-section"
            aria-label="بنود الاستلام"
            className="grid gap-3 rounded-md border border-border p-4"
          >
            <h2 className="text-sm font-medium text-foreground">بنود الاستلام</h2>
            <QuantityLineEditor
              documentType="Receiving"
              warehouseId={headerWarehouseId || undefined}
              disabled={isSubmitting}
            />
            <h3 className="border-t border-border pt-3 text-sm font-medium text-foreground">
              بنود الأصول (أصل ثابت لكل وحدة)
            </h3>
            <AssetLineEditor
              documentType="Receiving"
              warehouseId={headerWarehouseId || undefined}
              disabled={isSubmitting}
              namePrefix="assetLines"
            />
          </section>
          {submitErrorMessage !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {submitErrorMessage}
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
              onClick={() => navigate(ROUTE_PATHS.documentReceiving)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
