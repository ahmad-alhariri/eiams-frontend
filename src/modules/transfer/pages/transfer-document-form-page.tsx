import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, type FormEvent } from 'react'
import type { DeepPartial, Resolver } from 'react-hook-form'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { TransferDestinationSection } from '@/modules/transfer/components/transfer-destination-section'
import {
  buildTransferPetal,
  transferPetalFormSchema,
} from '@/modules/transfer/schemas/transfer-info.schema'
import { useIssueLineBalances } from '@/modules/issue/hooks/use-issue-line-balances'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { QuantityLineEditor } from '@/shared/documents/components/quantity-line-editor'
import {
  buildDraftRequest,
  DocumentHeaderSection,
  documentHeaderSchema,
} from '@/shared/documents/document-header-form'
import {
  createEmptyQuantityLine,
  linesHaveUniqueMaterials,
  quantityLineSchema,
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
 * lives under `header.*`, the TransferInfo petal under `petal.transferInfo`
 * (with its selection-time name sibling `petal.destinationWarehouseName`,
 * e17-t03), and the quantity lines under `lines.*`.
 *
 * Transfer material rules (e17-t04 / PRD §12.4): only consumable/durable
 * materials transfer in v1 — asset-kind lines are blocked with an Arabic
 * message (asset transfers go through Issue + Receiving). Outbound balance
 * ceiling: every line is checked against the source warehouse's live balance;
 * any over-balance line blocks persistence (atomic post would fail anyway).
 */
const transferDocumentFormSchema = z.object({
  header: documentHeaderSchema,
  petal: transferPetalFormSchema.shape.petal,
  lines: z.array(quantityLineSchema).refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  }),
})

export type TransferDocumentFormValues = z.infer<typeof transferDocumentFormSchema>

const DEFAULT_VALUES: DeepPartial<TransferDocumentFormValues> = {
  header: {
    warehouseId: '',
    paperDocumentNumber: '',
  },
  petal: {
    transferInfo: {
      destinationWarehouseId: '',
      transferReason: '',
    },
    destinationWarehouseName: '',
  },
  lines: [createEmptyQuantityLine()],
}

/** Stable fallback so the useWatch result never invalidates the memos below. */
const EMPTY_LINES: TransferDocumentFormValues['lines'] = []

/**
 * New transfer draft page (epic e17, beads e17-t04/t05/t06): composes the
 * contract spine (source warehouse + paper number/year), the TransferInfo
 * destination section, and the shared quantity-line editor wired to live
 * source-warehouse balances and the Transfer capability gate. Submission
 * flattens everything into a `WarehouseDocumentDraftRequest` via
 * `buildDraftRequest`.
 */
export default function TransferDocumentFormPage() {
  const navigate = useNavigate()
  const createMutation = useCreateDocumentMutation()
  const form = useForm<TransferDocumentFormValues>({
    resolver: zodResolver(transferDocumentFormSchema) as Resolver<TransferDocumentFormValues>,
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  })
  const isSubmitting = form.formState.isSubmitting
  const submitErrorMessage =
    createMutation.error === null ? null : documentDraftMutationError(createMutation.error)
  const headerWarehouseId = useWatch({ control: form.control, name: 'header.warehouseId' })
  const lines = useWatch({ control: form.control, name: 'lines' }) ?? EMPTY_LINES

  const materialIds = useMemo(() => lines.map((line) => line?.materialId ?? ''), [lines])
  const quantities = useMemo(() => lines.map((line) => line?.quantity ?? 0), [lines])
  const { balanceByMaterialId, isLoading: balancesLoading } = useIssueLineBalances(
    headerWarehouseId || undefined,
    materialIds,
  )

  /** First over-balance line, or null while every known balance covers its request. */
  const overBalanceMessageAr = useMemo(() => {
    for (let index = 0; index < materialIds.length; index += 1) {
      if ((materialIds[index] ?? '') === '') continue
      const balance = balanceByMaterialId.get(materialIds[index] ?? '')
      if (balance === undefined) continue // unknown/loading → never blocks
      const available = balance === null ? 0 : balance
      if ((quantities[index] ?? 0) > available) {
        return `الكمية المطلوبة في البند ${index + 1} تتجاوز الرصيد المتاح في المستودع المصدر (${available}).`
      }
    }
    return null
  }, [balanceByMaterialId, materialIds, quantities])

  /** PRD §12.4: asset-kind materials do not transfer in v1. */
  const assetKindMessageAr = useMemo(() => {
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index]?.materialKind !== 'Asset') continue
      return `البند ${index + 1}: لا يجوز تحويل الأصول في هذه النسخة؛ تُنقل الأصول عبر سند صرف واستلام.`
    }
    return null
  }, [lines])

  const saveDisabled =
    isSubmitting || balancesLoading || overBalanceMessageAr !== null || assetKindMessageAr !== null

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    form.clearErrors('lines')
    void form.handleSubmit((values) => {
      const draft = buildDraftRequest<'Transfer'>({
        documentType: 'Transfer',
        header: values.header,
        lines: toDocumentLineInputs(values.lines),
        petals: {
          transferInfo: buildTransferPetal(values.petal),
        },
        rowVersion: 0,
      })
      createMutation.mutate(draft, {
        onSuccess: (document) => {
          navigate(ROUTE_PATHS.documentTransferDetail.replace(':documentId', document.documentId))
        },
      })
    })(event)
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.documentTransferNew.labelAr}
        subtitle="أنشئ سند تحويل جديدًا: بيانات المستند الورقي، مستودع الوجهة وسبب التحويل، ثم بنود المواد مع التحقق من رصيد المستودع المصدر."
      />
      <FormProvider {...form}>
        <form
          data-slot="transfer-document-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          <DocumentHeaderSection
            documentType="Transfer"
            petalSlot={
              <TransferDestinationSection
                sourceWarehouseId={headerWarehouseId === '' ? undefined : headerWarehouseId}
                disabled={isSubmitting}
              />
            }
            disabled={isSubmitting}
          />
          <section
            data-slot="transfer-lines-section"
            aria-label="بنود التحويل"
            className="grid gap-3 rounded-md border border-border p-4"
          >
            <h2 className="text-sm font-medium text-foreground">بنود التحويل</h2>
            <QuantityLineEditor
              documentType="Transfer"
              warehouseId={headerWarehouseId || undefined}
              disabled={isSubmitting}
              balanceForLine={(index) => balanceByMaterialId.get(materialIds[index] ?? '')}
            />
          </section>
          {overBalanceMessageAr !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {overBalanceMessageAr}
            </p>
          ) : null}
          {assetKindMessageAr !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {assetKindMessageAr}
            </p>
          ) : null}
          {balancesLoading ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              جارٍ التحقق من أرصدة المستودع المصدر للبنود المختارة...
            </p>
          ) : null}
          {submitErrorMessage !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {submitErrorMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saveDisabled} className="min-w-36">
              {isSubmitting ? 'جارٍ الحفظ...' : 'حفظ المسودة'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => navigate(ROUTE_PATHS.documentTransfer)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
