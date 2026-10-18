import { describe, expect, it } from 'vitest'

import {
  actionAvailabilityReasonAr,
  evaluateActionDecision,
  evaluateBalanceGate,
  evaluateCapabilityGate,
  evaluateDocumentPreflight,
  signedOriginalGate,
  type CapabilityEvaluation,
  type DocumentPreflightInput,
  type PreflightLineShape,
} from '@/shared/documents/document-policy-gates'
import { arabicCopyForCode } from '@/shared/api/error-copy-ar'
import { wirePolicy } from '@/test/msw/document-wire-fixtures'
import type {
  DocumentActionAvailability,
  DocumentPolicy,
  DocumentPolicyBlocker,
} from '@/shared/documents/types/document-wire.types'

const POLICY_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c8'

/**
 * The canonical Arabic the signed-original gate falls back to when the matched
 * blocker code has no governed entry in `error-copy-ar.ts`. The live
 * `PolicyBlocker` carries an English `message` and no `messageAr`, and the
 * repository's decision is that Arabic is frontend-owned and keyed by code — so
 * a code the copy table has never heard of renders this sentence rather than
 * switching the UI into English.
 */
const SIGNED_GATE_DEFAULT_BLOCKED = 'النسخة الموقعة من المستند مطلوبة قبل الترحيل.'

function line(overrides: Partial<PreflightLineShape> = {}): PreflightLineShape {
  return {
    quantity: 5,
    availableBalance: 10,
    materialNameAr: 'ورق تصوير A4',
    materialDomainId: null,
    ...overrides,
  }
}

/** A policy blocker in the wire spelling: `{ action, code, message }`. */
function blocker(
  code: string,
  message = 'The signed copy of the document is required.',
): DocumentPolicyBlocker {
  return { action: 'Post', code, message }
}

function policy(overrides: Partial<DocumentPolicy> = {}): DocumentPolicy {
  return wirePolicy({ documentId: POLICY_DOCUMENT_ID, ...overrides })
}

describe('evaluateBalanceGate', () => {
  it('blocks an Issue line whose quantity exceeds its available balance with the Arabic message', () => {
    expect(evaluateBalanceGate([line({ quantity: 25, availableBalance: 12 })], 'Issue')).toEqual({
      gate: 'balance',
      status: 'blocked',
      messageAr: 'الكمية المطلوبة (٢٥) تتجاوز الرصيد المتاح (١٢) للمادة «ورق تصوير A4».',
      blockerCode: null,
    })
  })

  it('blocks a Transfer line whose quantity exceeds its available balance', () => {
    expect(evaluateBalanceGate([line({ quantity: 40, availableBalance: 30 })], 'Transfer')).toEqual(
      {
        gate: 'balance',
        status: 'blocked',
        messageAr: 'الكمية المطلوبة (٤٠) تتجاوز الرصيد المتاح (٣٠) للمادة «ورق تصوير A4».',
        blockerCode: null,
      },
    )
  })

  it('treats a null available balance as unknown with a neutral Arabic note, never a block', () => {
    expect(evaluateBalanceGate([line({ quantity: 3, availableBalance: null })], 'Issue')).toEqual({
      gate: 'balance',
      status: 'unknown',
      messageAr: 'لا يتوفر رصيد حي للمادة «ورق تصوير A4» حالياً.',
      blockerCode: null,
    })
  })

  it('passes when every outbound line stays within its available balance', () => {
    expect(evaluateBalanceGate([line({ quantity: 5, availableBalance: 12 })], 'Issue')).toEqual({
      gate: 'balance',
      status: 'pass',
      messageAr: null,
      blockerCode: null,
    })
  })

  it('never balance-blocks a Receiving document even when quantities exceed balances', () => {
    expect(
      evaluateBalanceGate([line({ quantity: 999, availableBalance: 1 })], 'Receiving'),
    ).toEqual({
      gate: 'balance',
      status: 'pass',
      messageAr: null,
      blockerCode: null,
    })
  })
})

