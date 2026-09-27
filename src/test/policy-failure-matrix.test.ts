import { describe, expect, it } from 'vitest'

import {
  capabilityOperationForDocumentType,
  evaluateActionDecision,
  evaluateBalanceGate,
  evaluateCapabilityGate,
  evaluateDocumentPreflight,
  isOutboundDocumentType,
  signedOriginalGate,
  SIGNED_GATE_MOOT_STATUSES,
  type CapabilityEvaluation,
  type PreflightLineShape,
} from '@/shared/documents/document-policy-gates'
import {
  ACTIVE_SOFT_FREEZE_ADVISORY_CODE,
  isSignedOriginalBlockerCode,
  SIGNED_ORIGINAL_BLOCKER_CODES,
  signedOriginalBlockerCodeVariants,
} from '@/shared/documents/policy-blocker-codes'
import { createDocumentPolicy, createPolicyBlocker } from '@/test/msw/factories'
import type { CapabilityOperation, DocumentType } from '@/shared/types/generated/eiams-v1'

/**
 * Critical policy failure matrix (e24-t07).
 *
 * "Policy failure" in EIAMS means a server-emitted `PolicyBlocker` (a hard stop)
 * or `OperationalAdvisory` (a warning). The OpenAPI contract types
 * `PolicyBlocker.code` as an unconstrained `string`, so nothing pinned the legal
 * vocabulary and no test enumerated it. This file is that enumeration.
 *
 * ## Scope of what is asserted
 *
 * The three preflight gates (balance, capability, signed-original) plus the
 * action-level presentation decision, across **all six** document types, plus
 * the rule that an advisory never blocks. The action-bar and attachment-panel
 * *rendering* of the same payloads is covered by their own suites
 * (`lifecycle-action-bar.test.tsx`, `adjustment-action-bar.test.tsx`,
 * `attachment-panel.test.tsx`); the cross-surface consistency checks live in
 * `policy-failure-surfaces.test.tsx`.
 *
 * Every expectation is evaluated through the production predicates, so this
 * suite cannot pass by restating the rules it exists to check.
 */

const ALL_DOCUMENT_TYPES: readonly DocumentType[] = [
  'Receiving',
  'Issue',
  'Transfer',
  'Opening',
  'Return',
  'Adjustment',
]

/** v1 outbound types carry a balance ceiling; everything else does not. */
const OUTBOUND: readonly DocumentType[] = ['Issue', 'Transfer']

/** v1 capability operations; Adjustment and Opening have none. */
const CAPABILITY_OPERATION: Partial<Record<DocumentType, CapabilityOperation>> = {
  Receiving: 'Receiving',
  Issue: 'Issue',
  Transfer: 'Transfer',
  Return: 'Return',
}

const DOMAIN_ID = '10000000-0000-4000-8000-0000000000d0'

function line(overrides: Partial<PreflightLineShape> = {}): PreflightLineShape {
  return {
    quantity: 5,
    availableBalance: 10,
    materialNameAr: 'ورق تصوير A4',
    materialDomainId: DOMAIN_ID,
    ...overrides,
  }
}

const satisfiedPolicy = () =>
  createDocumentPolicy({
    documentId: '00000000-0000-4000-8000-0000000000c8',
    documentStatus: 'Submitted',
    signedOriginalSatisfied: true,
    blockers: [],
  })

const missingOriginalPolicy = () =>
  createDocumentPolicy({
    documentId: '00000000-0000-4000-8000-0000000000c8',
    documentStatus: 'Submitted',
    signedOriginalSatisfied: false,
  })

// ---------------------------------------------------------------------------
// Row 1 — the vocabulary itself
// ---------------------------------------------------------------------------

describe('policy failure vocabulary', () => {
  it('names exactly the three D-ATT-01 signed-original gate reasons', () => {
    expect([...SIGNED_ORIGINAL_BLOCKER_CODES]).toEqual([
      'signed_original_missing',
      'signed_original_invalid',
      'signed_original_immutable',
    ])
  })

  it('classifies every accepted spelling of every signed-original code', () => {
    for (const canonical of SIGNED_ORIGINAL_BLOCKER_CODES) {
      for (const variant of signedOriginalBlockerCodeVariants(canonical)) {
        expect(isSignedOriginalBlockerCode(variant), variant).toBe(true)
      }
    }
  })

  it('classifies no other code as a signed-original gate reason', () => {
    // Rejection matters more than acceptance: an unrecognised vocabulary must
    // never be silently treated as a recognised gate, or a future regression
    // would pass unnoticed.
    for (const code of [
      'insufficient_balance',
      'document.insufficient_balance',
      'SignedOriginalRequired',
      'signed_original_unknown',
      'signed_original',
      'document.signed_original',
      '',
      'SIGNED_ORIGINAL_MISSING',
    ]) {
      expect(isSignedOriginalBlockerCode(code), code).toBe(false)
    }
  })

  it('names the single v1 advisory code', () => {
    expect(ACTIVE_SOFT_FREEZE_ADVISORY_CODE).toBe('ActiveSoftFreeze')
  })
})

