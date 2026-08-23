import { z } from 'zod'

import type {
  AssetInput,
  DocumentLineInput,
  DocumentType,
  Material,
} from '@/shared/types/generated/eiams-v1'

/**
 * Document-line capture schemas and draft mappings for the shared document
 * engine. Two sibling editors own the `lines` FieldArray of a page-owned
 * React Hook Form, in separate containers:
 *
 * - Quantity lines (e12-t04): {@link quantityLineSchema} /
 *   {@link DocumentLinesContainer} / {@link toDocumentLineInputs}. Asset-kind
 *   materials are excluded and this schema never carries
 *   `assetInputs`/`trackedUnitInputs`.
 * - Asset lines (e12-t05): {@link assetLineSchema} /
 *   {@link AssetLinesContainer} / {@link toAssetLineInputs}. One asset input
 *   per unit, quantity derived from the unit count — D-MAT-01 fixed assets.
 *
 * Both editors read the page's form context through their own `lines` name
 * prefix; pages compose the two containers side by side and flatten them
 * through the matching mapper into `buildDraftRequest`.
 */

export type QuantityLineFeatures = {
  batchNumber?: boolean
  expiryDate?: boolean
  openingType?: boolean
  unitPrice?: boolean
}

/** Per-document-type feature presets from the PRD line tables. */
export const QUANTITY_LINE_FEATURES_BY_TYPE: Readonly<
  Record<Exclude<DocumentType, 'Adjustment'>, QuantityLineFeatures>
> = {
  Receiving: { unitPrice: true, batchNumber: true, expiryDate: true },
  Issue: {},
  Transfer: {},
  Return: {},
  Opening: { openingType: true },
}

export const OPENING_TYPE_LABELS: Readonly<Record<'Correction' | 'Initial', string>> = {
  Initial: 'افتتاحية أولية',
  Correction: 'افتتاحية تصحيحية',
}

const NON_NEGATIVE_PRICE = z.coerce
  .number('يجب إدخال سعر صحيح.')
  .min(0, 'يجب ألا يقل السعر عن صفر.')
  .transform((value) => (value === 0 ? undefined : value))

/**
 * One quantity line. `quantity` lives in the selected unit; the conversion
 * factor is never client-supplied (server-derived per D-UOM-01) — the client
 * keeps `conversionId` and a discardable `baseQuantity` draft preview only.
 */
export const quantityLineSchema = z.object({
  /** Server-side line identity, present when editing an existing draft. */
  lineId: z.uuid().optional(),
  materialId: z.uuid('يجب اختيار مادة صالحة.'),
  /** Display snapshots captured at material selection (never sent). */
  materialNameAr: z.string().trim().min(1, 'يجب اختيار مادة صالحة.'),
  materialDomainId: z.string().optional(),
  baseUnitId: z.string().optional(),
  baseUnitNameAr: z.string().optional(),
  quantity: z.coerce.number('يجب إدخال كمية صحيحة.').gt(0, 'يجب أن تكون الكمية أكبر من صفر.'),
  /** Omitted or empty = the material base unit. */
  unitId: z.string().optional(),
  /** Selected alternative unit conversion; null/empty = the base unit. */
  conversionId: z.string().nullable().optional(),
  /** Draft preview of quantity × conversion factor; server derives the authoritative value. */
  baseQuantity: z.number().optional(),
  unitPrice: NON_NEGATIVE_PRICE.optional(),
  batchNumber: z.string().trim().max(50, 'يجب ألا يتجاوز رقم الدفعة 50 محرفاً.').optional(),
  expiryDate: z.string().date('تاريخ انتهاء غير صالح؛ استخدم صيغة YYYY-MM-DD.').optional(),
  openingType: z.enum(['Initial', 'Correction']).optional(),
})

export type QuantityLineValues = z.infer<typeof quantityLineSchema>

/**
 * Blank row appended by the editor's "إضافة بند" button. `materialId` is an
 * empty string (mapped to a uuid error by the schema) so an untouched row is
 * visibly incomplete, and `quantity` starts at 0 so the input renders the
 * placeholder instead of `NaN`.
 */
export function createEmptyQuantityLine(): QuantityLineValues {
  return {
    materialId: '',
    materialNameAr: '',
    materialDomainId: '',
    quantity: 0,
  }
}

/** The `lines` field-group every document page form carries. */
export interface DocumentLinesContainer {
  lines: QuantityLineValues[]
}

