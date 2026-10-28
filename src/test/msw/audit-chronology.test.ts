import { describe, expect, it } from 'vitest'

import { compareAuditLogChronology, sortAuditLogsByChronology } from '@/test/msw/audit-chronology'
import { createAuditLog, fixtureUuid } from '@/test/msw/factories'

/**
 * Audit chronology (EPIC G7 port from `src/mocks/handlers.ts`).
 *
 * The behaviour under test is a total order over two immutable fields, because
 * `createdAtUtc` collides inside a single transaction and a page-sorted list
 * with an ambiguous order can repeat one row and drop another.
 */

function audit(createdAtUtc: string, sequence: number) {
  return createAuditLog({ id: fixtureUuid(sequence), createdAtUtc })
}

describe('audit chronology comparator', () => {
  it('orders newest first by createdAtUtc', () => {
    const logs = [
      audit('2026-01-01T00:00:00.000Z', 81),
      audit('2026-01-03T00:00:00.000Z', 83),
      audit('2026-01-02T00:00:00.000Z', 82),
    ]

    expect(sortAuditLogsByChronology(logs).map((log) => log.id)).toEqual([
      fixtureUuid(83),
      fixtureUuid(82),
      fixtureUuid(81),
    ])
  })

  it('breaks a shared createdAtUtc tie on the id, descending', () => {
    const createdAtUtc = '2026-01-02T09:00:00.000Z'
    const logs = [audit(createdAtUtc, 81), audit(createdAtUtc, 83), audit(createdAtUtc, 82)]

    // Without the tie-break these three are indistinguishable to the sort and
    // come back in input order, so an ascending or absent tie-break fails here.
    expect(sortAuditLogsByChronology(logs).map((log) => log.id)).toEqual([
      fixtureUuid(83),
      fixtureUuid(82),
      fixtureUuid(81),
    ])
    expect(sortAuditLogsByChronology([...logs].reverse()).map((log) => log.id)).toEqual([
      fixtureUuid(83),
      fixtureUuid(82),
      fixtureUuid(81),
    ])
  })

  it('is a total order: every pair of distinct rows has a non-zero comparison', () => {
    const rows = [
      { id: fixtureUuid(81), createdAtUtc: '2026-01-01T00:00:00.000Z' },
      { id: fixtureUuid(82), createdAtUtc: '2026-01-02T00:00:00.000Z' },
      { id: fixtureUuid(83), createdAtUtc: '2026-01-02T00:00:00.000Z' },
      { id: fixtureUuid(84), createdAtUtc: '2026-01-03T00:00:00.000Z' },
    ]

    for (const a of rows) {
      for (const b of rows) {
        const forward = compareAuditLogChronology(a, b)
        if (a.id === b.id) {
          expect(forward).toBe(0)
          continue
        }
        expect(forward === 0).toBe(false)
        // Antisymmetry is what makes the order total; a comparator that is not
        // antisymmetric lets the engine's sort pick the order, and page 2 of a
        // paged ledger then repeats page 1's rows.
        expect(Math.sign(forward)).toBe(-Math.sign(compareAuditLogChronology(b, a)))
      }
    }
  })

  it('returns a new sorted array and leaves the input untouched', () => {
    const logs = [audit('2026-01-01T00:00:00.000Z', 81), audit('2026-01-02T00:00:00.000Z', 82)]

    const sorted = sortAuditLogsByChronology(logs)

    expect(sorted).not.toBe(logs)
    expect(logs.map((log) => log.id)).toEqual([fixtureUuid(81), fixtureUuid(82)])
    expect(sorted.map((log) => log.id)).toEqual([fixtureUuid(82), fixtureUuid(81)])
  })

  it('paginates stably: the same page boundary never repeats or drops a row', () => {
    const createdAtUtc = '2026-01-02T09:00:00.000Z'
    // Five rows, three sharing one timestamp: the shape that broke the old order.
    const ledger = [
      audit('2026-01-01T00:00:00.000Z', 80),
      audit(createdAtUtc, 81),
      audit(createdAtUtc, 82),
      audit(createdAtUtc, 83),
      audit('2026-01-03T00:00:00.000Z', 84),
    ]

    const firstPage = sortAuditLogsByChronology(ledger)
      .slice(0, 2)
      .map((log) => log.id)
    const secondPage = sortAuditLogsByChronology(ledger)
      .slice(2, 4)
      .map((log) => log.id)

    expect(firstPage).toEqual([fixtureUuid(84), fixtureUuid(83)])
    expect(secondPage).toEqual([fixtureUuid(82), fixtureUuid(81)])
    expect(new Set([...firstPage, ...secondPage]).size).toBe(4)
  })
})
