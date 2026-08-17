import type { ReactNode } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/shared/forms/form'
import type { OptionLoader } from '@/shared/selectors/selector-adapter'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Badge } from '@/shared/ui/badge'
import { Input } from '@/shared/ui/input'
import type {
  DocumentLineInput,
  DocumentType,
  IssueTo,
  ReceivingInfo,
  ReturnInfo,
  TransferInfo,
  Warehouse,
  WarehouseDocumentDraftRequest,
} from '@/shared/types/generated/eiams-v1'

// The section is a component file by contract; the schema, labels, and draft
// mapper it ships are deliberately co-located so domain modules import one unit.
/* eslint-disable react-refresh/only-export-components */

/** Arabic label of every contract document type. */
export const DOCUMENT_TYPE_LABELS_AR: Readonly<Record<DocumentType, string>> = {
  Receiving: 'إيصال استلام',
  Issue: 'سند صرف',
  Transfer: 'إشعار تحويل',
  Adjustment: 'جرد تسوية',
  Opening: 'رصيد افتتاحي',
  Return: 'سند إرجاع',
}

/** Current calendar year, the anchor of the paper-year validity range. */
const CURRENT_YEAR = new Date().getFullYear()

/** Earliest accepted paper year (current year - 50). */
export const PAPER_DOCUMENT_YEAR_MIN = CURRENT_YEAR - 50

/** Latest accepted paper year (current year + 1). */
export const PAPER_DOCUMENT_YEAR_MAX = CURRENT_YEAR + 1

/** `2024/000123`-style paper number: 1-4 digits, optional `/` + 1-10 digits. */
export const PAPER_DOCUMENT_NUMBER_PATTERN = /^\d{1,4}(?:\/\d{1,10})?$/

const PAPER_DOCUMENT_NUMBER_MAX_LENGTH = 15

/**
 * Spine fields every warehouse document carries. Values mirror the
 * `WarehouseDocumentDraftRequest` keys so the page can map them 1:1.
 */
export const documentHeaderSchema = z.object({
  warehouseId: z.uuid('يجب اختيار مستودع صالح من القائمة.'),
  paperDocumentNumber: z
    .string()
    .trim()
    .min(1, 'رقم المستند الورقي مطلوب.')
    .max(
      PAPER_DOCUMENT_NUMBER_MAX_LENGTH,
      `يجب ألا يتجاوز رقم المستند الورقي ${PAPER_DOCUMENT_NUMBER_MAX_LENGTH} محرفاً.`,
    )
    .regex(
      PAPER_DOCUMENT_NUMBER_PATTERN,
      'صيغة غير صحيحة؛ استخدم أرقاماً إنجليزية فقط مثل 2024/000123.',
    ),
  paperDocumentYear: z
    .number('يجب إدخال سنة صحيحة.')
    .int('يجب إدخال سنة صحيحة.')
    .min(PAPER_DOCUMENT_YEAR_MIN, `يجب ألا تقل السنة الورقية عن ${PAPER_DOCUMENT_YEAR_MIN}.`)
    .max(PAPER_DOCUMENT_YEAR_MAX, `يجب ألا تتجاوز السنة الورقية ${PAPER_DOCUMENT_YEAR_MAX}.`),
})

export type DocumentHeaderValues = z.infer<typeof documentHeaderSchema>

/**
 * The `header.*` RHF group this section reads and writes. Pages compose the
 * spine group into their own wider form values (header + lines + petal
 * fields); the section registers only the three `header.` names below.
 */
export interface DocumentHeaderContainer {
  header: DocumentHeaderValues
}

/** Page-owned informational values shown on the non-editable meta row. */
export interface DocumentHeaderInitialValues {
  /** Author display name; the meta row shows it only while provided. */
  createdByDisplayName?: string
  /** Optimistic-concurrency version; the meta row shows «الإصدار: N». */
  rowVersion?: number
  /** Warehouse display name for read-only text rows (no extra fetching). */
  warehouseDisplayName?: string
}

export interface DocumentHeaderSectionProps {
  documentType: DocumentType
  /** Type-specific extension rendered below the spine group. */
  petalSlot?: ReactNode
  /** Disables every editable control; the controls stay registered. */
  disabled?: boolean
  /** Renders information text rows instead of inputs and registers nothing. */
  readOnly?: boolean
  initialValues?: DocumentHeaderInitialValues
}

const HEADER_VALUE_NAMES = [
  'header.warehouseId',
  'header.paperDocumentNumber',
  'header.paperDocumentYear',
] as const

const NO_PETAL_DOCUMENT_TYPES: ReadonlySet<DocumentType> = new Set<DocumentType>([
  'Adjustment',
  'Opening',
])

