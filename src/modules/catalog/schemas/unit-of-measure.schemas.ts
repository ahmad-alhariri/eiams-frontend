import { z } from 'zod'

import type {
  CreateUnitOfMeasureRequest,
  UpdateUnitOfMeasureRequest,
} from '@/modules/catalog/types/catalog.types'

/**
 * The unit projection is `{ id, name, symbol, unitType, status }` — there is no
 * `code`, no `nameAr`, no `descriptionAr`, no `nominalConversionFactor` and no
 * `baseUnitId`. The conversion story lives on `MaterialUnitConversion`, so a unit
 * form has exactly three fields and `status` is not one of them (it is a
 * separate command whose body is an INTEGER ordinal).
 *
 * `unitType` is a free-form string on the wire (backend `string`, max 50) —
 * observed live with values like "Quantity" — so it is deliberately not
 * narrowed to an enum here.
 */
export const unitOfMeasureSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'اسم وحدة القياس مطلوب.')
    .max(200, 'اسم وحدة القياس يجب ألّا يتجاوز 200 محرف.'),
  symbol: z
    .string()
    .trim()
    .min(1, 'رمز وحدة القياس مطلوب.')
    .max(50, 'رمز وحدة القياس يجب ألّا يتجاوز 50 محرفاً.'),
  unitType: z
    .string()
    .trim()
    .min(1, 'نوع وحدة القياس مطلوب.')
    .max(50, 'نوع وحدة القياس يجب ألّا يتجاوز 50 محرفاً.'),
})

export type UnitOfMeasureFormValues = z.infer<typeof unitOfMeasureSchema>

/** `POST /catalog/units-of-measure` body — all three members required. */
export function toCreateUnitOfMeasureRequest(
  values: UnitOfMeasureFormValues,
): CreateUnitOfMeasureRequest {
  return {
    name: values.name.trim(),
    symbol: values.symbol.trim(),
    unitType: values.unitType.trim(),
  }
}

/**
 * `PUT /catalog/units-of-measure/{unitId}` body — the SAME three fields, still
 * split into its own type rather than sharing one "upsert": the update route
 * binds its own `RequestBody(Name, Symbol, UnitType)` record, and the
 * single-shape era is what let `status` and `rowVersion` ride along into bodies
 * that reject them. Not versioned — the column does not exist.
 */
export function toUpdateUnitOfMeasureRequest(
  values: UnitOfMeasureFormValues,
): UpdateUnitOfMeasureRequest {
  return {
    name: values.name.trim(),
    symbol: values.symbol.trim(),
    unitType: values.unitType.trim(),
  }
}