describe('signedOriginalGate', () => {
  it('returns unknown while the policy is not loaded', () => {
    expect(signedOriginalGate(null)).toEqual({
      gate: 'signedOriginal',
      status: 'unknown',
      messageAr: 'بانتظار تقييم سياسة الخادم للنسخة الموقعة...',
      blockerCode: null,
    })
  })

  it('passes when the server confirms the signed original is satisfied', () => {
    expect(signedOriginalGate(policy({ signedOriginalSatisfied: true }))).toEqual({
      gate: 'signedOriginal',
      status: 'pass',
      messageAr: null,
      blockerCode: null,
    })
  })

  it('blocks on a namespaced signed_original_missing blocker and exposes its code', () => {
    // The gate matches the blocker by CODE and never renders the server's own
    // message: the live `PolicyBlocker.message` is English, and this code has no
    // governed Arabic entry, so the canonical sentence renders instead.
    expect(
      signedOriginalGate(
        policy({
          signedOriginalSatisfied: false,
          blockers: [blocker('document.signed_original_missing')],
        }),
      ),
    ).toEqual({
      gate: 'signedOriginal',
      status: 'blocked',
      messageAr: SIGNED_GATE_DEFAULT_BLOCKED,
      // e24-t07: the matched server code is surfaced so a consumer can dedupe
      // by code rather than by Arabic text.
      blockerCode: 'document.signed_original_missing',
    })
  })

  it('accepts the canonical machine blocker codes without the document prefix', () => {
    expect(
      signedOriginalGate(
        policy({
          signedOriginalSatisfied: false,
          blockers: [blocker('signed_original_invalid')],
        }),
      ),
    ).toEqual({
      gate: 'signedOriginal',
      status: 'blocked',
      messageAr: SIGNED_GATE_DEFAULT_BLOCKED,
      blockerCode: 'signed_original_invalid',
    })
  })

  it('falls back to the default Arabic message when unsatisfied without a signed blocker', () => {
    expect(signedOriginalGate(policy({ signedOriginalSatisfied: false }))).toEqual({
      gate: 'signedOriginal',
      status: 'blocked',
      messageAr: SIGNED_GATE_DEFAULT_BLOCKED,
      blockerCode: null,
    })
  })

  it('passes for posted/reversed/cancelled documents even when the policy is unsatisfied', () => {
    for (const status of ['Posted', 'Reversed', 'Cancelled'] as const) {
      expect(signedOriginalGate(policy({ signedOriginalSatisfied: false }), status)).toEqual({
        gate: 'signedOriginal',
        status: 'pass',
        messageAr: null,
        blockerCode: null,
      })
    }
  })

  it('still blocks pre-post statuses when the policy is unsatisfied', () => {
    for (const status of ['Draft', 'Submitted', 'Rejected'] as const) {
      expect(signedOriginalGate(policy({ signedOriginalSatisfied: false }), status)).toEqual({
        gate: 'signedOriginal',
        status: 'blocked',
        messageAr: SIGNED_GATE_DEFAULT_BLOCKED,
        blockerCode: null,
      })
    }
  })
})

