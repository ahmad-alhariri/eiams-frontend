import { describe, expect, it } from 'vitest'

import { arabicCopyForCode, KNOWN_ERROR_CODES } from '@/shared/api/error-copy-ar'
import { normalizeWireErrorCode } from '@/shared/api/envelope'

/**
 * The codes the asset and custody write path can put on the wire, spelled
 * exactly as the backend writes them.
 *
 * `TrackedMaterialUnitErrors.NotFound` and `DurableCustodyAllocationErrors.NotFound`
 * are UPPER_SNAKE literals with no `ERRORS` segment, so a key carrying one
 * (`TRACKED_MATERIAL_UNIT_ERRORS_NOT_FOUND`) is copy the lookup can never
 * select: the code never arrives in that shape. This list pins the live codes
 * by name, so renaming one fails here instead of silently degrading the
 * message to the generic per-status wording.
 */
const WIRE_CODES = [
  'CUSTODIES_NOT_FOUND',
  'TRACKED_MATERIAL_UNIT_NOT_FOUND',
  'DURABLE_CUSTODY_ALLOCATION_NOT_FOUND',
  'TRANSFER_INFOS_ASSET_LINE_NOT_SUPPORTED',
  'DISPOSALS_SINGLE_ASSET_REQUIRED',
  'COUNTERPARTS_OPERATIONAL_REQUIRES_NON_EMPLOYEE',
] as const

/** The spellings that were dead copy: no backend file emits them. */
const DEAD_CODES = [
  'TRACKED_MATERIAL_UNIT_ERRORS_NOT_FOUND',
  'DURABLE_CUSTODY_ALLOCATION_ERRORS_NOT_FOUND',
] as const

describe('Arabic error copy for the asset and custody write path', () => {
  it('pins the wire codes this guard covers', () => {
    // A trimmed list would turn the assertions below into a smaller claim than
    // they look like, so the count is stated.
    expect(WIRE_CODES).toHaveLength(6)
  })

  it.each(WIRE_CODES)('maps the wire code %s to a key of the same name', (code) => {
    expect(KNOWN_ERROR_CODES, code).toContain(code)
  })

  it.each(WIRE_CODES)('gives the wire code %s a non-empty Arabic title', (code) => {
    const copy = arabicCopyForCode(code)
    expect(copy, `no Arabic copy for ${code}`).not.toBeNull()
    expect(copy?.titleAr.trim().length ?? 0, code).toBeGreaterThan(0)
    expect(copy?.titleAr ?? '', code).not.toMatch(/[A-Za-z]/u)
  })

  it.each(WIRE_CODES)('keeps the wire code %s in the shape the lookup uses', (code) => {
    // The map is keyed on the normalized code, so a key that differs from the
    // normalized form of the wire code is copy nothing can select.
    expect(normalizeWireErrorCode(code), code).toBe(code)
  })

  it.each(DEAD_CODES)('does not carry the dead key %s', (code) => {
    expect(KNOWN_ERROR_CODES, code).not.toContain(code)
    expect(arabicCopyForCode(code), code).toBeNull()
  })

  it('answers nothing for a code the map does not speak', () => {
    // The control: without it, a lookup that answered every code would make
    // the assertions above pass for the wrong reason.
    expect(arabicCopyForCode('SOMETHING_NEW_FROM_THE_API')).toBeNull()
  })
})
