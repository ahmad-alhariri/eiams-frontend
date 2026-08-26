import { zodResolver } from '@hookform/resolvers/zod'
import type { FormEvent } from 'react'
import type { DeepPartial, Resolver } from 'react-hook-form'
import { FormProvider, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { returnInfoFormSchema } from '@/modules/custody/schemas/return-info.schema'
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
import { Input } from '@/shared/ui/input'
import { Controller, useWatch } from 'react-hook-form'
import { z } from 'zod'

const returnDocumentFormSchema = z.object({
  header: documentHeaderSchema,
  petal: returnInfoFormSchema,
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
    originalIssueReference: '',
    returnReason: '',
  },
  lines: [createEmptyQuantityLine()],
}

/**
 * New Return draft page (e19-t06): mirrors the issue draft composition —
 * shared spine header, the ReturnInfo petal (original issue linkage +
 * reason), and the shared quantity-line editor. Submission flattens into a
 * `WarehouseDocumentDraftRequest` with `returnInfo` via `buildDraftRequest`.
 */
export default function ReturnDocumentFormPage() {
  const navigate = useNavigate()
  const createMutation = useCreateDocumentMutation()
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

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void form.handleSubmit((values) => {
      const draft = buildDraftRequest<'Return'>({
        documentType: 'Return',
        header: values.header,
        lines: toDocumentLineInputs(values.lines),
        petals: {
          returnInfo: {
            originalIssueDocumentId: values.petal.originalIssueDocumentId,
            ...(values.petal.originalIssueReference !== undefined &&
            values.petal.originalIssueReference !== ''
              ? { originalIssueReference: values.petal.originalIssueReference }
              : {}),
            returnReason: values.petal.returnReason,
          },
        },
        rowVersion: 0,
      })
      createMutation.mutate(draft, {
        onSuccess: (document) => {
          navigate(ROUTE_PATHS.documentReturnDetail.replace(':documentId', document.documentId))
        },
      })
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
                      <label htmlFor="original-issue-id" className="text-sm font-medium">
                        معرّف سند الصرف الأصلي
                      </label>
                      <Input
                        id="original-issue-id"
                        dir="ltr"
                        className="font-mono text-sm"
                        placeholder="00000000-0000-4000-8000-000000000000"
                        disabled={isSubmitting}
                        {...field}
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
                  name="petal.originalIssueReference"
                  render={({ field }) => (
                    <div className="grid gap-2">
                      <label htmlFor="original-issue-ref" className="text-sm font-medium">
                        رقم سند الصرف الورقي (اختياري)
                      </label>
                      <Input
                        id="original-issue-ref"
                        placeholder="ISSUE-2026-0001"
                        disabled={isSubmitting}
                        {...field}
                      />
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
                        maxLength={300}
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