describe('evaluateCapabilityGate', () => {
  const DOMAIN_ID = '00000000-0000-4000-8000-000000000014'
  const capability: readonly CapabilityEvaluation[] = [{ domainId: DOMAIN_ID, status: 'supported' }]

  it('is not applicable (pass) when the document type has no capability operation', () => {
    expect(
      evaluateCapabilityGate([line({ materialDomainId: DOMAIN_ID })], capability, undefined),
    ).toEqual({ gate: 'capability', status: 'pass', messageAr: null, blockerCode: null })
  })

  it('skips lines without a material domain with an unknown non-blocking gate', () => {
    expect(evaluateCapabilityGate([line({ materialDomainId: null })], capability, 'Issue')).toEqual(
      {
        gate: 'capability',
        status: 'unknown',
        messageAr: null,
        blockerCode: null,
      },
    )
  })

  it('blocks when a participating domain is not supported for the operation', () => {
    const blocked: readonly CapabilityEvaluation[] = [
      {
        domainId: DOMAIN_ID,
        status: 'blocked',
        messageAr: 'المستودع لا يمتلك قدرة "صرف" لمجال "تقنية المعلومات".',
      },
    ]
    expect(
      evaluateCapabilityGate([line({ materialDomainId: DOMAIN_ID })], blocked, 'Issue'),
    ).toEqual({
      gate: 'capability',
      status: 'blocked',
      messageAr: 'المستودع لا يمتلك قدرة "صرف" لمجال "تقنية المعلومات".',
      blockerCode: null,
    })
  })

  it('warns with an Arabic note while a participating domain is still unknown', () => {
    const pending: readonly CapabilityEvaluation[] = [{ domainId: DOMAIN_ID, status: 'unknown' }]
    expect(
      evaluateCapabilityGate([line({ materialDomainId: DOMAIN_ID })], pending, 'Issue'),
    ).toEqual({
      gate: 'capability',
      status: 'unknown',
      messageAr: 'لم يكتمل بعد تقييم قدرة المستودع لمجال هذه المادة.',
      blockerCode: null,
    })
  })

  it('passes when every participating domain supports the operation', () => {
    expect(
      evaluateCapabilityGate([line({ materialDomainId: DOMAIN_ID })], capability, 'Issue'),
    ).toEqual({ gate: 'capability', status: 'pass', messageAr: null, blockerCode: null })
  })
})

describe('evaluateDocumentPreflight', () => {
  function input(overrides: Partial<DocumentPreflightInput> = {}): DocumentPreflightInput {
    return {
      lines: [line()],
      documentType: 'Issue',
      policy: policy({ signedOriginalSatisfied: true }),
      capability: [],
      ...overrides,
    }
  }

  it('aggregates to blocked when any gate blocks', () => {
    const preflight = evaluateDocumentPreflight(
      input({ lines: [line({ quantity: 25, availableBalance: 12 })] }),
    )
    expect(preflight.status).toBe('blocked')
    expect(preflight.gates.find((gate) => gate.gate === 'balance')?.status).toBe('blocked')
  })

  it('aggregates to warn when a gate is unknown but nothing blocks', () => {
    const preflight = evaluateDocumentPreflight(
      input({
        lines: [line({ materialDomainId: '00000000-0000-4000-8000-000000000014' })],
        capability: [{ domainId: '00000000-0000-4000-8000-000000000014', status: 'unknown' }],
      }),
    )
    expect(preflight.status).toBe('warn')
    expect(preflight.gates.find((gate) => gate.gate === 'capability')?.status).toBe('unknown')
  })

  it('aggregates to warn when the capability gate has nothing to evaluate (read-only lines)', () => {
    expect(evaluateDocumentPreflight(input()).status).toBe('warn')
    expect(
      evaluateDocumentPreflight(input()).gates.find((gate) => gate.gate === 'capability'),
    ).toEqual({ gate: 'capability', status: 'unknown', messageAr: null, blockerCode: null })
  })

  it('is clear when every gate passes including a supported capability', () => {
    const DOMAIN_ID = '00000000-0000-4000-8000-000000000014'
    const preflight = evaluateDocumentPreflight(
      input({
        lines: [line({ materialDomainId: DOMAIN_ID })],
        capability: [{ domainId: DOMAIN_ID, status: 'supported' }],
      }),
    )
    expect(preflight.status).toBe('clear')
  })

  it('passes server blockers through untouched', () => {
    const serverBlocker = blocker('WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED')
    const preflight = evaluateDocumentPreflight(
      input({ policy: policy({ signedOriginalSatisfied: true, blockers: [serverBlocker] }) }),
    )
    expect(preflight.blockers).toEqual([serverBlocker])
  })

  it('does not block a posted document on a stale unsatisfied signed-original policy', () => {
    const preflight = evaluateDocumentPreflight(
      input({
        policy: policy({ signedOriginalSatisfied: false }),
        documentStatus: 'Posted',
      }),
    )
    expect(preflight.status).not.toBe('blocked')
    expect(preflight.gates.find((gate) => gate.gate === 'signedOriginal')?.status).toBe('pass')
  })

  it('passes SoftFreeze advisories through untouched without ever blocking', () => {
    const advisory = {
      code: 'ActiveSoftFreeze',
      countId: '00000000-0000-4000-8000-0000000000ad',
      message: 'An inventory count covers this warehouse.',
      warehouseId: '00000000-0000-4000-8000-0000000000ad',
    }
    const preflight = evaluateDocumentPreflight(
      input({
        policy: policy({ signedOriginalSatisfied: true, warnings: [advisory] }),
      }),
    )
    expect(preflight.advisories).toEqual([advisory])
    expect(preflight.status).not.toBe('blocked')
    expect(preflight.gates).not.toContainEqual(expect.objectContaining({ status: 'blocked' }))
  })
})