type DocumentPetalMap = {
  Issue: { issueTo: IssueTo }
  Receiving: { receivingInfo: ReceivingInfo }
  Transfer: { transferInfo: TransferInfo }
  Return: { returnInfo: ReturnInfo }
  Opening: Record<string, never>
  Adjustment: Record<string, never>
}

/** Per-document-type petal inputs required to build a draft request. */
export type DocumentPetals<T extends DocumentType = DocumentType> = DocumentPetalMap[T]

export interface BuildDraftRequestArgs<T extends DocumentType> {
  documentType: T
  header: DocumentHeaderValues
  lines: readonly DocumentLineInput[]
  petals: DocumentPetals<T>
  rowVersion: number
}

interface WarehouseSelectorControlProps {
  loadOptions: OptionLoader<Warehouse>
  scopeReady: boolean
  disabled: boolean
  value: string
  onValueChange: (value: string) => void
}

/**
 * AsyncSelect wiring the shared FormItem owns: the combobox inputs a raw id and
 * aria attributes itself, so the control wires them from `useFormField()`
 * instead of going through FormControl's cloneElement.
 */
function WarehouseSelectorControl({
  loadOptions,
  scopeReady,
  disabled,
  value,
  onValueChange,
}: WarehouseSelectorControlProps) {
  const { error, formDescriptionId, formItemId, formMessageId, required } = useFormField()
  return (
    <AsyncSelect<Warehouse>
      value={value === '' ? null : value}
      loadOptions={loadOptions}
      onValueChange={(nextValue) => onValueChange(nextValue ?? '')}
      disabled={disabled || !scopeReady}
      inputProps={{
        id: formItemId,
        'aria-invalid': error ? true : undefined,
        'aria-required': required || undefined,
        'aria-describedby':
          [formDescriptionId, error ? formMessageId : ''].filter(Boolean).join(' ') || undefined,
      }}
      placeholder={scopeReady ? 'ابحث عن مستودع ضمن نطاقك...' : 'بانتظار اختيار النطاق...'}
      emptyMessage="لا توجد مستودعات نشطة مطابقة ضمن نطاقك."
      errorMessage="تعذر البحث عن المستودعات ضمن نطاقك."
    />
  )
}

function MetaRow({
  documentType,
  initialValues,
}: {
  documentType: DocumentType
  initialValues: DocumentHeaderInitialValues
}) {
  return (
    <dl
      data-slot="document-header-meta"
      className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <dt className="text-muted-foreground">نوع المستند</dt>
        <dd className="font-medium text-foreground">{DOCUMENT_TYPE_LABELS_AR[documentType]}</dd>
      </div>
      {initialValues.createdByDisplayName !== undefined ? (
        <div className="flex items-center gap-2">
          <dt className="text-muted-foreground">أنشأها</dt>
          <dd className="font-medium text-foreground">{initialValues.createdByDisplayName}</dd>
        </div>
      ) : null}
      {initialValues.rowVersion !== undefined ? (
        <div className="flex items-center gap-2">
          <dt className="sr-only">النسخة</dt>
          <dd>
            <Badge variant="outline" data-slot="row-version-badge">
              الإصدار: {initialValues.rowVersion}
            </Badge>
          </dd>
        </div>
      ) : null}
    </dl>
  )
}

function SpineInfoValues({
  warehouseDisplayName,
  values,
}: {
  warehouseDisplayName: string | undefined
  values: Record<(typeof HEADER_VALUE_NAMES)[number], string | number | undefined>
}) {
  const warehouseId = values['header.warehouseId']
  const paperDocumentNumber = values['header.paperDocumentNumber']
  const paperDocumentYear = values['header.paperDocumentYear']
  return (
    <dl
      data-slot="document-header-values"
      className="grid gap-5 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-3"
    >
      <div className="flex flex-col gap-1">
        <dt className="text-sm text-muted-foreground">المستودع</dt>
        <dd className="text-sm font-medium text-foreground">
          {warehouseDisplayName ??
            (warehouseId === undefined || warehouseId === '' ? '—' : warehouseId)}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-sm text-muted-foreground">رقم المستند الورقي</dt>
        <dd dir="ltr" className="text-start text-sm font-medium text-foreground">
          {typeof paperDocumentNumber === 'string' && paperDocumentNumber !== ''
            ? paperDocumentNumber
            : '—'}
        </dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="text-sm text-muted-foreground">السنة الورقية</dt>
        <dd className="text-sm font-medium text-foreground">
          {typeof paperDocumentYear === 'number' ? String(paperDocumentYear) : '—'}
        </dd>
      </div>
    </dl>
  )
}

