import { z } from 'zod'

import type {
  CreateUnitOfMeasureRequest,
  UpdateUnitOfMeasureRequest,
} from '@/modules/catalog/types/catalog.types'

/**
 * Arabic message for a unit whose (name, unitType) pair another unit already
 * uses.
 */
export const DUPLICATE_UNIT_NAME_AR =
  'يوجد بالفعل وحدة قياس بنفس الاسم ونوع الوحدة. اختر اسماً مختلفاً.'

/** The identity a unit carries for the uniqueness check. */
export interface UnitOfMeasureIdentity {
  readonly id: string
  readonly name: string
  readonly unitType: string
}

/**
 * The units a submitted unit must not collide with, and the unit being edited
 * (a unit never collides with itself).
 *
 * WHY A PUBLISHED SCOPE AND NOT A FACTORY ARGUMENT: the form dialog resolves
 * with the module-level {@link unitOfMeasureSchema} — it owns its own
 * `zodResolver(...)` — so the rule cannot be handed to the resolver as an
 * argument. The units page publishes what it loaded here and the resolver
 * reads the scope when it validates.
 *
 * shortcut: the scope holds the units of the page the user is looking at, so a
 * duplicate that lives on another page of the list is not caught client-side;
 * the server remains the authority. Upgrade when the units read returns every
 * unit rather than one page.
 */
let uniquenessScope: {
  readonly units: readonly UnitOfMeasureIdentity[]
  readonly editingUnitId: string | null
} = { units: [], editingUnitId: null }

/** Publishes the units the form must not collide with. */
export function setUnitOfMeasureUniquenessScope(scope: {
  readonly units: readonly UnitOfMeasureIdentity[]
  readonly editingUnitId: string | null
}): void {
  uniquenessScope = scope
}

/**
 * True when another unit already carries the same (name, unitType) pair.
 *
 * The comparison ignores case and surrounding spaces, the way the catalog
 * compares unit types elsewhere (the unit-conversion picker matches
 * `unitType` case-insensitively).
 */
export function hasDuplicateUnitName(
  values: { readonly name: string; readonly unitType: string },
  units: readonly UnitOfMeasureIdentity[] = uniquenessScope.units,
  editingUnitId: string | null = uniquenessScope.editingUnitId,
): boolean {
  const name = values.name.trim().toLowerCase()
  const unitType = values.unitType.trim().toLowerCase()
  return units.some(
    (unit) =>
      unit.id !== editingUnitId &&
      unit.name.trim().toLowerCase() === name &&
      unit.unitType.trim().toLowerCase() === unitType,
  )
}

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
 *
 * The (name, unitType) pair is unique: two units sharing it are
 * indistinguishable in every picker, and a material can then hold two
 * conversions from identically labelled units. The refinement reports the
 * Arabic message on the `name` field, so the form shows it inline.
 */
export const unitOfMeasureSchema = z
  .object({
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
  .superRefine((values, context) => {
    if (!hasDuplicateUnitName(values)) return
    context.addIssue({
      code: 'custom',
      path: ['name'],
      message: DUPLICATE_UNIT_NAME_AR,
    })
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
