import { describe, expect, it } from 'vitest'

import {
  simulateAdjustmentDraftPolicy,
  SIGNED_ORIGINAL_MISSING_CODE,
  SIGNED_ORIGINAL_REQUIRED_AR,
  UNRELATED_BLOCKER_AR,
  UNRELATED_BLOCKER_CODE,
  type AdjustmentPolicyScenario,
} from '@/test/msw/adjustment-policy-simulator'
import { fixtureUuid } from '@/test/msw/factories'

/**
 * The four policy states a Draft adjustment can be asked for, asserted whole.
 *
 * Table-driven on purpose: these states are alternatives, and a test that checks
 * one per `it` block lets three of them rot silently while the fourth stays
 * green. One row per state, one assertion group per row, so a state that
 * changes fails as a row rather than as an unrelated named case.
 */

const DOCUMENT_ID = fixtureUuid(700)
const WAREHOUSE_ID = fixtureUuid(30)
const EVALUATED_AT = '2026-02-01T09:00:00.000Z'

const CASES: ReadonlyArray<{
  readonly state: string
  readonly scenario?: AdjustmentPolicyScenario
  readonly expected: {
    readonly presentation: 'Disabled' | 'Enabled'
    readonly allowed: boolean
    readonly blockerCodes: readonly string[]
    readonly advisoryCodes: readonly string[]
    readonly signedOriginalSatisfied: boolean
  }
}> = [
  {
    // (a) the default: no signed copy, so Post is blocked and the canonical
    // blocker code is the one the UI's policy-blocker table knows.
    state: 'default',
    expected: {
      allowed: false,
      blockerCodes: [SIGNED_ORIGINAL_MISSING_CODE],
      advisoryCodes: [],
      presentation: 'Disabled',
      signedOriginalSatisfied: false,
    },
  },
  {
    // (b) the soft freeze is an ADVISORY, so it must not block Post.
    state: 'ActiveSoftFreeze advisory',
    scenario: { simulateSoftFreeze: true },
    expected: {
      allowed: false,
      blockerCodes: [SIGNED_ORIGINAL_MISSING_CODE],
      advisoryCodes: ['ActiveSoftFreeze'],
      presentation: 'Disabled',
      signedOriginalSatisfied: false,
    },
  },
  {
    // (c) the state the action bar must survive: Post left Enabled while a
    // blocker is still listed — and the blocker is from another domain.
    state: 'Post Enabled alongside an unrelated blocker',
    scenario: { simulateEnabledWithBlocker: true },
    expected: {
      allowed: true,
      blockerCodes: [UNRELATED_BLOCKER_CODE],
      advisoryCodes: [],
      presentation: 'Enabled',
      signedOriginalSatisfied: true,
    },
  },
  {
    // (d) flags explicitly sent as `false` must behave exactly like no flags at
    // all — the dev mock read these off a request body, where a client that
    // always serialises its switches sends `false` rather than omitting them.
    state: 'no scenario flags sent',
    scenario: { simulateEnabledWithBlocker: false, simulateSoftFreeze: false },
    expected: {
      allowed: false,
      blockerCodes: [SIGNED_ORIGINAL_MISSING_CODE],
      advisoryCodes: [],
      presentation: 'Disabled',
      signedOriginalSatisfied: false,
    },
  },
]

