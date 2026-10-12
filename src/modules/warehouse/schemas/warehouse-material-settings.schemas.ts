import { z } from 'zod'

import { statusOrdinal } from '@/modules/warehouse/types/warehouse.types'

/**
 * Non-negative DECIMAL(18,3) threshold kept as source text (like the
 * conversion-factor convention): JavaScript numbers round valid values near
 * the contract limit, and the server remains the final validator.
 */
const NON_NEGATIVE_DECIMAL_18_3 = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/

function thresholdMessage(label: string): string {
  return `أدخل ${label} رقمًا غير سالب بصيغة عشرية صحيحة (حتى 3 منازل عشرية).`
}

const optionalThreshold = (label: string) =>
  z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value === '' || NON_NEGATIVE_DECIMAL_18_3.test(value),
      thresholdMessage(label),
    )

/**
 * Form mirror of `CreateWarehouseMaterialSettingRequest` / `UpdateWarehouse
 * MaterialSettingRequest` with text thresholds. The wire requires both
 * `minQuantity` and `maxQuantity` to be present and non-negative; the
 * `.refine` enforces `min <= max` in the form.
 */
export const warehouseMaterialSettingSchema = z
  .object({
    materialId: z.string().uuid('اختر مادة صالحة.'),
    minQuantity: optionalThreshold('الحد الأدنى'),
    maxQuantity: optionalThreshold('الحد الأعلى'),
    status: z.enum(['Active', 'Inactive']),
  })
  .refine(
    (values) => {
      if (values.minQuantity === undefined || values.minQuantity === '') return true
      if (values.maxQuantity === undefined || values.maxQuantity === '') return true
      return Number(values.maxQuantity) >= Number(values.minQuantity)
    },
    {
      message: 'الحد الأعلى يجب أن يكون أكبر من الحد الأدنى أو مساويًا له.',
      path: ['maxQuantity'],
    },
  )

export type WarehouseMaterialSettingFormValues = z.infer<typeof warehouseMaterialSettingSchema>

function toRequiredQuantity(value: string | undefined, field: string): number {
  if (value === undefined || value === '') {
    throw new Error(`Material setting ${field} is required.`)
  }
  return Number(value)
}

/**
 * Maps form-owned values to the create request.
 *
 * The create body carries `warehouseId` because the per-setting POST route
 * (`/warehouse-material-settings`) does not encode the warehouse in the
 * path. `existing` is null on create.
 */
export function toCreateWarehouseMaterialSettingRequest(
  values: WarehouseMaterialSettingFormValues,
  warehouseId: string,
): {
  warehouseId: string
  materialId: string
  minQuantity: number
  maxQuantity: number
} {
  return {
    warehouseId,
    materialId: values.materialId,
    minQuantity: toRequiredQuantity(values.minQuantity, 'minQuantity'),
    maxQuantity: toRequiredQuantity(values.maxQuantity, 'maxQuantity'),
  }
}

/**
 * Maps form-owned values to the per-setting update request. The route
 * (`PUT /warehouse-material-settings/{settingId}`) already names the
 * setting and the warehouse, so the body carries only the thresholds.
 * There is no rowVersion on the wire.
 */
export function toUpdateWarehouseMaterialSettingRequest(
  values: WarehouseMaterialSettingFormValues,
): { minQuantity: number; maxQuantity: number } {
  return {
    minQuantity: toRequiredQuantity(values.minQuantity, 'minQuantity'),
    maxQuantity: toRequiredQuantity(values.maxQuantity, 'maxQuantity'),
  }
}

/**
 * Status toggle body. The setter route is a separate PUT so a status
 * change never rides the same call as a threshold edit. A no-op status
 * flip is rejected by the backend with `ALREADY_ACTIVE` /
 * `ALREADY_INACTIVE` — surfacing the optimistic toggle would be a
 * silent failure, so the form re-reads the row and clears the form
 * dirty state if the server returns 409.
 *
 * `status` is the INT ORDINAL the route binds (`0` = Active, `1` =
 * Inactive), produced by `statusOrdinal`, because the controller casts an
 * `int` to the enum server-side and a string cannot bind it.
 */
export function toSetWarehouseMaterialSettingStatusRequest(
  values: Pick<WarehouseMaterialSettingFormValues, 'status'>,
): { status: number } {
  return { status: statusOrdinal(values.status) }
}