describe('evaluateActionDecision', () => {
  const permitted = () => true
  const denied = () => false

  it('hides an action the session permission gate denies', () => {
    const evaluated = policy({ status: 'Submitted' })
    expect(evaluateActionDecision(evaluated, 'Post', denied)).toEqual({
      presentation: 'Hidden',
      reasonAr: null,
    })
  })

  it('disables a policy-disabled action with the server-supplied reason (F-15)', () => {
    // The harness fills `reason` with Arabic (mirroring the backend's
    // `PolicyReasonAr`), and F-15 prefers that server sentence over the code
    // copy. `reasonCode` still resolves through the wire map (`document.submitted`
    // → `WAREHOUSE_DOCUMENTS_NOT_EDITABLE`) as the fallback when no Arabic
    // sentence is present.
    const evaluated = policy({ status: 'Submitted' })
    expect(evaluateActionDecision(evaluated, 'Submit', permitted)).toEqual({
      presentation: 'Disabled',
      reasonAr: 'المستند مُرسل بالفعل.',
    })
  })

  it('enables an enabled action under a permitted session', () => {
    const evaluated = policy({
      status: 'Submitted',
      signedOriginalSatisfied: true,
    })
    expect(evaluateActionDecision(evaluated, 'Post', permitted)).toEqual({
      presentation: 'Enabled',
      reasonAr: null,
    })
  })

  it('never enables an action while the policy is missing', () => {
    expect(evaluateActionDecision(null, 'Post', permitted)).toEqual({
      presentation: 'Disabled',
      reasonAr: null,
    })
  })

  it('hides an action the policy does not present', () => {
    const evaluated = policy({ status: 'Posted', actions: [] })
    expect(evaluateActionDecision(evaluated, 'Post', permitted)).toEqual({
      presentation: 'Hidden',
      reasonAr: null,
    })
  })

  it('renders no reason at all for a code the governed copy table has never heard of', () => {
    // An unmapped code degrades to no text rather than to the server's English
    // prose: an Arabic-first UI must not switch language on an unknown code.
    const evaluated: DocumentPolicy = {
      ...policy({ status: 'Submitted' }),
      actions: [
        {
          action: 'Submit',
          allowed: false,
          confirmationRequired: false,
          presentation: 'Disabled',
          reasonCode: 'SOME_CODE_NOBODY_HAS_TRANSLATED',
          reason: 'Submit is not available in this state.',
          reasonRequired: false,
        },
      ],
    }
    expect(evaluateActionDecision(evaluated, 'Submit', permitted)).toEqual({
      presentation: 'Disabled',
      reasonAr: null,
    })
  })
})

/**
 * F-15: the server already sends the reason in Arabic (`PolicyReasonAr`), and
 * D-ATT-01 says the reason is the server's — never invented by the client. The
 * resolver must therefore PREFER the server's own Arabic sentence, fall back to
 * the governed code table when it carries none, and never render Latin prose.
 */
