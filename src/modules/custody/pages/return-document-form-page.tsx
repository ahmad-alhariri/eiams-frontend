import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, type FormEvent } from 'react'
import type { DeepPartial, Resolver } from 'react-hook-form'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { Controller } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'

import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { ReturnLineAssetSelector } from '@/modules/custody/components/return-line-asset-selector'
import { ReturnOriginalIssueSelector } from '@/modules/custody/components/return-original-issue-selector'
import {
  RETURN_REASON_MAX_LENGTH,
  returnInfoFormSchema,
} from '@/modules/custody/schemas/return-info.schema'
import { QuantityLineEditor } from '@/shared/documents/components/quantity-line-editor'
import {
  buildCompleteDraftRequest,
  DocumentHeaderSection,
  documentHeaderSchema,
} from '@/shared/documents/document-header-form'
import {
  createEmptyQuantityLine,
  linesHaveUniqueMaterials,
  quantityLineSchema,
  toCompleteDraftLines,
} from '@/shared/documents/schemas/document-lines.schemas'
import {
  documentDraftMutationError,
  useCompleteDraftMutation,
} from '@/shared/documents/use-document-draft-mutations'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const returnDocumentFormSchema = z.object({
  header: documentHeaderSchema,
  // FIX-R6: `originalIssueWarehouseId` travels in the same RHF subtree as
  // `originalIssueDocumentId`, written by the picker in one callback, so the
  // wrong-warehouse guard and the value the submit reads cannot drift apart.
  // It is UI-only — never sent to the server — and therefore is NOT part of
  // `returnInfoFormSchema` (which is the wire-shape projection).
  petal: returnInfoFormSchema.extend({
    originalIssueWarehouseId: z.string(),
  }),
  lines: z.array(quantityLineSchema).refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  }),
})

type ReturnDocumentFormValues = z.infer<typeof returnDocumentFormSchema>

const DEFAULT_VALUES: DeepPartial<ReturnDocumentFormValues> = {
  header: {
    warehouseId: '',
    paperDocumentNumber: '',
  },
  petal: {
    originalIssueDocumentId: '',
    originalIssueWarehouseId: '',
    returnReason: '',
  },
  lines: [createEmptyQuantityLine()],
}

/** Stable fallback so the useWatch result never invalidates the memo below. */
const EMPTY_LINES: ReturnDocumentFormValues['lines'] = []

/**
 * New Return draft page (e19-t06): mirrors the issue draft composition —
 * shared spine header, the ReturnInfo petal (original issue linkage +
 * reason), and the shared quantity-line editor. Submission flattens into a
 * `CompleteDraftRequest` with `returnInfo` via `buildCompleteDraftRequest`.
 *
 * FIX-R3: the original issue is chosen from server-provided POSTED Issue
 * documents, never typed as a raw uuid. A wrong-warehouse issue stays
 * selectable (so the mismatch is observable), but the page mirrors the
 * server's `WrongWarehouse` check client-side and blocks the save.
 *
 * FIX-R6: the picked issue's `warehouseId` is written into an RHF field in
 * the same callback as `originalIssueDocumentId`, so guard and submit read
 * the SAME source; the submit handler also early-returns on guard violations
 * so an implicit (Enter) or programmatic submit cannot bypass them.
 *
 * FIX-R2: the editor opts into Asset-kind materials and renders the per-line
 * eligible-asset picker; a line's selected asset ids travel on the wire
 * (`toCompleteDraftLines` already emits `assetIds` for Asset-kind lines).
 */
