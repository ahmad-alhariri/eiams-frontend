import { describe, expect, it } from 'vitest'

import { compareAuditLogChronology, sortAuditLogsByChronology } from '@/test/msw/audit-chronology'
import { createAuditLog, fixtureUuid } from '@/test/msw/factories'

/**
 * Audit chronology (EPIC G7 port from `src/mocks/handlers.ts`).
 *
 * The behaviour under test is a total order over two immutable fields, because
 * `occurredAt` collides inside a single transaction and a page-sorted list with
 * an ambiguous order can repeat one row and drop another.
 */

function audit(occurredAt: string, sequence: number) {
  return createAuditLog({ auditLogId: fixtureUuid(sequence), occurredAt })
}

describe('audit chronology comparator', () => {
  it('orders newest first by occurredAt', () => {
    const logs = [
      audit('2026-01-01T00:00:00.000Z', 81),
      audit('2026-01-03T00:00:00.000Z', 83),
      audit('2026-01-02T00:00:00.000Z', 82),
    ]

    expect(sortAuditLogsByChronology(logs).map((log) => log.auditLogId)).toEqual([
      fixtureUuid(83),
      fixtureUuid(82),
      fixtureUuid(81),
    ])
  })

  it('breaks a shared occurredAt tie on the auditLogId, descending', () => {
    const occurredAt = '2026-01-02T09:00:00.000Z'
    const logs = [audit(occurredAt, 81), audit(occurredAt, 83), audit(occurredAt, 82)]

    // Without the tie-break these three are indistinguishable to the sort and
    // come back in input order, so an ascending or absent tie-break fails here.
    expect(sortAuditLogsByChronology(logs).map((log) => log.auditLogId)).toEqual([
      fixtureUuid(83),
      fixtureUuid(82),
      fixtureUuid(81),
    ])
    expect(sortAuditLogsByChronology([...logs].reverse()).map((log) => log.auditLogId)).toEqual([
      fixtureUuid(83),
      fixtureUuid(82),
      fixtureUuid(81),
    ])
  })

  it('is a total order: every pair of distinct rows has a non-zero comparison', () => {
    const rows = [
      { auditLogId: fixtureUuid(81), occurredAt: '2026-01-01T00:00:00.000Z' },
      { auditLogId: fixtureUuid(82), occurredAt: '2026-01-02T00:00:00.000Z' },
      { auditLogId: fixtureUuid(83), occurredAt: '2026-01-02T00:00:00.000Z' },
      { auditLogId: fixtureUuid(84), occurredAt: '2026-01-03T00:00:00.000Z' },
    ]

    for (const a of rows) {
      for (const b of rows) {
        const forward = compareAuditLogChronology(a, b)
        if (a.auditLogId === b.auditLogId) {
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
    expect(logs.map((log) => log.auditLogId)).toEqual([fixtureUuid(81), fixtureUuid(82)])
    expect(sorted.map((log) => log.auditLogId)).toEqual([fixtureUuid(82), fixtureUuid(81)])
  })

  it('paginates stably: the same page boundary never repeats or drops a row', () => {
    const occurredAt = '2026-01-02T09:00:00.000Z'
    // Five rows, three sharing one timestamp: the shape that broke the old order.
    const ledger = [
      audit('2026-01-01T00:00:00.000Z', 80),
      audit(occurredAt, 81),
      audit(occurredAt, 82),
      audit(occurredAt, 83),
      audit('2026-01-03T00:00:00.000Z', 84),
    ]

    const firstPage = sortAuditLogsByChronology(ledger)
      .slice(0, 2)
      .map((log) => log.auditLogId)
    const secondPage = sortAuditLogsByChronology(ledger)
      .slice(2, 4)
      .map((log) => log.auditLogId)

    expect(firstPage).toEqual([fixtureUuid(84), fixtureUuid(83)])
    expect(secondPage).toEqual([fixtureUuid(82), fixtureUuid(81)])
    expect(new Set([...firstPage, ...secondPage]).size).toBe(4)
  })
})