// ---------------------------------------------------------------------------
// Row 2 — signed-original gate, per blocker code
// ---------------------------------------------------------------------------

describe('signed-original gate resolves every blocker code to blocked', () => {
  for (const canonical of SIGNED_ORIGINAL_BLOCKER_CODES) {
    for (const variant of signedOriginalBlockerCodeVariants(canonical)) {
      it(`blocks on ${variant}`, () => {
        const blocker = createPolicyBlocker({ code: variant, messageAr: 'سبب محدد من الخادم.' })
        const gate = signedOriginalGate(
          createDocumentPolicy({
            documentId: '00000000-0000-4000-8000-0000000000c8',
            documentStatus: 'Submitted',
            signedOriginalSatisfied: false,
            blockers: [blocker],
          }),
        )
        expect(gate.status).toBe('blocked')
        expect(gate.messageAr).toBe('سبب محدد من الخادم.')
      })
    }
  }

  it('ignores a non-signed-original blocker and falls back to the default message', () => {
    const gate = signedOriginalGate(
      createDocumentPolicy({
        documentId: '00000000-0000-4000-8000-0000000000c8',
        documentStatus: 'Submitted',
        signedOriginalSatisfied: false,
        blockers: [createPolicyBlocker({ code: 'insufficient_balance' })],
      }),
    )
    expect(gate.status).toBe('blocked')
    expect(gate.messageAr).toBe('النسخة الموقعة من المستند مطلوبة قبل الترحيل.')
  })

  it('exposes the matched code so a consumer can dedupe by code, not by text', () => {
    const gate = signedOriginalGate(missingOriginalPolicy())
    expect(gate.blockerCode).toBe('document.signed_original_missing')
  })

  it('reports no code when it fell back to the default message', () => {
    const gate = signedOriginalGate(
      createDocumentPolicy({
        documentId: '00000000-0000-4000-8000-0000000000c8',
        documentStatus: 'Submitted',
        signedOriginalSatisfied: false,
        blockers: [],
      }),
    )
    expect(gate.blockerCode).toBeNull()
  })

  it('is indeterminate while the policy has not loaded, never enabled', () => {
    const gate = signedOriginalGate(null)
    expect(gate.status).toBe('unknown')
    expect(gate.blockerCode).toBeNull()
  })

  for (const status of [...SIGNED_GATE_MOOT_STATUSES] as const) {
    it(`goes moot at ${status} so no stale requirement is shown`, () => {
      const gate = signedOriginalGate(missingOriginalPolicy(), status)
      expect(gate.status).toBe('pass')
      expect(gate.messageAr).toBeNull()
    })
  }
})

// ---------------------------------------------------------------------------
// Row 3 — balance ceiling, every document type
// ---------------------------------------------------------------------------

describe('balance ceiling applies to exactly the outbound types', () => {
  it('classifies outbound and inbound types exhaustively', () => {
    for (const type of ALL_DOCUMENT_TYPES) {
      expect(isOutboundDocumentType(type), type).toBe(OUTBOUND.includes(type))
    }
  })

  for (const type of ALL_DOCUMENT_TYPES) {
    const outbound = OUTBOUND.includes(type)
    it(`${type} ${outbound ? 'blocks' : 'never blocks'} an over-balance line`, () => {
      const gate = evaluateBalanceGate([line({ quantity: 999, availableBalance: 1 })], type)
      expect(gate.gate).toBe('balance')
      expect(gate.status).toBe(outbound ? 'blocked' : 'pass')
      expect(gate.blockerCode).toBeNull()
    })
  }

  for (const type of ALL_DOCUMENT_TYPES) {
    const outbound = OUTBOUND.includes(type)
    it(`${type} ${outbound ? 'warns' : 'passes cleanly'} on a null balance`, () => {
      const gate = evaluateBalanceGate([line({ availableBalance: null })], type)
      expect(gate.status).toBe(outbound ? 'unknown' : 'pass')
    })
  }

  it('never blocks on an exactly-equal balance (the ceiling is inclusive)', () => {
    expect(
      evaluateBalanceGate([line({ quantity: 10, availableBalance: 10 })], 'Issue').status,
    ).toBe('pass')
  })

  it('blocks when any single line is over, not only the first', () => {
    const gate = evaluateBalanceGate(
      [
        line({ quantity: 1, availableBalance: 100 }),
        line({ quantity: 50, availableBalance: 10 }),
        line({ quantity: 1, availableBalance: 100 }),
      ],
      'Transfer',
    )
    expect(gate.status).toBe('blocked')
  })
})

