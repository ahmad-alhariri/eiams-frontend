import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useState, type FormEvent } from 'react'
import type { DeepPartial, Resolver } from 'react-hook-form'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import {
  blocksNewOpeningDocument,
  openingInitializationBlockMessageAr,
} from '@/modules/opening/opening-initialization'
import {
  AssetLineEditor,
  type AssetLineCapabilityGate,
} from '@/shared/documents/components/asset-line-editor'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { WarehouseInitializationBadge } from '@/modules/warehouse/components/warehouse-initialization-badge'
import { useWarehouseInitializationStateQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'
import {
  QuantityLineEditor,
  type QuantityLineCapabilityGate,
} from '@/shared/documents/components/quantity-line-editor'
import {
  buildCompleteDraftRequest,
  DocumentHeaderSection,
  documentHeaderSchema,
} from '@/shared/documents/document-header-form'
import {
  assetLineSchema,
  createEmptyQuantityLine,
  linesHaveUniqueMaterials,
  quantityLineSchema,
  toCompleteDraftAssetLines,
  toCompleteDraftLines,
} from '@/shared/documents/schemas/document-lines.schemas'
import {
  documentDraftMutationError,
  useCompleteDraftMutation,
} from '@/shared/documents/use-document-draft-mutations'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'

/**
 * Opening drafts are a `WarehouseDocument` spine with the `Opening` type;
 * they have neither a type-specific petal nor an opening-specific transport.
 * Asset identifiers are captured by the shared AssetLineEditor beside the
 * quantity-only lines; both map into the one contract `lines` payload.
 */
// D-OPEN-02 (PRD §6.3, §6.6, §6.10): the Opening form only ever posts `Initial`
// lines (Correction is superseded and rejected server-side) and every line
// must carry a strictly positive base quantity. The local schema tightens
// the shared `quantityLineSchema`; the shared schema stays as-is for
// Receiving/Issue/Transfer.
const openingQuantityLineSchema = quantityLineSchema.extend({
  baseQuantity: z
    .number()
    .refine((value) => Number.isFinite(value) && value > 0, {
      message: 'يجب أن تكون الكمية أكبر من صفر.',
    })
    .optional(),
})

const openingDocumentFormSchema = z.object({
  header: documentHeaderSchema.extend({
    // PRD §6.4 / D-OPEN-02: the cut-off date the inventory represents.
    openingAsOfDate: z.string().min(1, 'تاريخ الرصيد الافتتاحي مطلوب.'),
  }),
  lines: z.array(openingQuantityLineSchema).refine(linesHaveUniqueMaterials, {
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
    openingAsOfDate: '',
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
 * New opening-balance draft page (D-OPEN-02). It composes only the contract
 * spine, the shared quantity-line editor, and the shared AssetLineEditor.
 *
 * The form enforces the D-OPEN-02 invariants the backend requires:
 *  - `header.openingAsOfDate` is mandatory (PRD §6.4).
 *  - Every quantity line carries a strictly positive `baseQuantity` (PRD §6.6).
 *  - The `openingType` per line is fixed to `Initial`; `Correction` is
 *    superseded and rejected server-side (CONFLICT-104 / PRD §6.3).
 *  - The per-line capability gate is shown as a chip when a material's
 *    domain is not granted the Opening operation (CONFLICT-106 / PRD §6.7).
 *
 * The PRD's one-time-initialisation rule and the warehouse-level eligibility
 * check are server-authoritative; this page surfaces the server's own
 * policy via the shared `useCompleteDraftMutation` error path.
 */
export default function OpeningDocumentFormPage() {
  const navigate = useNavigate()
  const createMutation = useCompleteDraftMutation()
  // activeScopeCacheKey is exposed by useActiveScopeContext below; the
  // initialization read hook uses it through its internal scope context.
  useActiveScopeContext()
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
  const submitErrorMessage =
    createMutation.error === null ? null : documentDraftMutationError(createMutation.error)
  const headerWarehouseId = useWatch({ control: form.control, name: 'header.warehouseId' })
  // D-OPEN-02: the per-warehouse initialization badge sits above the form so the
  // user knows whether the warehouse is already initialized before they fill
  // out the form. The query is 30 s stale (operational data) and is
  // invalidated on a successful post via the mutation's onSuccess below.
  const initializationQuery = useWarehouseInitializationStateQuery(
    headerWarehouseId !== undefined && headerWarehouseId !== '' ? headerWarehouseId : undefined,
  )
  // The badge reports the state; this decides whether the action is allowed.
  // Keeping the two apart is deliberate — the badge is presentation, the gate
  // is the rule, and they must not drift into disagreeing.
  const initializationStatus = initializationQuery.data?.status
  const isAlreadyInitialized = blocksNewOpeningDocument(initializationStatus)
  const initializationBlockMessageAr = openingInitializationBlockMessageAr(initializationStatus)
  const saveDisabled = isSaving || isCapabilityUnverified || isAlreadyInitialized
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
    // Defence in depth: `saveDisabled` already hides the button, but a
    // disabled attribute is not a boundary. Enter-key submission and any
    // future call site must hit the same rule.
    if (isAlreadyInitialized) {
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
      const request = buildCompleteDraftRequest<'Opening'>({
        documentType: 'Opening',
        header: values.header,
        lines: [
          ...toCompleteDraftLines(values.lines),
          ...toCompleteDraftAssetLines(values.assetLines),
        ],
        // D-OPEN-02 (PRD §6.4): the cut-off date must ride the create itself —
        // the database CHECK rule rejects an Opening row without it at INSERT,
        // and no separate endpoint exists to fix an Opening draft up afterwards.
        petals: { openingAsOfDate: values.header.openingAsOfDate },
      })
      createMutation.mutate(
        {
          request,
          paperReference: {
            paperDocumentNumber: values.header.paperDocumentNumber,
            paperDocumentYear: values.header.paperDocumentYear,
          },
        },
        {
          onSuccess: (document) => {
            // D-OPEN-02: the next mount of the badge's consumer (detail
            // page) re-reads the initialization state; navigation is enough.
            navigate(ROUTE_PATHS.documentOpeningDetail.replace(':documentId', document.id))
          },
        },
      )
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="opening-policy-notice-title" className="font-medium text-foreground">
                سياسة الرصيد الافتتاحي
              </h2>
              <WarehouseInitializationBadge
                status={initializationQuery.data?.status}
                asOfDate={initializationQuery.data?.asOfDate}
              />
            </div>
            <p className="text-muted-foreground">
              الرصيد الافتتاحي إجراء تهيئة لمرة واحدة وليس مستنداً دورياً. يعرض النظام نتيجة التحقق
              المعتمدة عند حفظ المسودة أو متابعة دورة المستند.
            </p>
          </section>
          <FormField
            control={form.control}
            name="header.openingAsOfDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>تاريخ الرصيد الافتتاحي</FormLabel>
                <FormControl>
                  <input
                    type="date"
                    dir="ltr"
                    disabled={isSaving}
                    data-slot="opening-as-of-date"
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                    value={field.value ?? ''}
                    onChange={(event) => field.onChange(event.target.value)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  تاريخ القياس الفعلي للرصيد — مستقل عن تاريخ النشر.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
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
            <div
              data-slot="opening-capability-notice"
              role={capabilityGate.status === 'blocked' ? 'alert' : 'status'}
              aria-live="polite"
              className={
                capabilityGate.status === 'blocked'
                  ? 'rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive'
                  : 'rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground'
              }
            >
              <p>{capabilityGate.messageAr}</p>
              {capabilityGate.reason === 'opening_capability_not_granted' ? (
                <p className="mt-1 text-xs">
                  <a href={ROUTE_PATHS.warehouses ?? '#'} className="underline">
                    إدارة المستودعات
                  </a>{' '}
                  لمنح قدرة "الفتح" لهذا المجال.
                </p>
              ) : null}
            </div>
          ) : null}
          {initializationBlockMessageAr !== null ? (
            <div
              data-slot="opening-initialization-blocked"
              role="status"
              aria-live="polite"
              className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground"
            >
              <p>{initializationBlockMessageAr}</p>
            </div>
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