describe('actionAvailabilityReasonAr (F-15 server-provided reason)', () => {
  const STATE_NOT_ALLOWED_AR = 'حالة الوثيقة الحالية لا تسمح بهذا الإجراء.'
  const STATE_OR_PERMISSION_NOT_ALLOWED_AR = 'لا تُتيح حالة الوثيقة ولا صلاحياتك تنفيذ هذا الإجراء.'
  // Matches the backend `PolicyReasonAr` sentence verbatim so the two catalogues
  // agree byte-for-byte — the governed table is only read when the wire reason
  // carries no Arabic, and then the fallback must say what the server says.
  const PERMISSION_DENIED_AR = 'ليس لديك صلاحية تنفيذ هذا الإجراء على هذه الوثيقة.'
  const DOCUMENT_NOT_FOUND_AR = 'الوثيقة غير موجودة ضمن نطاق صلاحيتك.'

  function disabled(
    overrides: Partial<DocumentActionAvailability> = {},
  ): DocumentActionAvailability {
    return {
      action: 'Post',
      allowed: false,
      confirmationRequired: false,
      presentation: 'Disabled',
      reason: null,
      reasonCode: null,
      reasonRequired: false,
      ...overrides,
    }
  }

  it('returns the server-supplied Arabic reason for a state-blocked action', () => {
    expect(
      actionAvailabilityReasonAr(
        disabled({ reasonCode: 'STATE_NOT_ALLOWED', reason: STATE_NOT_ALLOWED_AR }),
      ),
    ).toBe(STATE_NOT_ALLOWED_AR)
  })

  it('prefers the server sentence over the governed code copy when the two differ', () => {
    // The server owns the reason; the copy table is only a fallback.
    expect(
      actionAvailabilityReasonAr(
        disabled({ reasonCode: 'STATE_NOT_ALLOWED', reason: 'سبب من الخادم لهذا الإجراء.' }),
      ),
    ).toBe('سبب من الخادم لهذا الإجراء.')
  })

  it('falls back to the governed code copy for a Latin-only server reason', () => {
    expect(
      actionAvailabilityReasonAr(
        disabled({ reasonCode: 'STATE_NOT_ALLOWED', reason: 'Not allowed in this state.' }),
      ),
    ).toBe(STATE_NOT_ALLOWED_AR)
  })

  it('returns null for a Latin-only reason whose code is unmapped', () => {
    // English must never leak: with no Arabic sentence and no governed entry,
    // the honest answer is no text rather than the server's prose.
    expect(
      actionAvailabilityReasonAr(
        disabled({
          reasonCode: 'SOME_CODE_NOBODY_HAS_TRANSLATED',
          reason: 'Submit is not available in this state.',
        }),
      ),
    ).toBeNull()
  })

  it('returns null when the reason carries no Arabic and the code is unmapped', () => {
    expect(
      actionAvailabilityReasonAr(
        disabled({ reasonCode: 'SOME_CODE_NOBODY_HAS_TRANSLATED', reason: '   ' }),
      ),
    ).toBeNull()
  })

  it('still resolves the G-1 receiving reversal code through the copy table', () => {
    expect(
      actionAvailabilityReasonAr(
        disabled({ reasonCode: 'WAREHOUSE_DOCUMENTS_RECEIVING_REVERSAL_BLOCKED_BY_DOWNSTREAM' }),
      ),
    ).toContain('عكس سند الاستلام')
  })

  it.each([
    ['STATE_NOT_ALLOWED', STATE_NOT_ALLOWED_AR],
    ['STATE_OR_PERMISSION_NOT_ALLOWED', STATE_OR_PERMISSION_NOT_ALLOWED_AR],
    ['PERMISSION_DENIED', PERMISSION_DENIED_AR],
    ['DOCUMENT_NOT_FOUND', DOCUMENT_NOT_FOUND_AR],
  ])('arabicCopyForCode resolves the bare code %s', (code, expectedAr) => {
    expect(arabicCopyForCode(code)).toEqual({ titleAr: expectedAr, detailAr: null })
    expect(expectedAr).not.toMatch(/[A-Za-z]/u)
  })
})
