import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm, type Resolver } from 'react-hook-form'
import { z } from 'zod'

import { documentHeaderSchema } from '@/shared/documents/document-header-form'
import { useUpdatePaperReferenceMutation } from '@/shared/documents/use-document-paper-reference'
import type { WarehouseDocumentDetails } from '@/shared/documents/types/document-wire.types'
import { normalizeApiError } from '@/shared/services/api-error'
import { isConcurrencyConflict } from '@/shared/services/mutation-safety'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/forms/form'

const FALLBACK_SAVE_ERROR_AR = 'تعذّر حفظ رقم المستند الورقي.'

/** Matches the un-exported constant in document-header-form. */
const PAPER_DOCUMENT_NUMBER_MAX_LENGTH = 15

/**
 * The paper pair alone — the warehouse of an existing draft is server-owned
 * and the paper reference is written by the dedicated `paper-reference` route,
 * so the full `documentHeaderSchema` is narrowed to exactly its two members.
 */
const draftPaperReferenceSchema = documentHeaderSchema.pick({
  paperDocumentNumber: true,
  paperDocumentYear: true,
})

type DraftPaperReferenceValues = Pick<
  z.infer<typeof documentHeaderSchema>,
  'paperDocumentNumber' | 'paperDocumentYear'
>

export interface DraftPaperReferenceEditorProps {
  documentId: string
  /** The server-loaded draft; `rowVersion` guards the write and the paper pair pre-fills the form. */
  document: WarehouseDocumentDetails
  /** Conflict-recovery entry point of the routed detail page (D-LIFE-01). */
  onConflict: () => void
}

/**
 * Editable paper reference (number + year) for a DRAFT document, shown on the
 * shared detail page for every document type. It exists because a Draft can be
 * born server-side — e.g. a REVERSAL draft created by "عكس" — with no paper
 * reference at all, yet the Submit policy blocks until one is set:
 * `WarehouseDocuments.PaperReferenceRequired`. Without this editor that draft
 * was dead-ended.
 *
 * The save goes through the existing `updatePaperReference` transport with the
 * document's CURRENT `rowVersion` as `expectedRowVersion`; a conflict surfaces
 * both the inline Arabic feedback and the routed page's conflict-recovery
 * dialog. Non-Draft documents render nothing — outside the Draft mutable
 * window everything stays read-only (D-ATT-01).
 */
export function DraftPaperReferenceEditor({
  documentId,
  document,
  onConflict,
}: DraftPaperReferenceEditorProps) {
  const form = useForm<DraftPaperReferenceValues>({
    // The cast mirrors every page composing `documentHeaderSchema`: the
    // resolver is internally typed against the schema's input, while the form
    // values type is the stricter `z.infer` shape this component reads.
    resolver: zodResolver(draftPaperReferenceSchema) as Resolver<DraftPaperReferenceValues>,
    defaultValues: {
      paperDocumentNumber: document.paperDocumentNumber ?? '',
      // A reversal draft legitimately carries no paper reference yet; an
      // `undefined` key is what `exactOptionalPropertyTypes` requires
      // rather than an explicit null.
      ...(document.paperDocumentYear === null
        ? {}
        : { paperDocumentYear: document.paperDocumentYear }),
    },
  })
  const mutation = useUpdatePaperReferenceMutation(documentId)

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({
        paperDocumentNumber: values.paperDocumentNumber,
        paperDocumentYear: values.paperDocumentYear,
        expectedRowVersion: document.rowVersion,
      })
    } catch (error) {
      // Only a CONCURRENT-EDIT 409 means the routed page's reload is the answer;
      // a business 409 leaves nothing stale, so it goes to the inline copy alone.
      if (isConcurrencyConflict(error)) {
        onConflict()
      }
      // Governed Arabic copy from the normalized error; the generic fallback
      // only covers a network failure with no structured answer at all.
      const apiError = normalizeApiError(error)
      form.setError('root', {
        message: apiError.detailAr ?? (apiError.titleAr === '' ? FALLBACK_SAVE_ERROR_AR : apiError.titleAr),
      })
    }
  })

  if (document.documentStatus !== 'Draft') {
    return null
  }

  return (
    <div
      id="draft-paper-reference-editor"
      data-slot="draft-paper-reference-editor"
      className="rounded-lg border border-border bg-muted/20 p-4"
    >
      <p className="mb-3 text-sm text-muted-foreground">
        رقم المستند الورقي وسنته قابلان للتحرير لأن السند مسوّدة؛ عدّلهما ثم احفظ قبل الإرسال.
      </p>
      <FormProvider {...form}>
        <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-3">
          <FormField
            control={form.control}
            name="paperDocumentNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>رقم المستند الورقي</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    id="draft-paper-reference-number"
                    dir="ltr"
                    disabled={mutation.isPending}
                    maxLength={PAPER_DOCUMENT_NUMBER_MAX_LENGTH}
                    placeholder="مثال: 2024/000123"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="paperDocumentYear"
            render={({ field }) => (
              <FormItem>
                <FormLabel>السنة الورقية</FormLabel>
                <FormControl>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    disabled={mutation.isPending}
                    maxLength={4}
                    placeholder="مثال: 2026"
                    value={field.value === undefined ? '' : String(field.value)}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '').slice(0, 4)
                      field.onChange(digits === '' ? undefined : Number(digits))
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex items-end">
            <Button
              type="submit"
              loading={mutation.isPending}
              disabled={mutation.isPending}
            >
              حفظ الرقم الورقي
            </Button>
          </div>
        </form>
        {form.formState.errors.root === undefined ? null : (
          <p role="alert" className="mt-3 text-sm font-medium text-destructive">
            {form.formState.errors.root.message}
          </p>
        )}
      </FormProvider>
    </div>
  )
}
