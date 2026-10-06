import { z } from 'zod'

import type {
  Warehouse,
  WarehouseCreateRequest,
  WarehouseUpdateRequest,
} from '@/modules/warehouse/types/warehouse.types'

const SITE_MESSAGE = 'يجب اختيار موقع صالح.'
const ORG_UNIT_MESSAGE = 'يجب اختيار وحدة تنظيمية صالحة.'
const CODE_REQUIRED_MESSAGE = 'رمز المستودع مطلوب.'
const CODE_TOO_LONG_MESSAGE = 'رمز المستودع يجب ألّا يتجاوز 50 محرفاً.'
const NAME_REQUIRED_MESSAGE = 'اسم المستودع مطلوب.'
const NAME_TOO_LONG_MESSAGE = 'اسم المستودع يجب ألّا يتجاوز 200 محرف.'
const TYPE_REQUIRED_MESSAGE = 'نوع المستودع مطلوب.'
const TYPE_TOO_LONG_MESSAGE = 'نوع المستودع يجب ألّا يتجاوز 100 محرفاً.'

/**
 * One form shape for both warehouse operations, with the create-only fields
 * required only in create mode — the pattern `admin/schemas/user.schemas.ts`
 * uses, and the one the backend enforces: `POST /warehouses` binds `siteId`
 * and `code`, while `PUT /warehouses/{id}` binds neither.
 *
 * `name` (not `nameAr`), `warehouseType` and `canHoldStock` are the fields the
 * wire actually carries; there is no `status` here because activation is its
 * own route, and no `locationAr` because the backend never served one.
 */
export function warehouseFormSchema(isCreate: boolean) {
  return z.object({
    // Create-only: shown read-only on edit and never sent to the update body.
    siteId: isCreate ? z.uuid(SITE_MESSAGE) : z.string(),
    code: isCreate
      ? z.string().trim().min(1, CODE_REQUIRED_MESSAGE).max(50, CODE_TOO_LONG_MESSAGE)
      : z.string().trim().max(50, CODE_TOO_LONG_MESSAGE),
    name: z.string().trim().min(1, NAME_REQUIRED_MESSAGE).max(200, NAME_TOO_LONG_MESSAGE),
    // Both bodies bind it, so both modes require it.
    organizationalUnitId: z.uuid(ORG_UNIT_MESSAGE),
    // Free-form on the wire (backend `string`, observed as "Storage"), so it is
    // validated for presence and length only — never narrowed to a union here.
    warehouseType: z.string().trim().min(1, TYPE_REQUIRED_MESSAGE).max(100, TYPE_TOO_LONG_MESSAGE),
    canHoldStock: z.boolean(),
  })
}

export type WarehouseFormValues = z.infer<ReturnType<typeof warehouseFormSchema>>

/** Fresh empty values for a create form (never a shared mutable object). */
export function emptyWarehouseFormValues(): WarehouseFormValues {
  return {
    siteId: '',
    code: '',
    name: '',
    organizationalUnitId: '',
    warehouseType: '',
    canHoldStock: true,
  }
}

/**
 * Seeds the form from a warehouse READ record.
 *
 * Reads `name` — the field the backend serves. The record has no `nameAr`, no
 * `locationAr`, and no nested `site`: `siteId` is flat, so a site label has to
 * be joined from the sites list rather than read off the warehouse.
 */
export function toWarehouseFormValues(warehouse: Warehouse | null): WarehouseFormValues {
  if (warehouse === null) return emptyWarehouseFormValues()
  return {
    siteId: warehouse.siteId,
    code: warehouse.code,
    name: warehouse.name,
    organizationalUnitId: warehouse.organizationalUnitId ?? '',
    warehouseType: warehouse.warehouseType,
    canHoldStock: warehouse.canHoldStock,
  }
}

/**
 * Maps create values to `POST /warehouses`: `siteId`, `organizationalUnitId`,
 * `name`, `code`, `warehouseType`, `canHoldStock` — and nothing else. There is
 * no `status` (activation is a separate route) and no concurrency token (the
 * row does not exist yet).
 */
export function toCreateWarehouseRequest(values: WarehouseFormValues): WarehouseCreateRequest {
  return {
    siteId: values.siteId,
    organizationalUnitId: values.organizationalUnitId,
    name: values.name,
    code: values.code,
    warehouseType: values.warehouseType,
    canHoldStock: values.canHoldStock,
  }
}

/**
 * Maps edit values to `PUT /warehouses/{id}`: the create-only `siteId` and
 * `code` are dropped because the body binds neither, `status` is dropped for
 * the same reason as on create, and the concurrency token is the value the read
 * served as `rowVersion` VERBATIM. The handler compares it directly against the
 * column and the validator rejects anything `<= 0`, while a freshly created row
 * carries 1 — normalising it to 0-based would send 0 and be rejected.
 */
export function toUpdateWarehouseRequest(
  values: WarehouseFormValues,
  warehouse: Warehouse,
): WarehouseUpdateRequest {
  return {
    organizationalUnitId: values.organizationalUnitId,
    name: values.name,
    warehouseType: values.warehouseType,
    canHoldStock: values.canHoldStock,
    expectedRowVersion: warehouse.rowVersion,
  }
}
