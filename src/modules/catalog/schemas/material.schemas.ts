import { z } from 'zod'

import type { Material, MaterialUpsertRequest, Uuid } from '@/modules/catalog/types/catalog.types'

type MaterialKind = Material['materialKind']

export const MATERIAL_TRACKING_POLICIES: Record<MaterialKind, { requiresAssetNumber: boolean }> = {
  Consumable: { requiresAssetNumber: false },
  Asset: { requiresAssetNumber: true },
}

export function getMaterialTrackingPolicy(materialKind: MaterialKind): {
  requiresAssetNumber: boolean
} {
  return MATERIAL_TRACKING_POLICIES[materialKind] ?? { requiresAssetNumber: false }
}

export const materialFormSchema = z.object({
  code: z
    .string('أدخل رمز المادة.')
    .min(1, 'الرمز مطلوب.')
    .max(64, 'الرمز لا يجب أن يتجاوز 64 حرفاً.'),
  nameAr: z
    .string('أدخل اسم المادة بالعربية.')
    .min(1, 'الاسم مطلوب.')
    .max(255, 'الاسم لا يجب أن يتجاوز 255 حرفاً.'),
  descriptionAr: z.string('أدخل وصف المادة.').nullable(),
  materialFamilyId: z.string('اختر عائلة مادة.').uuid('اختر عائلة مادة صحيحة.'),
  unitId: z.string('اختر وحدة قياس.').uuid('اختر وحدة قياس صحيحة.'),
  parentMaterialId: z
    .string('اختر أصلاً مالياً صالحاً.')
    .uuid('اختر أصلاً مالياً صالحاً.')
    .nullable()
    .optional(),
  status: z.enum(['Active', 'Inactive']),
  materialKind: z.enum(['Consumable', 'Asset']),
  nominalConversionFactor: z.number(),
})

export type MaterialFormValues = z.infer<typeof materialFormSchema>

export const EMPTY_VALUES: MaterialFormValues = {
  code: '',
  nameAr: '',
  descriptionAr: null,
  materialFamilyId: '' as unknown as Uuid,
  unitId: '' as unknown as Uuid,
  parentMaterialId: undefined,
  status: 'Active',
  materialKind: 'Consumable',
  nominalConversionFactor: 1,
}

export function toMaterialRequest(
  values: MaterialFormValues,
  material: Material | null,
): MaterialUpsertRequest {
  return {
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    descriptionAr: values.descriptionAr?.trim() ?? null,
    materialFamilyId: values.materialFamilyId as Uuid,
    unitId: values.unitId as Uuid,
    status: values.status,
    materialKind: values.materialKind,
    nominalConversionFactor: values.nominalConversionFactor,
    requiresAssetNumber: values.materialKind === 'Asset',
    rowVersion: material?.rowVersion ?? 0,
    ...(values.parentMaterialId !== undefined
      ? { parentMaterialId: values.parentMaterialId as Uuid | null }
      : {}),
  }
}
