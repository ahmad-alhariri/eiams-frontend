import { z } from 'zod'

import type { Warehouse, WarehouseUpsertRequest } from '@/shared/types/generated/eiams-v1'

const UUID_MESSAGE = 'يجب اختيار موقع صالح.'

/** Mirrors the complete v1 WarehouseUpsertRequest contract. */
export const warehouseSchema = z.object({
  siteId: z.uuid(UUID_MESSAGE),
  code: z
    .string()
    .trim()
    .min(1, 'رمز المستودع مطلوب.')
    .max(50, 'رمز المستودع يجب ألّا يتجاوز 50 محرفاً.'),
  nameAr: z.string().trim().max(200, 'اسم المستودع يجب ألّا يتجاوز 200 محرف.'),
  locationAr: z.string().trim().max(500, 'الموقع التفصيلي يجب ألّا يتجاوز 500 محرف.').optional(),
  status: z.enum(['Active', 'Inactive']),
})

export type WarehouseFormValues = z.infer<typeof warehouseSchema>

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? null : trimmed
}

/** Maps form-owned values to the exact contract request, including concurrency. */
export function toWarehouseRequest(
  values: WarehouseFormValues,
  warehouse: Warehouse | null,
): WarehouseUpsertRequest {
  return {
    siteId: values.siteId,
    code: values.code.trim(),
    nameAr: values.nameAr.trim(),
    locationAr: emptyToNull(values.locationAr),
    status: values.status,
    rowVersion: warehouse?.rowVersion ?? 0,
  }
}