// ---------------------------------------------------------------------------
// Row 4 — capability gate, every document type
// ---------------------------------------------------------------------------

describe('capability gate maps every document type to its v1 operation', () => {
  it('maps exhaustively', () => {
    for (const type of ALL_DOCUMENT_TYPES) {
      expect(capabilityOperationForDocumentType(type), type).toBe(CAPABILITY_OPERATION[type])
    }
  })

  for (const type of ALL_DOCUMENT_TYPES) {
    const operation = CAPABILITY_OPERATION[type]
    it(`${type} is ${operation === undefined ? 'not applicable' : 'gated on ' + operation}`, () => {
      const blocked: readonly CapabilityEvaluation[] = [
        { domainId: DOMAIN_ID, status: 'blocked', messageAr: 'القدرة غير متوفرة.' },
      ]
      const gate = evaluateCapabilityGate([line()], blocked, operation)
      expect(gate.gate).toBe('capability')
      expect(gate.status).toBe(operation === undefined ? 'pass' : 'blocked')
      expect(gate.blockerCode).toBeNull()
    })
  }

  for (const type of ALL_DOCUMENT_TYPES) {
    it(`${type} reports ${CAPABILITY_OPERATION[type] === undefined ? 'not applicable' : 'unknown'} while a participating domain is undetermined`, () => {
      // A type with no v1 capability operation short-circuits to `pass`: there is
      // no capability to be uncertain about.
      const gate = evaluateCapabilityGate([line()], [], CAPABILITY_OPERATION[type])
      expect(gate.status).toBe(CAPABILITY_OPERATION[type] === undefined ? 'pass' : 'unknown')
    })
  }

  it('stays unknown but non-blocking for read-only lines that carry no domain', () => {
    const gate = evaluateCapabilityGate([line({ materialDomainId: null })], [], 'Issue')
    expect(gate.status).toBe('unknown')
    expect(gate.messageAr).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Row 5 — aggregation
// ---------------------------------------------------------------------------

describe('preflight aggregates to blocked, then warn, then clear', () => {
  it('blocks on an over-balance issue even when the policy is satisfied', () => {
    const preflight = evaluateDocumentPreflight({
      lines: [line({ quantity: 99, availableBalance: 1 })],
      documentType: 'Issue',
      policy: satisfiedPolicy(),
      capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
    })
    expect(preflight.status).toBe('blocked')
    expect(preflight.gates.find((g) => g.gate === 'balance')?.status).toBe('blocked')
  })

  it('blocks on a missing signed original even when the balance is fine', () => {
    const preflight = evaluateDocumentPreflight({
      lines: [line()],
      documentType: 'Issue',
      policy: missingOriginalPolicy(),
      capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
    })
    expect(preflight.status).toBe('blocked')
  })

  it('warns when a gate is merely undetermined and nothing blocks', () => {
    const preflight = evaluateDocumentPreflight({
      lines: [line({ availableBalance: null })],
      documentType: 'Issue',
      policy: satisfiedPolicy(),
      capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
    })
    expect(preflight.status).toBe('warn')
  })

  it('is clear only when every gate passes', () => {
    const preflight = evaluateDocumentPreflight({
      lines: [line()],
      documentType: 'Issue',
      policy: satisfiedPolicy(),
      capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
    })
    expect(preflight.status).toBe('clear')
    expect(preflight.gates.every((gate) => gate.status === 'pass')).toBe(true)
  })

  it('always evaluates all three gates for every document type', () => {
    for (const type of ALL_DOCUMENT_TYPES) {
      const preflight = evaluateDocumentPreflight({
        lines: [line()],
        documentType: type,
        policy: satisfiedPolicy(),
        capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
      })
      expect(preflight.gates.map((gate) => gate.gate).sort(), type).toEqual([
        'balance',
        'capability',
        'signedOriginal',
      ])
    }
  })
})

// ---------------------------------------------------------------------------
// Row 6 — advisories never block
// ---------------------------------------------------------------------------

describe('an advisory is a warning and never a gate input', () => {
  it('passes ActiveSoftFreeze through without ever blocking', () => {
    const advisory = {
      code: ACTIVE_SOFT_FREEZE_ADVISORY_CODE,
      severity: 'Warning' as const,
      messageAr: 'هناك جرد نشط يغطي نطاق هذا المستودع.',
      countId: '00000000-0000-4000-8000-0000000000ad',
      countReference: 'JRY-2026-014',
      overlapState: 'Provisional' as const,
      scopeSummaryAr: 'مستودع دمشق المركزي',
      warehouseId: '00000000-0000-4000-8000-0000000000w1',
    }
    for (const type of ALL_DOCUMENT_TYPES) {
      const preflight = evaluateDocumentPreflight({
        lines: [line()],
        documentType: type,
        policy: createDocumentPolicy({
          documentId: '00000000-0000-4000-8000-0000000000c8',
          documentStatus: 'Submitted',
          signedOriginalSatisfied: true,
          blockers: [],
          advisories: [advisory],
        }),
        capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
      })
      expect(preflight.advisories, type).toEqual([advisory])
      // A SoftFreeze must never be promoted into a block or a warning state.
      expect(preflight.status, type).toBe('clear')
      expect(preflight.blockers, type).toEqual([])
    }
  })

  it('keeps advisories separate from blockers so no surface can confuse them', () => {
    const preflight = evaluateDocumentPreflight({
      lines: [line()],
      documentType: 'Issue',
      policy: createDocumentPolicy({
        documentId: '00000000-0000-4000-8000-0000000000c8',
        documentStatus: 'Submitted',
        signedOriginalSatisfied: true,
        blockers: [createPolicyBlocker()],
      }),
      capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
    })
    expect(preflight.blockers).toHaveLength(1)
    expect(preflight.advisories).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Row 7 — action presentation
// ---------------------------------------------------------------------------

describe('action presentation follows the contract decision table', () => {
  const allow = () => true
  const deny = () => false

  it('hides an action the session may not perform', () => {
    for (const status of ['Draft', 'Submitted', 'Posted', 'Reversed', 'Cancelled'] as const) {
      const decision = evaluateActionDecision(
        createDocumentPolicy({ documentId: 'd', documentStatus: status }),
        'Post',
        deny,
      )
      expect(decision.presentation, status).toBe('Hidden')
      expect(decision.reasonAr).toBeNull()
    }
  })

  it('hides an action the server marked Hidden', () => {
    const policy = createDocumentPolicy({ documentId: 'd', documentStatus: 'Draft' })
    const decision = evaluateActionDecision(
      {
        ...policy,
        actions: [
          {
            action: 'Post',
            allowed: false,
            confirmationRequired: false,
            presentation: 'Hidden',
            reasonAr: 'غير متاح.',
            reasonCode: 'state_not_draft',
            reasonRequired: false,
          },
        ],
      },
      'Post',
      allow,
    )
    expect(decision.presentation).toBe('Hidden')
  })

  it('disables with the server Arabic reason, never with an invented one', () => {
    const policy = createDocumentPolicy({ documentId: 'd', documentStatus: 'Submitted' })
    const decision = evaluateActionDecision(
      {
        ...policy,
        actions: [
          {
            action: 'Post',
            allowed: false,
            confirmationRequired: false,
            presentation: 'Disabled',
            reasonAr: 'سبب من الخادم.',
            reasonCode: 'document.signed_original_missing',
            reasonRequired: false,
          },
        ],
      },
      'Post',
      allow,
    )
    expect(decision.presentation).toBe('Disabled')
    expect(decision.reasonAr).toBe('سبب من الخادم.')
  })

  it('never enables an action while the policy is undetermined', () => {
    const decision = evaluateActionDecision(null, 'Post', allow)
    expect(decision.presentation).toBe('Disabled')
    expect(decision.reasonAr).toBeNull()
  })

  it('hides an action the policy does not describe at all', () => {
    const policy = createDocumentPolicy({ documentId: 'd', documentStatus: 'Draft' })
    const decision = evaluateActionDecision({ ...policy, actions: [] }, 'Post', allow)
    expect(decision.presentation).toBe('Hidden')
  })

  it('enables only when permission and policy both agree', () => {
    // A Submitted document with the signed original already satisfied is the one
    // case where the server presents Post as Enabled.
    const policy = createDocumentPolicy({
      documentId: 'd',
      documentStatus: 'Submitted',
      signedOriginalSatisfied: true,
    })
    const decision = evaluateActionDecision(policy, 'Post', allow)
    expect(decision.presentation).toBe('Enabled')
  })

  it('disables Post on a Submitted document whose signed original is unmet', () => {
    const decision = evaluateActionDecision(
      createDocumentPolicy({
        documentId: 'd',
        documentStatus: 'Submitted',
        signedOriginalSatisfied: false,
      }),
      'Post',
      allow,
    )
    expect(decision.presentation).toBe('Disabled')
    expect(decision.reasonAr).toBeTruthy()
  })
})
