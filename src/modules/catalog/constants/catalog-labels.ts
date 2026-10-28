import type { MaterialKind, TrackingType } from '@/modules/catalog/types/catalog.types'

/**
 * Arabic labels for `Domain.Materials.MaterialKind` — `Consumable, Durable,
 * Asset`, all three of them.
 *
 * `Durable` is not optional: `MaterialKind` is a three-member union in
 * `catalog.api-types.ts` (the backend serves it), and this map is a
 * `Record<MaterialKind, string>`, so a missing row is a compile error rather
 * than a blank `<Select>` option. "معمرة" is the durable-goods reading of the
 * member — an item that survives repeated use without being consumed and is not
 * individually tracked as a capital asset (which is what `Asset` covers).
 */
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  Consumable: 'مستهلكة',
  Durable: 'معمرة',
  Asset: 'أصل ثابت',
}

/**
 * Arabic labels for `Domain.Materials.TrackingType` — `Quantity, Serial`.
 *
 * `TrackingType` was missing from the frontend contract entirely before
 * `catalog.api-types.ts` declared it: the create/update bodies bind it as
 * `[JsonRequired]`, so a material form that could not express it could not
 * save. Both members are reads here and form values there, so the map is the
 * single place the two are joined.
 */
export const TRACKING_TYPE_LABELS: Record<TrackingType, string> = {
  Quantity: 'بكمية',
  Serial: 'بالتسلسل',
}

/**
 * Arabic labels for the unit types the catalog serves.
 *
 * `unitType` is a free-form string on the wire (backend `string`, max 50), so
 * this map is keyed by the value the server sends and NOT by a closed union —
 * there is no compile-time guard here, and the fallback in
 * {@link unitTypeLabelAr} is what keeps an unmapped value honest.
 *
 * Only the types the catalog actually uses are listed. A type the server adds
 * later is shown exactly as it arrives until a row is added here.
 */
export const UNIT_TYPE_LABELS_AR: Readonly<Record<string, string>> = {
  Counting: 'العدّ',
  Quantity: 'الكمية',
  Weight: 'الوزن',
}

/** The same labels, keyed case-insensitively — the wire spells them freely. */
const UNIT_TYPE_LABELS_BY_LOWER_KEY: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(UNIT_TYPE_LABELS_AR).map(([value, label]) => [value.toLowerCase(), label]),
)

/**
 * The Arabic label for a unit type, or the raw value when the map has never
 * heard of it: an unmapped type is shown as the server sent it rather than
 * guessed at.
 */
/** Shown when the server sends no unit type at all: a missing field must not kill the page. */
export const UNKNOWN_UNIT_TYPE_AR = 'غير محد'

export function unitTypeLabelAr(unitType: string | null | undefined): string {
  if (unitType === null || unitType === undefined) {
    return UNKNOWN_UNIT_TYPE_AR
  }
  const trimmed = unitType.trim()
  if (trimmed === '') {
    return UNKNOWN_UNIT_TYPE_AR
  }
  const label = UNIT_TYPE_LABELS_BY_LOWER_KEY[trimmed.toLowerCase()]
  return label ?? unitType
}

export interface MaterialKindOption {
  readonly value: MaterialKind
  readonly label: string
}

export interface TrackingTypeOption {
  readonly value: TrackingType
  readonly label: string
}

/**
 * Paired value/label options for `<Select>` consumers that render every material
 * kind. Derived from {@link MATERIAL_KIND_LABELS} so the inline literal pair
 * `<SelectItem value="Consumable">مستهلكة</SelectItem>` /
 * `<SelectItem value="Asset">أصل ثابت</SelectItem>` stays defined in exactly one
 * place — both the catalog filter and the material-form dialog consume this
 * array.
 *
 * The contract enum is `Consumable | Durable | Asset` and the backend serves
 * every one of the three, so all three are offered. Adding a member to
 * `MaterialKind` without adding its label row here is a compile error, which is
 * the intended guard: a missing option is a silent hole in a master-data screen.
 */
export const MATERIAL_KIND_OPTIONS: readonly MaterialKindOption[] = (
  Object.entries(MATERIAL_KIND_LABELS) as ReadonlyArray<[MaterialKind, string]>
).map(([value, label]) => ({ value, label }))

/** The {@link MATERIAL_KIND_OPTIONS} pair for {@link TRACKING_TYPE_LABELS}. */
export const TRACKING_TYPE_OPTIONS: readonly TrackingTypeOption[] = (
  Object.entries(TRACKING_TYPE_LABELS) as ReadonlyArray<[TrackingType, string]>
).map(([value, label]) => ({ value, label }))