/** Empty rows carry no material yet; active rows never repeat one material id. */
export function linesHaveUniqueMaterials(lines: readonly { materialId: string }[]): boolean {
  const seen = new Set<string>()
  for (const line of lines) {
    if (line.materialId === '') {
      continue
    }
    if (seen.has(line.materialId)) {
      return false
    }
    seen.add(line.materialId)
  }
  return true
}

export const documentLinesSchema = z
  .array(quantityLineSchema)
  .min(1, 'أضف بنداً واحداً على الأقل.')
  .refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  })

export type DocumentLinesValues = z.infer<typeof documentLinesSchema>

/** quantity × factor, the D-UOM-01 draft preview shown to the keeper. */
export function deriveBaseQuantity(quantity: number, factor: string): number {
  return quantity * Number.parseFloat(factor)
}

/**
 * Maps form lines to the request contract. Snapshot fields and empty
 * optionals are dropped; unit/conversion are emitted only when an
 * alternative unit is actually selected.
 */
export function toDocumentLineInputs(lines: readonly QuantityLineValues[]): DocumentLineInput[] {
  return lines.map((line) => ({
    ...(line.lineId !== undefined ? { lineId: line.lineId } : {}),
    materialId: line.materialId,
    quantity: line.quantity,
    ...(line.unitId !== undefined && line.unitId !== '' ? { unitId: line.unitId } : {}),
    ...(line.conversionId !== null &&
    line.conversionId !== undefined &&
    line.conversionId !== '' &&
    line.baseQuantity !== undefined
      ? { conversionId: line.conversionId, baseQuantity: line.baseQuantity }
      : {}),
    ...(line.unitPrice !== undefined ? { unitPrice: line.unitPrice } : {}),
    ...(line.batchNumber !== undefined && line.batchNumber.trim() !== ''
      ? { batchNumber: line.batchNumber.trim() }
      : {}),
    ...(line.expiryDate !== undefined && line.expiryDate.trim() !== ''
      ? { expiryDate: line.expiryDate.trim() }
      : {}),
    ...(line.openingType !== undefined ? { openingType: line.openingType } : {}),
  }))
}

// --- Asset line capture (e12-t05) -------------------------------------------

/**
 * Document types that may carry Asset-kind lines (D-MAT-01, PRD §6.1 and
 * §6.4). Receiving and Opening hoists register new assets — one Asset record
 * per unit — while Issue/Transfer/Return move existing Asset records and
 * must never create capture rows.
 */
export const ASSET_LINE_DOCUMENT_TYPES = ['Receiving', 'Opening'] as const

export type AssetLineDocumentType = (typeof ASSET_LINE_DOCUMENT_TYPES)[number]

/** Narrowed Material union member (materialKind 'Asset', requiresAssetNumber true, trackingType 'Serial'). */
export type AssetKindMaterial = Extract<Material, { materialKind: 'Asset' }>

/** Type guard pages use to partition candidate materials/draft rows between the capture editors. */
export function isAssetMaterial(material: Material): material is AssetKindMaterial {
  return material.materialKind === 'Asset'
}

/** Calendar-valid YYYY-MM-DD check — same format constraint as z.string().date(). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/**
 * Optional contract date field (`YYYY-MM-DD`). A cleared date input is
 * accepted as empty (the draft mapper drops it) while non-calendar values
 * fail with an Arabic message.
 */
function optionalDateField(messageAr: string) {
  return z
    .string()
    .refine((value) => value === '' || isCalendarDate(value), { message: messageAr })
    .transform((value) => (value === '' ? undefined : value))
    .optional()
}

/**
 * One captured asset unit, mirroring the `AssetInput` request contract. The
 * draft may hold empty rows: the contract allocates a missing institutional
 * asset number when the document is posted ("assetNumber may be supplied by
 * an authorized user or allocated by the server during posting; every
 * resulting Asset has a non-null institutional asset number").
 * `serialNumber` stays an optional manufacturer identifier; both dates follow
 * the contract's `Format: date` (YYYY-MM-DD).
 */
export const assetInputSchema = z.object({
  /** Optional in draft (VARCHAR(100) per ERD); server-allocated on posting. */
  assetNumber: z.string().trim().max(100, 'يجب ألا يتجاوز رقم الأصل 100 محرفاً.').optional(),
  /** Optional manufacturer identifier; never a substitute for the asset number. */
  serialNumber: z.string().trim().max(200, 'يجب ألا يتجاوز الرقم التسلسلي 200 محرفاً.').optional(),
  acquisitionDate: optionalDateField('تاريخ حصول غير صالح؛ استخدم صيغة YYYY-MM-DD.'),
  warrantyExpiry: optionalDateField('تاريخ انتهاء ضمان غير صالح؛ استخدم صيغة YYYY-MM-DD.'),
})

