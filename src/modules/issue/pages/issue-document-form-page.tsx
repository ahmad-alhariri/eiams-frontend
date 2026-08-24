import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, type FormEvent } from 'react'
import type { DeepPartial, Resolver } from 'react-hook-form'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import {
  IssueRecipientSection,
  issuePetalFormSchema,
} from '@/modules/issue/components/issue-recipient-section'
import { IssueResponsibilityPreview } from '@/modules/issue/components/issue-responsibility-preview'
import { useIssueLineBalances } from '@/modules/issue/hooks/use-issue-line-balances'
import { toIssueInfo } from '@/modules/issue/schemas/issue-info.schema'
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
 * lives under `header.*`, the IssueTo petal under `petal.issueTo.*` (with its
 * selection-time display-name sibling `petal.issueToDisplayName`, e16-t03),
 * and the quantity lines under `lines.*`.
 *
 * Issue carries no asset-capture container: Asset-kind lines on an issue move
 * existing assets, and the specific-asset reference is pending a contract
 * decision (bead eiams-frontend-9h27), so only quantity lines compose here.
 *
 * Live balance guards (e16-t04): every selected line's material is looked up
 * in the source warehouse via `useIssueLineBalances`; known balances render a
 * per-line hint through the editor seam, and any over-balance line blocks
 * persistence with an Arabic message before the request fires.
 */
const issueDocumentFormSchema = z.object({
  header: documentHeaderSchema,
  petal: issuePetalFormSchema.shape.petal,
  lines: z.array(quantityLineSchema).refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  }),
})

export type IssueDocumentFormValues = z.infer<typeof issueDocumentFormSchema>

const DEFAULT_VALUES: DeepPartial<IssueDocumentFormValues> = {
  header: {
    warehouseId: '',
    paperDocumentNumber: '',
  },
  petal: {
    issueTo: {
      recipientType: '',
      recipientId: '',
      issueReason: '',
    } as unknown as IssueDocumentFormValues['petal']['issueTo'],
    issueToDisplayName: '',
  },
  lines: [createEmptyQuantityLine()],
}

/** Stable fallback so the useWatch result never invalidates the memos below. */
const EMPTY_LINES: IssueDocumentFormValues['lines'] = []

/**
 * New issue draft page (epic e16, bead eiams-frontend-1mg5): composes the
 * contract spine (source warehouse + paper number/year), the polymorphic
 * IssueTo recipient section with the responsibility preview, and the shared
 * quantity-line editor wired to live warehouse balances. Submission flattens
 * everything into a `WarehouseDocumentDraftRequest` via `buildDraftRequest` —
 * the recipient display name captured at selection time rides along so drafts
 * reload with a readable recipient.
 */
export default function IssueDocumentFormPage() {
  const navigate = useNavigate()
  const createMutation = useCreateDocumentMutation()
  const form = useForm<IssueDocumentFormValues>({
    resolver: zodResolver(issueDocumentFormSchema) as Resolver<IssueDocumentFormValues>,
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
        return `الكمية المطلوبة في البند ${index + 1} تتجاوز الرصيد المتاح (${available}).`
      }
    }
    return null
  }, [balanceByMaterialId, materialIds, quantities])

  const saveDisabled = isSubmitting || balancesLoading || overBalanceMessageAr !== null

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    form.clearErrors('lines')
    void form.handleSubmit((values) => {
      const draft = buildDraftRequest<'Issue'>({
        documentType: 'Issue',
        header: values.header,
        lines: toDocumentLineInputs(values.lines),
        petals: {
          issueTo: toIssueInfo(values.petal.issueTo, values.petal.issueToDisplayName),
        },
        rowVersion: 0,
      })
      createMutation.mutate(draft, {
        onSuccess: (document) => {
          navigate(ROUTE_PATHS.documentIssueDetail.replace(':documentId', document.documentId))
        },
      })
    })(event)
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.documentIssueNew.labelAr}
        subtitle="أنشئ سند صرف جديدًا: بيانات المستند الورقي، الجهة المستلمة وسبب الصرف، ثم بنود المواد مع التحقق من الرصيد المتاح."
      />
      <FormProvider {...form}>
        <form
          data-slot="issue-document-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          <DocumentHeaderSection
            documentType="Issue"
            petalSlot={
              <div className="grid gap-3">
                <IssueRecipientSection disabled={isSubmitting} />
                <IssueResponsibilityPreview />
              </div>
            }
            disabled={isSubmitting}
          />
          <section
            data-slot="issue-lines-section"
            aria-label="بنود الصرف"
            className="grid gap-3 rounded-md border border-border p-4"
          >
            <h2 className="text-sm font-medium text-foreground">بنود الصرف</h2>
            <QuantityLineEditor
              documentType="Issue"
              warehouseId={headerWarehouseId || undefined}
              disabled={isSubmitting}
              balanceForLine={(index) =>
                balanceByMaterialId.get(materialIds[index] ?? '')
              }
            />
          </section>
          {overBalanceMessageAr !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {overBalanceMessageAr}
            </p>
          ) : null}
          {balancesLoading ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              جارٍ التحقق من أرصدة المستودع للبنود المختارة...
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
              onClick={() => navigate(ROUTE_PATHS.documentIssue)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