describe('adjustment draft policy simulator (EPIC G7 port from the dev mock)', () => {
  it.each(CASES)('$state', ({ scenario, expected }) => {
    const policy = simulateAdjustmentDraftPolicy({
      documentId: DOCUMENT_ID,
      evaluatedAt: EVALUATED_AT,
      warehouseId: WAREHOUSE_ID,
      ...(scenario === undefined ? {} : { scenario }),
    })

    expect(policy).toMatchObject({
      documentId: DOCUMENT_ID,
      documentStatus: 'Draft',
      evaluatedAt: EVALUATED_AT,
      policyKind: 'Adjustment',
      rowVersion: 0,
      signedOriginalSatisfied: expected.signedOriginalSatisfied,
    })
    expect(policy.actions).toHaveLength(1)
    expect(policy.actions[0]).toMatchObject({
      action: 'Post',
      allowed: expected.allowed,
      confirmationRequired: true,
      presentation: expected.presentation,
      reasonRequired: false,
    })
    expect(policy.blockers.map((blocker) => blocker.code)).toEqual(expected.blockerCodes)
    expect(policy.advisories.map((advisory) => advisory.code)).toEqual(expected.advisoryCodes)
  })

  it('treats explicitly-false switches as no switches at all', () => {
    const base = { documentId: DOCUMENT_ID, evaluatedAt: EVALUATED_AT, warehouseId: WAREHOUSE_ID }

    expect(
      simulateAdjustmentDraftPolicy({
        ...base,
        scenario: { simulateEnabledWithBlocker: false, simulateSoftFreeze: false },
      }),
    ).toEqual(simulateAdjustmentDraftPolicy(base))
  })

  it('is pure: the same input twice yields structurally equal, non-identical policies', () => {
    const input = {
      documentId: DOCUMENT_ID,
      evaluatedAt: EVALUATED_AT,
      scenario: { simulateSoftFreeze: true },
      warehouseId: WAREHOUSE_ID,
    }
    const first = simulateAdjustmentDraftPolicy(input)
    const second = simulateAdjustmentDraftPolicy(input)

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(first.advisories[0]).not.toBe(second.advisories[0])
  })

  it('carries the signed-original reason code and Arabic copy on the blocked Post', () => {
    const policy = simulateAdjustmentDraftPolicy({
      documentId: DOCUMENT_ID,
      evaluatedAt: EVALUATED_AT,
      warehouseId: WAREHOUSE_ID,
    })

    expect(policy.actions[0]).toMatchObject({
      reasonAr: SIGNED_ORIGINAL_REQUIRED_AR,
      reasonCode: SIGNED_ORIGINAL_MISSING_CODE,
    })
    expect(policy.blockers[0]).toMatchObject({
      code: SIGNED_ORIGINAL_MISSING_CODE,
      field: 'attachmentType',
      messageAr: SIGNED_ORIGINAL_REQUIRED_AR,
    })
  })

  it('scopes the soft-freeze advisory to the requested warehouse and keeps it non-blocking', () => {
    const policy = simulateAdjustmentDraftPolicy({
      documentId: DOCUMENT_ID,
      evaluatedAt: EVALUATED_AT,
      warehouseId: WAREHOUSE_ID,
      scenario: { simulateSoftFreeze: true },
    })

    expect(policy.advisories[0]).toMatchObject({
      code: 'ActiveSoftFreeze',
      countReference: 'EIAMS-CNT-2026-0114',
      overlapState: 'Provisional',
      severity: 'Warning',
      warehouseId: WAREHOUSE_ID,
    })
    expect(policy.actions[0]).toMatchObject({ allowed: false, presentation: 'Disabled' })
  })

  it('combines both opt-in switches into one policy when both are requested', () => {
    const policy = simulateAdjustmentDraftPolicy({
      documentId: DOCUMENT_ID,
      evaluatedAt: EVALUATED_AT,
      warehouseId: WAREHOUSE_ID,
      scenario: { simulateEnabledWithBlocker: true, simulateSoftFreeze: true },
    })

    expect(policy.actions[0]).toMatchObject({ allowed: true, presentation: 'Enabled' })
    expect(policy.blockers.map((blocker) => blocker.code)).toEqual([UNRELATED_BLOCKER_CODE])
    expect(policy.blockers[0]).toMatchObject({ field: null, messageAr: UNRELATED_BLOCKER_AR })
    expect(policy.advisories.map((advisory) => advisory.code)).toEqual(['ActiveSoftFreeze'])
  })
})