export type AssetInputValues = z.infer<typeof assetInputSchema>

/**
 * One asset line. Asset units are base-unit counted — `unitId`/`conversionId`
 * never appear (no unit conversion for D-MAT-01 fixed assets), `quantity`
 * derives from the unit count, and every field is one per-unit `AssetInput`.
 */
export const assetLineSchema = z
  .object({
    /** Server-side line identity, present when editing an existing draft. */
    lineId: z.uuid().optional(),
    materialId: z.uuid('يجب اختيار مادة صالحة.'),
    /** Display snapshots captured at material selection (never sent). */
    materialNameAr: z.string().trim().min(1, 'يجب اختيار مادة صالحة.'),
    materialDomainId: z.string().optional(),
    baseUnitId: z.string().optional(),
    baseUnitNameAr: z.string().optional(),
    /** Derived unit count, never client-edited; must equal `assetInputs.length`. */
    quantity: z
      .number()
      .int('يجب أن تكون الكمية رقماً صحيحاً.')
      .min(0, 'يجب ألا تكون الكمية سالبة.'),
    /** One asset input per unit (D-MAT-01: one Asset record per unit on post). */
    assetInputs: z.array(assetInputSchema).min(1, 'أضف وحدة/أصلاً واحداً على الأقل.'),
  })
  .refine((line) => line.quantity === 0 || line.quantity === line.assetInputs.length, {
    message: 'يجب أن تساوي الكمية عدد وحدات الأصل المسجلة (وحدة لكل أصل).',
  })

export type AssetLineValues = z.infer<typeof assetLineSchema>

/** Blank unit row appended by the editor's "إضافة وحدة/أصل" button. */
export function createEmptyAssetInput(): AssetInputValues {
  return {}
}

/**
 * Blank asset line appended by the editor's "إضافة بند أصل" button.
 * `materialId` is an empty string (mapped to a uuid error by the schema) and
 * the line starts with one empty unit so the unit card renders immediately.
 */
export function createEmptyAssetLine(): AssetLineValues {
  return {
    materialId: '',
    materialNameAr: '',
    materialDomainId: '',
    quantity: 0,
    assetInputs: [createEmptyAssetInput()],
  }
}

/** The `lines` field-group an asset-capture page form carries. */
export interface AssetLinesContainer {
  lines: AssetLineValues[]
}

export const assetLinesSchema = z
  .array(assetLineSchema)
  .min(1, 'أضف بنداً واحداً على الأقل.')
  .refine(linesHaveUniqueMaterials, {
    message: 'لا يجوز تكرار المادة نفسها في أكثر من بند.',
  })

export type AssetLinesValues = z.infer<typeof assetLinesSchema>

/**
 * Maps asset-capture form lines to the request contract. Snapshot fields are
 * dropped and empty optional asset fields are omitted; a unit with no
 * identifiers still emits one empty `AssetInput` so the unit count always
 * equals the line quantity (the server allocates the missing asset number at
 * POST, per the `DocumentLineInput.assetInputs` contract comment).
 */
export function toAssetLineInputs(lines: readonly AssetLineValues[]): DocumentLineInput[] {
  return lines.map((line) => ({
    ...(line.lineId !== undefined ? { lineId: line.lineId } : {}),
    materialId: line.materialId,
    quantity: line.quantity,
    assetInputs: line.assetInputs.map((assetInput): AssetInput => ({
      ...(assetInput.assetNumber !== undefined && assetInput.assetNumber.trim() !== ''
        ? { assetNumber: assetInput.assetNumber.trim() }
        : {}),
      ...(assetInput.serialNumber !== undefined && assetInput.serialNumber.trim() !== ''
        ? { serialNumber: assetInput.serialNumber.trim() }
        : {}),
      ...(assetInput.acquisitionDate !== undefined && assetInput.acquisitionDate !== ''
        ? { acquisitionDate: assetInput.acquisitionDate }
        : {}),
      ...(assetInput.warrantyExpiry !== undefined && assetInput.warrantyExpiry !== ''
        ? { warrantyExpiry: assetInput.warrantyExpiry }
        : {}),
    })),
  }))
}