/**
 * Shared spine section of the document engine: the source warehouse plus the
 * paper document number/year every `WarehouseDocumentDraftRequest` carries,
 * with a render slot for the type-specific petal (ReceivingInfo / IssueTo /
 * TransferInfo / ReturnInfo) owned by the domain modules.
 *
 * RHF contract: the section reads and writes the page's form context through
 * the `header.` name prefix (`header.warehouseId`, `header.paperDocumentNumber`,
 * `header.paperDocumentYear`), mirroring the request's top-level keys. Pages
 * compose `documentHeaderSchema` into their resolver and keep their form
 * values structurally compatible with {@link DocumentHeaderContainer}, then
 * flatten header + lines + petals through `buildDraftRequest`.
 *
 * The section performs no data fetching (beyond the scope-aware warehouse
 * selector), no mutations, and no navigation; the page owns loading,
 * submission, references, and the petal editors. In `readOnly` mode the
 * section renders plain text rows and registers no fields, so the page must
 * validate any read-only submission path itself.
 */
export function DocumentHeaderSection({
  documentType,
  petalSlot,
  disabled = false,
  readOnly = false,
  initialValues = {},
}: DocumentHeaderSectionProps) {
  const form = useFormContext<DocumentHeaderContainer>()
  const selector = useScopedWarehouseSelector()
  const headerValues = useWatch({
    control: form.control,
    name: HEADER_VALUE_NAMES,
  })
  const headerValuesByName = Object.fromEntries(
    HEADER_VALUE_NAMES.map((name, index) => [name, headerValues[index]]),
  ) as Record<(typeof HEADER_VALUE_NAMES)[number], string | number | undefined>

  return (
    <section
      data-slot="document-header-section"
      aria-label="بيانات المستند الأساسية"
      className="grid gap-5"
    >
      <MetaRow documentType={documentType} initialValues={initialValues} />
      {readOnly ? (
        <SpineInfoValues
          warehouseDisplayName={initialValues.warehouseDisplayName}
          values={headerValuesByName}
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-3">
          <FormField
            control={form.control}
            name="header.warehouseId"
            rules={{ required: true }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>المستودع</FormLabel>
                <WarehouseSelectorControl
                  loadOptions={selector.loadOptions}
                  scopeReady={selector.scopeReady}
                  disabled={disabled}
                  value={field.value}
                  onValueChange={field.onChange}
                />
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="header.paperDocumentNumber"
            rules={{ required: true }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>رقم المستند الورقي</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    dir="ltr"
                    disabled={disabled}
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
            name="header.paperDocumentYear"
            rules={{ required: true }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>السنة الورقية</FormLabel>
                <FormControl>
                  <Input
                    dir="ltr"
                    inputMode="numeric"
                    disabled={disabled}
                    maxLength={4}
                    placeholder={`مثال: ${CURRENT_YEAR}`}
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
        </div>
      )}
      {NO_PETAL_DOCUMENT_TYPES.has(documentType) ? (
        <p
          data-slot="no-petal-note"
          role="note"
          className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
        >
          لا تتطلب هذه الوثيقة بيانات إضافية في هذا القسم؛ تُدار بياناتها النوعية ضمن وحدتها الخاصة.
        </p>
      ) : petalSlot === undefined ? null : (
        <div data-slot="document-petal-slot">{petalSlot}</div>
      )}
    </section>
  )
}

type PetalRequestPatch = Partial<
  Pick<WarehouseDocumentDraftRequest, 'issueTo' | 'receivingInfo' | 'transferInfo' | 'returnInfo'>
>

/**
 * Maps one document type to its petal request patch; types without a petal
 * (Opening / Adjustment) contribute nothing. Petals spread onto the spine in
 * `buildDraftRequest`.
 */
const PETAL_REQUEST_BY_TYPE: {
  [T in DocumentType]: (petals: DocumentPetals<T>) => PetalRequestPatch
} = {
  Issue: (petals) => ({ issueTo: petals.issueTo }),
  Receiving: (petals) => ({ receivingInfo: petals.receivingInfo }),
  Transfer: (petals) => ({ transferInfo: petals.transferInfo }),
  Return: (petals) => ({ returnInfo: petals.returnInfo }),
  Opening: () => ({}),
  Adjustment: () => ({}),
}

function documentPetalFor<T extends DocumentType>(
  documentType: T,
  petals: DocumentPetals<T>,
): PetalRequestPatch {
  return PETAL_REQUEST_BY_TYPE[documentType](petals)
}

/**
 * Builds a contract-typed `WarehouseDocumentDraftRequest` from the spine
 * header values, the page's lines, and the type-matched petal. `lines` and
 * `rowVersion` pass through untouched.
 */
export function buildDraftRequest<T extends DocumentType>({
  documentType,
  header,
  lines,
  petals,
  rowVersion,
}: BuildDraftRequestArgs<T>): WarehouseDocumentDraftRequest {
  return {
    documentType,
    warehouseId: header.warehouseId,
    paperDocumentNumber: header.paperDocumentNumber,
    paperDocumentYear: header.paperDocumentYear,
    lines,
    rowVersion,
    ...documentPetalFor(documentType, petals),
  }
}
