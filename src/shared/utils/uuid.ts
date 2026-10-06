/**
 * A UUID-shaped identifier, WITHOUT the RFC-9562 version and variant checks.
 *
 * `z.uuid()` in Zod 4 validates the version nibble (must be 1-5) and the variant
 * bits. The backend's seeded identifiers do not satisfy that: the four well-known
 * role ids are `00000000-0000-0000-0000-00000000000N`, whose version nibble is `0`
 * and whose variant bits are `0`. Verified: `z.uuid().safeParse(
 * '00000000-0000-0000-0000-000000000003')` is false.
 *
 * That produced a form that validated a chosen role as INVALID while displaying it
 * as correctly selected — the administrator saw "مدير المستودع" in the closed
 * control and "يجب اختيار دور صالح." in red underneath, and the form could not be
 * submitted at all. It hid from the unit tests because the fixtures generate
 * RFC-compliant version-4 identifiers (`00000000-0000-4000-8000-…`), so only the
 * live backend exposed it.
 *
 * These values arrive from a .NET `Guid`, which is a 128-bit value rather than a
 * versioned RFC-4122 identifier. Validating the canonical 8-4-4-4-12 hex shape is
 * therefore the correct check here; the version bits carry no meaning for this
 * system and must not gate a form.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/** True when `value` is a canonical 8-4-4-4-12 hexadecimal identifier. */
export function isUuidLike(value: string): boolean {
  return UUID_SHAPE.test(value.trim())
}
