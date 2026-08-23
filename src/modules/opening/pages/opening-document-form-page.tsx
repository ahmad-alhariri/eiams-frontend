import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useState, type FormEvent } from 'react'
import type { DeepPartial, Resolver } from 'react-hook-form'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import {
  AssetLineEditor,
  type AssetLineCapabilityGate,
} from '@/shared/documents/components/asset-line-editor'
import {
  QuantityLineEditor,
  type QuantityLineCapabilityGate,
} from '@/shared/documents/components/quantity-line-editor'
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
 * Opening drafts are a `WarehouseDocument` spine with the `Opening` type;
 * they have neither a type-specific petal nor an opening-specific transport.
 * Asset identifiers are captured by the shared AssetLineEditor beside the
 * quantity-only lines; both map into the one contract `lines` payload.
 */
const openingDocumentFormSchema = z.object({
  header: documentHeaderSchema,
  lines: z.array(quantityLineSchema).refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  }),
  assetLines: z.array(assetLineSchema).refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  }),
})

export type OpeningDocumentFormValues = z.infer<typeof openingDocumentFormSchema>

const DEFAULT_VALUES: DeepPartial<OpeningDocumentFormValues> = {
  header: {
    warehouseId: '',
    paperDocumentNumber: '',
  },
  lines: [createEmptyQuantityLine()],
  assetLines: [],
}

type OpeningCapabilityGate = QuantityLineCapabilityGate | AssetLineCapabilityGate

function retainEquivalentCapabilityGate<T extends OpeningCapabilityGate>(
  currentGate: T,
  nextGate: T,
): T {
  if (currentGate.status === 'ready' && nextGate.status === 'ready') {
    return currentGate
  }
  if (
    currentGate.status !== 'ready' &&
    nextGate.status !== 'ready' &&
    currentGate.status === nextGate.status &&
    currentGate.messageAr === nextGate.messageAr
  ) {
    return currentGate
  }
  return nextGate
}

function combineCapabilityGates(
  quantityGate: QuantityLineCapabilityGate,
  assetGate: AssetLineCapabilityGate,
): OpeningCapabilityGate {
  if (quantityGate.status === 'blocked') {
    return quantityGate
  }
  if (assetGate.status === 'blocked') {
    return assetGate
  }
  if (quantityGate.status === 'unverified') {
    return quantityGate
  }
  if (assetGate.status === 'unverified') {
    return assetGate
  }
  return { status: 'ready' }
}

/**
 * New opening-balance draft page (e15-t02). It composes only the contract
 * spine, shared quantity-line editor, and shared AssetLineEditor. Quantity
 * lines may explicitly select the API's `Initial` or `Correction` opening
 * type; Asset lines capture one AssetInput per unit. The PRD's one-time
 * initialisation rule is presented as guidance only: the admitted OpenAPI
 * snapshot exposes neither a warehouse-level eligibility check nor a policy
 * result before a draft exists, so persistence remains server-authoritative.
 * Signed-copy workflow belongs to its later specialised task.
 */
