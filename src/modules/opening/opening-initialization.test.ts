import { describe, expect, it } from 'vitest'

import {
  blocksNewOpeningDocument,
  openingInitializationBlockMessageAr,
} from './opening-initialization'

import type { WarehouseInitializationStatus } from '@/modules/warehouse/types/warehouse.api-types'

const EVERY_STATUS: readonly WarehouseInitializationStatus[] = [
  'NotInitialized',
  'Initialized',
  'ZeroStock',
  'Reversed',
]

describe('blocksNewOpeningDocument', () => {
  it('blocks on Initialized, because a positive Opening already established the baseline', () => {
    expect(blocksNewOpeningDocument('Initialized')).toBe(true)
  })

  it('blocks on ZeroStock, because the explicit zero-stock path is also an initialization', () => {
    expect(blocksNewOpeningDocument('ZeroStock')).toBe(true)
  })

  it('does not block on NotInitialized', () => {
    expect(blocksNewOpeningDocument('NotInitialized')).toBe(false)
  })

  it('does not block on Reversed, because the wire does not say re-initialization is refused', () => {
    // `initialization-read-endpoint.md` reports Reversed with the source
    // document preserved for audit and notes re-initialization is "not
    // permitted by the default policy" — which is not the same as the wire
    // refusing it. Blocking here would let the browser invent a rule.
    expect(blocksNewOpeningDocument('Reversed')).toBe(false)
  })

  it('does not block while the state is still unknown', () => {
    // The read is advisory (decision 3): an unrefused load must leave the form
    // usable rather than blocking the user on a guess. The server stays the
    // authority and will refuse the submission if it disagrees.
    expect(blocksNewOpeningDocument(undefined)).toBe(false)
    expect(blocksNewOpeningDocument(null)).toBe(false)
  })

  it('is total over the status union', () => {
    for (const status of EVERY_STATUS) {
      expect(typeof blocksNewOpeningDocument(status), status).toBe('boolean')
    }
  })
})

describe('openingInitializationBlockMessageAr', () => {
  it('explains Initialized in Arabic and points at the Adjustment workflow', () => {
    const message = openingInitializationBlockMessageAr('Initialized')
    expect(message).not.toBeNull()
    expect(message).toContain('مستند تسوية')
    expect(message).toMatch(/^[\u0600-\u06FF0-9\s،.]+$/u)
  })

  it('explains ZeroStock without claiming an Opening document exists', () => {
    const message = openingInitializationBlockMessageAr('ZeroStock')
    expect(message).not.toBeNull()
    // The zero-stock path writes a state row, not a document. Saying "cannot
    // create a new Opening document" is correct; implying one already exists
    // would invent a record the server never created.
    expect(message).not.toMatch(/تم إنشاء|تم نشر|سند افتتاحي مسجل/u)
  })

  it('returns null for every state that does not block', () => {
    expect(openingInitializationBlockMessageAr('NotInitialized')).toBeNull()
    expect(openingInitializationBlockMessageAr('Reversed')).toBeNull()
    expect(openingInitializationBlockMessageAr(undefined)).toBeNull()
    expect(openingInitializationBlockMessageAr(null)).toBeNull()
  })

  it('never claims a write was rejected, because none has been attempted', () => {
    // The rule this repo already enforces for 409 copy: never assert whether a
    // write took effect. Here nothing was submitted, so the copy must only
    // describe the observed state.
    for (const status of ['Initialized', 'ZeroStock'] as const) {
      expect(openingInitializationBlockMessageAr(status)).not.toMatch(
        /تم رفض|رُفض الطلب|فشل الحفظ/u,
      )
    }
  })

  it('speaks no Latin characters', () => {
    for (const status of ['Initialized', 'ZeroStock'] as const) {
      expect(openingInitializationBlockMessageAr(status)).not.toMatch(/[A-Za-z]/u)
    }
  })

  it('gives the two blocking states distinguishable copy', () => {
    // Two different server situations the user must be able to tell apart: a
    // warehouse with a counted balance versus an empty one.
    expect(openingInitializationBlockMessageAr('Initialized')).not.toBe(
      openingInitializationBlockMessageAr('ZeroStock'),
    )
  })
})
