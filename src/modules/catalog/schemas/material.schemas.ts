import { z } from 'zod'

import type {
  Material,
  MaterialKind,
  MaterialUpsertRequest,
  TrackingType,
} from '@/shared/types/generated/eiams-v1'

export type MaterialTrackingPolicy = {
  trackingType: TrackingType
  requiresAssetNumber: boolean
  availableTrackingTypes: readonly TrackingType[]
}

/**
 * The approved v1 matrix keeps accounting classification, tracking, and the
 * asset-number requirement consistent. Custody behavior is a separate domain
 * concern and is intentionally not inferred here.
 */
export const MATERIAL_TRACKING_POLICIES: Record<MaterialKind, MaterialTrackingPolicy> = {
  Consumable: {
    trackingType: 'Quantity',
    requiresAssetNumber: false,
    availableTrackingTypes: ['Quantity'],
  },
  Durable: {
    trackingType: 'Quantity',
    requiresAssetNumber: false,
    availableTrackingTypes: ['Quantity', 'Serial'],
  },
  Asset: {
    trackingType: 'Serial',
    requiresAssetNumber: true,
    availableTrackingTypes: ['Serial'],
  },
}

export function getMaterialTrackingPolicy(materialKind: MaterialKind): MaterialTrackingPolicy {
  return MATERIAL_TRACKING_POLICIES[materialKind]
}

export function isMaterialTrackingCombinationValid(
  materialKind: MaterialKind,
  trackingType: TrackingType,
  requiresAssetNumber: boolean,
): boolean {
  const policy = getMaterialTrackingPolicy(materialKind)
  return (
    policy.requiresAssetNumber === requiresAssetNumber &&
    policy.availableTrackingTypes.includes(trackingType)
  )
}

/** Core material fields represented by the v1 MaterialUpsertRequest contract. */
export const materialSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, 'رمز المادة مطلوب.')
      .max(50, 'لا يمكن أن يتجاوز رمز المادة 50 حرفاً.'),
    nameAr: z
      .string()
      .trim()
      .min(1, 'اسم المادة مطلوب.')
      .max(250, 'لا يمكن أن يتجاوز اسم المادة 250 حرفاً.'),
    descriptionAr: z.string().trim().max(1000, 'لا يمكن أن يتجاوز وصف المادة 1000 حرف.').optional(),
    familyId: z.string().uuid('اختر عائلة مادة صالحة.'),
    baseUnitId: z.string().uuid('اختر وحدة قياس صالحة.'),
    materialKind: z.enum(['Consumable', 'Durable', 'Asset']),
    trackingType: z.enum(['Quantity', 'Serial']),
    requiresAssetNumber: z.boolean(),
    status: z.enum(['Active', 'Inactive']),
  })
  .superRefine((values, context) => {
    const policy = getMaterialTrackingPolicy(values.materialKind)

    if (!policy.availableTrackingTypes.includes(values.trackingType)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          values.materialKind === 'Consumable'
            ? 'المادة المستهلكة تُتبع بالكمية فقط.'
            : 'الأصل الثابت يُتبع بالرقم التسلسلي فقط.',
        path: ['trackingType'],
      })
    }

    if (values.requiresAssetNumber !== policy.requiresAssetNumber) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: policy.requiresAssetNumber
          ? 'الأصل الثابت يتطلب رقم أصل.'
          : 'رقم الأصل يقتصر على الأصول الثابتة.',
        path: ['requiresAssetNumber'],
      })
    }
  })

export type MaterialFormValues = z.infer<typeof materialSchema>

/** Returns the one contract-safe tracking combination for a material category. */
export function applyMaterialTrackingPolicy(
  materialKind: MaterialKind,
  trackingType?: TrackingType,
): Pick<MaterialFormValues, 'trackingType' | 'requiresAssetNumber'> {
  const policy = getMaterialTrackingPolicy(materialKind)

  return {
    trackingType:
      trackingType !== undefined && policy.availableTrackingTypes.includes(trackingType)
        ? trackingType
        : policy.trackingType,
    requiresAssetNumber: policy.requiresAssetNumber,
  }
}

/** Maps form values to the exact API request and preserves optimistic concurrency. */
export function toMaterialRequest(
  values: MaterialFormValues,
  material: Material | null,
): MaterialUpsertRequest {
  const descriptionAr = values.descriptionAr?.trim()
  const tracking = applyMaterialTrackingPolicy(values.materialKind, values.trackingType)
  const baseRequest = {
    baseUnitId: values.baseUnitId,
    code: values.code.trim(),
    ...(descriptionAr === undefined || descriptionAr === ''
      ? { descriptionAr: null }
      : { descriptionAr }),
    familyId: values.familyId,
    nameAr: values.nameAr.trim(),
    rowVersion: material?.rowVersion ?? 0,
    status: values.status,
  }

  switch (values.materialKind) {
    case 'Consumable':
      return {
        ...baseRequest,
        materialKind: 'Consumable',
        requiresAssetNumber: false,
        trackingType: 'Quantity',
      }
    case 'Durable':
      return {
        ...baseRequest,
        materialKind: 'Durable',
        requiresAssetNumber: false,
        trackingType: tracking.trackingType,
      }
    case 'Asset':
      return {
        ...baseRequest,
        materialKind: 'Asset',
        requiresAssetNumber: true,
        trackingType: 'Serial',
      }
  }
}