export default function ReturnDocumentFormPage() {
  const navigate = useNavigate()
  const createMutation = useCompleteDraftMutation()
  const form = useForm<ReturnDocumentFormValues>({
    resolver: zodResolver(returnDocumentFormSchema) as Resolver<ReturnDocumentFormValues>,
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  })
  const isSubmitting = form.formState.isSubmitting
  const submitErrorMessage =
    createMutation.error === null ? null : documentDraftMutationError(createMutation.error)
  const headerWarehouseId = useWatch({ control: form.control, name: 'header.warehouseId' })
  const petalErrors = form.formState.errors.petal ?? {}

  const originalIssueDocumentId = useWatch({
    control: form.control,
    name: 'petal.originalIssueDocumentId',
  })
  const originalIssueWarehouseId = useWatch({
    control: form.control,
    name: 'petal.originalIssueWarehouseId',
  })
  const selectedIssueDocumentId =
    typeof originalIssueDocumentId === 'string' && originalIssueDocumentId !== ''
      ? originalIssueDocumentId
      : undefined

  const lines = useWatch({ control: form.control, name: 'lines' }) ?? EMPTY_LINES

  /**
   * The server's authoritative Return rules, mirrored client-side so the save
   * never fires against a request it must reject: an Asset-kind line's
   * quantity is a whole number and its selected-asset count equals that
   * quantity exactly (`decimal.Truncate(BaseQuantity) == BaseQuantity` and
   * `selectedCount == BaseQuantity` on the backend).
   */
  const assetLinesMessageAr = useMemo(() => {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      if (line?.materialKind !== 'Asset') continue
      const quantity = typeof line.quantity === 'number' ? line.quantity : 0
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return `البند ${index + 1}: يجب أن تكون كمية بند الأصل رقماً صحيحاً (وحدة لكل أصل).`
      }
      if ((line.assetIds ?? []).length !== quantity) {
        return `البند ${index + 1}: يجب أن يساوي عدد الأصول المحددة الكمية المطلوبة.`
      }
    }
    return null
  }, [lines])

  /**
   * Client-side mirror of the server's `WrongWarehouse` check (the server
   * stays authoritative): a non-blocking guard — it only applies once BOTH
   * the header warehouse and the original issue are chosen.
   *
   * FIX-R6: both the guard and the submit read `originalIssueWarehouseId`
   * from the SAME RHF field (written by the picker in the same callback that
   * writes the uuid), so they cannot drift apart.
   */
  const wrongWarehouseMessageAr =
    headerWarehouseId !== '' &&
    originalIssueWarehouseId !== '' &&
    headerWarehouseId !== originalIssueWarehouseId
      ? 'مستودع سند الإرجاع يجب أن يطابق مستودع سند الصرف الأصلي.'
      : null

  const saveDisabled =
    isSubmitting || wrongWarehouseMessageAr !== null || assetLinesMessageAr !== null

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // FIX-R6: the (disabled) save button guards against clicks, but an Enter
    // press inside a text field submits the form implicitly, and any
    // programmatic `form.submit()` bypasses the button. Block the mutation
    // in this handler so no path can leak the save through.
    if (wrongWarehouseMessageAr !== null || assetLinesMessageAr !== null) {
      return
    }
    void form.handleSubmit((values) => {
      const request = buildCompleteDraftRequest<'Return'>({
        documentType: 'Return',
        header: values.header,
        lines: toCompleteDraftLines(values.lines),
        petals: {
          // `ReturnDraftDetails` carries the original issue id and the reason
          // only; the paper reference lives on its own route. The picker-side
          // `originalIssueWarehouseId` is a UI-only mirror of the server's
          // `WrongWarehouse` check and never reaches the wire.
          returnInfo: {
            originalIssueDocumentId: values.petal.originalIssueDocumentId,
            returnReason: values.petal.returnReason,
          },
        },
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
            navigate(ROUTE_PATHS.documentReturnDetail.replace(':documentId', document.id))
          },
        },
      )
    })(event)
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.documentReturnNew.labelAr}
        subtitle="أنشئ سند إرجاع جديدًا: بيانات المستند الورقي، ربطه بسند الصرف الأصلي وسبب الإرجاع، ثم بنود المواد."
      />
      <FormProvider {...form}>
        <form
          data-slot="return-document-form"
          onSubmit={onSubmit}
          noValidate
          className="grid gap-5"
        >
          <DocumentHeaderSection
            documentType="Return"
            petalSlot={
              <section
                data-slot="return-petal-section"
                aria-label="بيانات الإرجاع"
                className="grid gap-3 rounded-md border border-border p-4"
              >
                <h2 className="text-sm font-medium text-foreground">بيانات الإرجاع</h2>
                <Controller
                  control={form.control}
                  name="petal.originalIssueDocumentId"
                  render={({ field }) => (
                    <div className="grid gap-2">
                      <label htmlFor="original-issue-document" className="text-sm font-medium">
                        سند الصرف الأصلي
                      </label>
                      {/* FIX-R3: options are the server's POSTED Issue documents
                          (searchable by paper number); never a free-text uuid. */}
                      <ReturnOriginalIssueSelector
                        value={field.value === '' ? null : field.value}
                        disabled={isSubmitting}
                        inputProps={{ id: 'original-issue-document' }}
                        onValueChange={(nextValue, option) => {
                          field.onChange(nextValue ?? '')
                          // FIX-R6: write the picked issue's warehouse id into
                          // the SAME RHF subtree as the uuid, so the guard and
                          // the submit cannot drift apart. Cleared together
                          // with the uuid when the user clears the picker.
                          form.setValue(
                            'petal.originalIssueWarehouseId',
                            option?.payload?.warehouseId ?? '',
                            { shouldDirty: true },
                          )
                        }}
                      />
                      {petalErrors.originalIssueDocumentId !== undefined ? (
                        <p role="alert" className="text-sm text-destructive">
                          {petalErrors.originalIssueDocumentId.message}
                        </p>
                      ) : null}
                    </div>
                  )}
                />
                <Controller
                  control={form.control}
                  name="petal.returnReason"
                  render={({ field }) => (
                    <div className="grid gap-2">
                      <label htmlFor="return-reason" className="text-sm font-medium">
                        سبب الإرجاع
                      </label>
                      <Input
                        id="return-reason"
                        maxLength={RETURN_REASON_MAX_LENGTH}
                        placeholder="سبب إرجاع المواد..."
                        disabled={isSubmitting}
                        {...field}
                      />
                      {petalErrors.returnReason !== undefined ? (
                        <p role="alert" className="text-sm text-destructive">
                          {petalErrors.returnReason.message}
                        </p>
                      ) : null}
                    </div>
                  )}
                />
              </section>
            }
          />

          <section
            data-slot="return-lines-section"
            aria-label="بنود الإرجاع"
            className="grid gap-3 rounded-md border border-border p-4"
          >
            <h2 className="text-sm font-medium text-foreground">بنود الإرجاع</h2>
            <QuantityLineEditor
              documentType="Return"
              warehouseId={headerWarehouseId || undefined}
              disabled={isSubmitting}
              includeAssetMaterials
              assetSlotForLine={(index) => (
                <ReturnLineAssetSelector
                  index={index}
                  originalIssueDocumentId={selectedIssueDocumentId}
                />
              )}
            />
          </section>

          {wrongWarehouseMessageAr !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {wrongWarehouseMessageAr}
            </p>
          ) : null}
          {assetLinesMessageAr !== null ? (
            <p role="alert" className="text-sm text-destructive">
              {assetLinesMessageAr}
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
              onClick={() => navigate(ROUTE_PATHS.documentReturn)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  )
}