export default function OpeningDocumentFormPage() {
  const navigate = useNavigate()
  const createMutation = useCreateDocumentMutation()
  const [quantityCapabilityGate, setQuantityCapabilityGate] = useState<QuantityLineCapabilityGate>({
    status: 'ready',
  })
  const [assetCapabilityGate, setAssetCapabilityGate] = useState<AssetLineCapabilityGate>({
    status: 'ready',
  })
  const form = useForm<OpeningDocumentFormValues>({
    resolver: zodResolver(openingDocumentFormSchema) as Resolver<OpeningDocumentFormValues>,
    defaultValues: DEFAULT_VALUES,
  })
  const capabilityGate = combineCapabilityGates(quantityCapabilityGate, assetCapabilityGate)
  const isCapabilityUnverified = capabilityGate.status !== 'ready'
  const isSaving = form.formState.isSubmitting || createMutation.isPending
  const saveDisabled = isSaving || isCapabilityUnverified
  const submitErrorMessage =
    createMutation.error === null ? null : documentDraftMutationError(createMutation.error)
  const headerWarehouseId = useWatch({ control: form.control, name: 'header.warehouseId' })
  const onQuantityCapabilityGateChange = useCallback((nextGate: QuantityLineCapabilityGate) => {
    setQuantityCapabilityGate((currentGate) =>
      retainEquivalentCapabilityGate(currentGate, nextGate),
    )
  }, [])
  const onAssetCapabilityGateChange = useCallback((nextGate: AssetLineCapabilityGate) => {
    setAssetCapabilityGate((currentGate) => retainEquivalentCapabilityGate(currentGate, nextGate))
  }, [])

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (capabilityGate.status !== 'ready') {
      return
    }
    const { assetLines, lines } = form.getValues()
    if (lines.length + assetLines.length === 0) {
      void form.trigger().then(() => {
        form.setError('lines', { type: 'manual', message: 'أضف بنداً واحداً على الأقل.' })
      })
      return
    }
    form.clearErrors('lines')
    void form.handleSubmit((values) => {
      const draft = buildDraftRequest<'Opening'>({
        documentType: 'Opening',
        header: values.header,
        lines: [...toDocumentLineInputs(values.lines), ...toAssetLineInputs(values.assetLines)],
        petals: {},
        rowVersion: 0,
      })
      createMutation.mutate(draft, {
        onSuccess: (document) => {
          navigate(ROUTE_PATHS.documentOpeningDetail.replace(':documentId', document.documentId))
        },
      })
    })(event)
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.documentOpeningNew.labelAr}
        subtitle="سجّل بنود الرصيد الافتتاحي في مستودعك ضمن مسودة المستند الورقي."
      />
      <FormProvider {...form}>
        <form
          data-slot="opening-document-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          <DocumentHeaderSection documentType="Opening" disabled={isSaving} />
          <section
            data-slot="opening-policy-notice"
            aria-labelledby="opening-policy-notice-title"
            className="grid gap-1 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
          >
            <h2 id="opening-policy-notice-title" className="font-medium text-foreground">
              سياسة الرصيد الافتتاحي
            </h2>
            <p className="text-muted-foreground">
              الرصيد الافتتاحي إجراء تهيئة لمرة واحدة وليس مستنداً دورياً. يعرض النظام نتيجة التحقق
              المعتمدة عند حفظ المسودة أو متابعة دورة المستند.
            </p>
          </section>
          <section
            data-slot="opening-lines-section"
            aria-label="بنود الرصيد الافتتاحي"
            className="grid gap-3 rounded-md border border-border p-4"
          >
            <h2 className="text-sm font-medium text-foreground">بنود الرصيد الافتتاحي</h2>
            <QuantityLineEditor
              documentType="Opening"
              warehouseId={headerWarehouseId || undefined}
              disabled={isSaving}
              onCapabilityGateChange={onQuantityCapabilityGateChange}
            />
            <h3 className="border-t border-border pt-3 text-sm font-medium text-foreground">
              بنود الأصول (أصل ثابت لكل وحدة)
            </h3>
            <AssetLineEditor
              documentType="Opening"
              warehouseId={headerWarehouseId || undefined}
              disabled={isSaving}
              namePrefix="assetLines"
              onCapabilityGateChange={onAssetCapabilityGateChange}
            />
          </section>
          {capabilityGate.status !== 'ready' ? (
            <p
              role={capabilityGate.status === 'blocked' ? 'alert' : 'status'}
              aria-live="polite"
              className={
                capabilityGate.status === 'blocked'
                  ? 'text-sm text-destructive'
                  : 'text-sm text-muted-foreground'
              }
            >
              {capabilityGate.messageAr}
            </p>
          ) : null}
          {submitErrorMessage !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {submitErrorMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saveDisabled} className="min-w-36">
              {isSaving ? 'جارٍ الحفظ...' : 'حفظ المسودة'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={() => navigate(ROUTE_PATHS.documentOpening)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
