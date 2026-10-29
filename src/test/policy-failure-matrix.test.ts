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
import { wirePolicy } from '@/test/msw/document-wire-fixtures'
import type {
  DocumentPolicyBlocker,
  DocumentType,
} from '@/shared/documents/types/document-wire.types'
import type { CapabilityOperation } from '@/modules/warehouse/types/warehouse.types'

/**
 * Critical policy failure matrix (e24-t07).
 *
 * "Policy failure" in EIAMS means a server-emitted `PolicyPolicyBlocker` (a hard
 * stop) or an advisory (a warning). The live policy types `PolicyBlocker.code`
 * as an unconstrained `string`, so nothing pins the legal vocabulary and no test
 * enumerated it. This file is that enumeration.
 *
 * Every payload here is a WIRE record — `{ action, code, message }` for a
 * blocker, `{ code, message, countId, warehouseId }` for an advisory, `status`
 * for the policy's own status — because that is what the API serves and what the
 * application reads. Arabic is resolved from the CODE through the governed
 * `error-copy-ar.ts` table, never from a message field, so an expectation here
 * is an expectation about a code the copy table has an entry for.
 *
 * ## Scope of what is asserted
 *
 * The three preflight gates (balance, capability, signed-original) plus the
 * action-level presentation decision, across **all six** document types, plus
 * the rule that an advisory never blocks. The action-bar and attachment-panel
 * *rendering* of the same payloads is covered by their own suites
 * (`lifecycle-action-bar.test.tsx`, `attachment-panel.test.tsx`); the
 * cross-surface consistency checks live in `policy-failure-surfaces.test.tsx`.
 *
 * Every expectation is evaluated through the production predicates, so this
 * suite cannot pass by restating the rules it exists to check.
 */

/** The canonical Arabic the signed-original gate renders for an unmapped code. */
const SIGNED_GATE_DEFAULT_BLOCKED = 'النسخة الموقعة من المستند مطلوبة قبل الترحيل.'

/** A blocker in the live wire spelling. */
function blocker(
  code: string,
  message = 'The server explains the failure in English.',
): DocumentPolicyBlocker {
  return { action: 'Post', code, message }
}

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
const POLICY_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c8'

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
  wirePolicy({ documentId: POLICY_DOCUMENT_ID, status: 'Submitted', signedOriginalSatisfied: true })

