import { z } from 'zod'

import type {
  CreateMaterialRequest,
  Material,
  MaterialKind,
  UpdateMaterialRequest,
} from '@/modules/catalog/types/catalog.types'

/**
 * How the server derives `requiresAssetNumber` from `materialKind`.
 *
 * The field itself is SERVER-DERIVED — readable on the record, absent from both
 * create and update bodies — so this map exists only to tell the form what the
 * server will decide, next to the kind the user is picking. `Durable` is here
 * because `MaterialKind` has three members, not two.
 */
export const MATERIAL_TRACKING_POLICIES: Record<MaterialKind, { requiresAssetNumber: boolean }> = {
  Consumable: { requiresAssetNumber: false },
  Durable: { requiresAssetNumber: false },
  Asset: { requiresAssetNumber: true },
}

export function getMaterialTrackingPolicy(materialKind: MaterialKind): {
  requiresAssetNumber: boolean
} {
  return MATERIAL_TRACKING_POLICIES[materialKind]
}

/**
 * `attributes` travels as a JSON OBJECT string or `null`.
 *
 * The backend stores it as text, and an array or a bare scalar is a validation
 * failure, so an empty textarea is normalized to `null` BEFORE the check and the
 * check itself rejects `[]`, `5` and `"x"`. Validating the PARSED shape rather
 * than the text is what makes a form unable to submit something the server would
 * answer with 400 `REQUEST_VALIDATION_FAILED`.
 */
const materialAttributesSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
  z.union([z.string(), z.null()]).superRefine((value, context) => {
    if (value === null) return
    let parsed: unknown
    try {
      parsed = JSON.parse(value)
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'أدخل كائناً بصيغة JSON صحيحة، أو اترك الحقل فارغاً.',
      })
      return
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      context.addIssue({
        code: 'custom',
        message: 'يجب أن تكون الخصائص كائناً بصيغة JSON وليست قائمة أو قيمة بسيطة.',
      })
    }
  }),
)

/**
 * The material form carries exactly the members `POST /catalog/materials`
 * binds, so the object it resolves IS the create body. Three of them
 * (`familyId`, `baseUnitId`, `code`) are create-only and are deliberately absent
 * from {@link toUpdateMaterialRequest} — that is not a forgotten omission, it is
 * the `PUT` record not binding them.
 *
 * `status` is NOT here: material status is its own command
 * (`PUT /catalog/materials/{materialId}/status`) and neither create nor update
 * binds it.
 */
export const materialFormSchema = z.object({
  code: z
    .string('أدخل رمز المادة.')
    .trim()
    .min(1, 'الرمز مطلوب.')
    .max(64, 'الرمز لا يجب أن يتجاوز 64 حرفاً.'),
  nameAr: z
    .string('أدخل اسم المادة بالعربية.')
    .trim()
    .min(1, 'الاسم مطلوب.')
    .max(255, 'الاسم لا يجب أن يتجاوز 255 حرفاً.'),
  nameEn: z
    .string('أدخل اسم المادة بالإنجليزية.')
    .trim()
    .min(1, 'الاسم الإنجليزي مطلوب عند إدخاله.')
    .max(255, 'الاسم الإنجليزي لا يجب أن يتجاوز 255 حرفاً.')
    .nullable(),
  familyId: z.string('اختر عائلة مادة.').uuid('اختر عائلة مادة صحيحة.'),
  baseUnitId: z.string('اختر وحدة قياس.').uuid('اختر وحدة قياس صحيحة.'),
  materialKind: z.enum(['Consumable', 'Durable', 'Asset']),
  trackingType: z.enum(['Quantity', 'Serial']),
  hasExpiry: z.boolean({ message: 'حدّد ما إذا كانت للمادة تاريخ صلاحية.' }),
  attributes: materialAttributesSchema,
})

export type MaterialFormValues = z.infer<typeof materialFormSchema>

export const EMPTY_VALUES: MaterialFormValues = {
  code: '',
  nameAr: '',
  nameEn: null,
  familyId: '',
  baseUnitId: '',
  materialKind: 'Consumable',
  trackingType: 'Quantity',
  hasExpiry: false,
  attributes: null,
}

/** Trimming happens once, at the boundary, so no call site re-trims. */
function trimmedOrNull(value: string | null): string | null {
  return value === null ? null : value.trim()
}

/**
 * `POST /catalog/materials` body, and nothing else.
 *
 * No `catalogVersion` — there is no prior classification to check on a create,
 * and the create record does not bind it. No `requiresAssetNumber` — server
 * derived, so sending it is rejected.
 */
export function toCreateMaterialRequest(values: MaterialFormValues): CreateMaterialRequest {
  return {
    familyId: values.familyId as Material['familyId'],
    baseUnitId: values.baseUnitId as Material['baseUnitId'],
    nameAr: values.nameAr.trim(),
    nameEn: trimmedOrNull(values.nameEn),
    code: values.code.trim(),
    materialKind: values.materialKind,
    trackingType: values.trackingType,
    hasExpiry: values.hasExpiry,
    attributes: values.attributes,
  }
}

/**
 * `PUT /catalog/materials/{materialId}` body.
 *
 * `expectedCatalogVersion` is REQUIRED and is the `catalogVersion` the read
 * served, VERBATIM — echoed from `material.catalogVersion`, never invented,
 * decremented or omitted. A stale echo is refused with 409
 * `MATERIALS_CATALOG_VERSION_MISMATCH`; the server bumps the version only when
 * `materialKind`/`trackingType` change.
 *
 * `familyId`, `baseUnitId` and `code` are NOT emitted: they are not updatable,
 * and a single "upsert" mapper is what used to try to move a material between
 * families through a route that binds no such field.
 */
export function toUpdateMaterialRequest(
  values: MaterialFormValues,
  material: Material,
): UpdateMaterialRequest {
  return {
    nameAr: values.nameAr.trim(),
    nameEn: trimmedOrNull(values.nameEn),
    materialKind: values.materialKind,
    trackingType: values.trackingType,
    hasExpiry: values.hasExpiry,
    attributes: values.attributes,
    expectedCatalogVersion: material.catalogVersion,
  }
}