const missingOriginalPolicy = () =>
  wirePolicy({
    documentId: POLICY_DOCUMENT_ID,
    status: 'Submitted',
    signedOriginalSatisfied: false,
    blockers: [blocker('document.signed_original_missing')],
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

  it("classifies the backend's own dotted signed-copy code as a signed-original gate reason", () => {
    // The backend states the same requirement under its own code; the canonical
    // vocabulary accepts it so no surface has to compare it against a literal.
    expect(isSignedOriginalBlockerCode('WarehouseDocuments.SignedCopyRequired')).toBe(true)
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
        const gate = signedOriginalGate(
          wirePolicy({
            documentId: POLICY_DOCUMENT_ID,
            status: 'Submitted',
            signedOriginalSatisfied: false,
            blockers: [blocker(variant)],
          }),
        )
        expect(gate.status).toBe('blocked')
        // None of the gate codes has a governed Arabic entry, so the canonical
        // sentence renders rather than the server's English message.
        expect(gate.messageAr).toBe(SIGNED_GATE_DEFAULT_BLOCKED)
        expect(gate.blockerCode).toBe(variant)
      })
    }
  }

  it('ignores a non-signed-original blocker and falls back to the default message', () => {
    const gate = signedOriginalGate(
      wirePolicy({
        documentId: POLICY_DOCUMENT_ID,
        status: 'Submitted',
        signedOriginalSatisfied: false,
        blockers: [blocker('insufficient_balance')],
      }),
    )
    expect(gate.status).toBe('blocked')
    expect(gate.messageAr).toBe(SIGNED_GATE_DEFAULT_BLOCKED)
    expect(gate.blockerCode).toBeNull()
  })

  it('exposes the matched code so a consumer can dedupe by code, not by text', () => {
    const gate = signedOriginalGate(missingOriginalPolicy())
    expect(gate.blockerCode).toBe('document.signed_original_missing')
  })

  it("blocks on the backend's own dotted signed-copy code and exposes it", () => {
    const gate = signedOriginalGate(
      wirePolicy({
        documentId: POLICY_DOCUMENT_ID,
        status: 'Submitted',
        signedOriginalSatisfied: false,
        blockers: [blocker('WarehouseDocuments.SignedCopyRequired')],
      }),
    )
    expect(gate.status).toBe('blocked')
    // That code HAS a governed Arabic entry, so the copy table speaks instead
    // of the canonical default the unmapped gate codes fall back to.
    expect(gate.messageAr).toBe('يجب إرفاق النسخة الموقعة قبل الترحيل.')
    expect(gate.blockerCode).toBe('WarehouseDocuments.SignedCopyRequired')
  })

  it('reports no code when it fell back to the default message', () => {
    const gate = signedOriginalGate(
      wirePolicy({
        documentId: POLICY_DOCUMENT_ID,
        status: 'Submitted',
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
      message: 'An inventory count covers the scope of this warehouse.',
      countId: '00000000-0000-4000-8000-0000000000ad',
      warehouseId: '00000000-0000-4000-8000-0000000000ad',
    }
    for (const type of ALL_DOCUMENT_TYPES) {
      const preflight = evaluateDocumentPreflight({
        lines: [line()],
        documentType: type,
        policy: wirePolicy({
          documentId: POLICY_DOCUMENT_ID,
          status: 'Submitted',
          signedOriginalSatisfied: true,
          blockers: [],
          warnings: [advisory],
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
      policy: wirePolicy({
        documentId: POLICY_DOCUMENT_ID,
        status: 'Submitted',
        signedOriginalSatisfied: true,
        blockers: [blocker('WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED')],
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
      const decision = evaluateActionDecision(wirePolicy({ documentId: 'd', status }), 'Post', deny)
      expect(decision.presentation, status).toBe('Hidden')
      expect(decision.reasonAr).toBeNull()
    }
  })

  it('hides an action the server marked Hidden', () => {
    const policy = wirePolicy({ documentId: 'd', status: 'Draft' })
    const decision = evaluateActionDecision(
      {
        ...policy,
        actions: [
          {
            action: 'Post',
            allowed: false,
            confirmationRequired: false,
            presentation: 'Hidden',
            reason: 'Not available in this state.',
            reasonCode: 'STATE_OR_PERMISSION_NOT_ALLOWED',
            reasonRequired: false,
          },
        ],
      },
      'Post',
      allow,
    )
    expect(decision.presentation).toBe('Hidden')
  })

  it('disables with the reason its code resolves to, never with an invented one', () => {
    const policy = wirePolicy({ documentId: 'd', status: 'Submitted' })
    const decision = evaluateActionDecision(
      {
        ...policy,
        actions: [
          {
            action: 'Post',
            allowed: false,
            confirmationRequired: false,
            presentation: 'Disabled',
            reason: 'The signed copy is required before posting.',
            reasonCode: 'WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED',
            reasonRequired: false,
          },
        ],
      },
      'Post',
      allow,
    )
    expect(decision.presentation).toBe('Disabled')
    // Resolved from `reasonCode` through the governed copy table — the English
    // `reason` the server sent is never rendered.
    expect(decision.reasonAr).toBe('يجب إرفاق النسخة الموقعة قبل الترحيل.')
    expect(decision.reasonAr).not.toBe('The signed copy is required before posting.')
  })

  it('never enables an action while the policy is undetermined', () => {
    const decision = evaluateActionDecision(null, 'Post', allow)
    expect(decision.presentation).toBe('Disabled')
    expect(decision.reasonAr).toBeNull()
  })

  it('hides an action the policy does not describe at all', () => {
    const policy = wirePolicy({ documentId: 'd', status: 'Draft' })
    const decision = evaluateActionDecision({ ...policy, actions: [] }, 'Post', allow)
    expect(decision.presentation).toBe('Hidden')
  })

  it('enables only when permission and policy both agree', () => {
    // A Submitted document with the signed original already satisfied is the one
    // case where the server presents Post as Enabled.
    const policy = wirePolicy({
      documentId: 'd',
      status: 'Submitted',
      signedOriginalSatisfied: true,
    })
    const decision = evaluateActionDecision(policy, 'Post', allow)
    expect(decision.presentation).toBe('Enabled')
  })

  it('disables Post on a Submitted document whose signed original is unmet', () => {
    const decision = evaluateActionDecision(missingOriginalPolicy(), 'Post', allow)
    expect(decision.presentation).toBe('Disabled')
    // F-15: the server's own Arabic `reason` (mirrored by the fixture from
    // `PolicyReasonAr`) is preferred over the governed code copy.
    expect(decision.reasonAr).toBe('يجب إرفاق النسخة الموقعة من المستند قبل الرصد.')
  })

  it('renders no reason at all when the server reason code has no governed copy', () => {
    const policy = wirePolicy({
      documentId: 'd',
      status: 'Submitted',
      signedOriginalSatisfied: false,
      actions: [
        {
          action: 'Post',
          allowed: false,
          confirmationRequired: false,
          presentation: 'Disabled',
          reason: 'Posting is blocked.',
          reasonCode: 'A_CODE_NOBODY_TRANSLATED',
          reasonRequired: false,
        },
      ],
    })
    const decision = evaluateActionDecision(policy, 'Post', allow)
    expect(decision.presentation).toBe('Disabled')
    expect(decision.reasonAr).toBeNull()
  })
})
