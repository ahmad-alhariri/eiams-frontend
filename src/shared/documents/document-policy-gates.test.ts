import { describe, expect, it } from 'vitest'

import {
  evaluateActionDecision,
  evaluateBalanceGate,
  evaluateCapabilityGate,
  evaluateDocumentPreflight,
  signedOriginalGate,
  type CapabilityEvaluation,
  type DocumentPreflightInput,
  type PreflightLineShape,
} from '@/shared/documents/document-policy-gates'
import {
  createDocumentPolicy,
  createOperationalAdvisory,
  createPolicyBlocker,
} from '@/test/msw/factories'
import type { DocumentPolicy } from '@/shared/types/generated/eiams-v1'

const POLICY_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c8'

function line(overrides: Partial<PreflightLineShape> = {}): PreflightLineShape {
  return {
    quantity: 5,
    availableBalance: 10,
    materialNameAr: 'ورق تصوير A4',
    materialDomainId: null,
    ...overrides,
  }
}

function policy(overrides: Partial<DocumentPolicy> = {}): DocumentPolicy {
  return createDocumentPolicy({ documentId: POLICY_DOCUMENT_ID, ...overrides })
}

describe('evaluateBalanceGate', () => {
  it('blocks an Issue line whose quantity exceeds its available balance with the Arabic message', () => {
    expect(evaluateBalanceGate([line({ quantity: 25, availableBalance: 12 })], 'Issue')).toEqual({
      gate: 'balance',
      status: 'blocked',
      messageAr: 'الكمية المطلوبة (٢٥) تتجاوز الرصيد المتاح (١٢) للمادة «ورق تصوير A4».',
    })
  })

  it('blocks a Transfer line whose quantity exceeds its available balance', () => {
    expect(evaluateBalanceGate([line({ quantity: 40, availableBalance: 30 })], 'Transfer')).toEqual(
      {
        gate: 'balance',
        status: 'blocked',
        messageAr: 'الكمية المطلوبة (٤٠) تتجاوز الرصيد المتاح (٣٠) للمادة «ورق تصوير A4».',
      },
    )
  })

  it('treats a null available balance as unknown with a neutral Arabic note, never a block', () => {
    expect(evaluateBalanceGate([line({ quantity: 3, availableBalance: null })], 'Issue')).toEqual({
      gate: 'balance',
      status: 'unknown',
      messageAr: 'لا يتوفر رصيد حي للمادة «ورق تصوير A4» حالياً.',
    })
  })

  it('passes when every outbound line stays within its available balance', () => {
    expect(evaluateBalanceGate([line({ quantity: 5, availableBalance: 12 })], 'Issue')).toEqual({
      gate: 'balance',
      status: 'pass',
      messageAr: null,
    })
  })

  it('never balance-blocks a Receiving document even when quantities exceed balances', () => {
    expect(
      evaluateBalanceGate([line({ quantity: 999, availableBalance: 1 })], 'Receiving'),
    ).toEqual({
      gate: 'balance',
      status: 'pass',
      messageAr: null,
    })
  })
})

describe('signedOriginalGate', () => {
  it('returns unknown while the policy is not loaded', () => {
    expect(signedOriginalGate(null)).toEqual({
      gate: 'signedOriginal',
      status: 'unknown',
      messageAr: 'بانتظار تقييم سياسة الخادم للنسخة الموقعة...',
    })
  })

  it('passes when the server confirms the signed original is satisfied', () => {
    expect(signedOriginalGate(policy({ signedOriginalSatisfied: true }))).toEqual({
      gate: 'signedOriginal',
      status: 'pass',
      messageAr: null,
    })
  })

  it('surfaces the server Arabic message when a signed_original_missing blocker exists', () => {
    const blocker = createPolicyBlocker({
      code: 'document.signed_original_missing',
      messageAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.',
    })
    expect(
      signedOriginalGate(policy({ signedOriginalSatisfied: false, blockers: [blocker] })),
    ).toEqual({
      gate: 'signedOriginal',
      status: 'blocked',
      messageAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.',
    })
  })

  it('accepts the canonical machine blocker codes without the document prefix', () => {
    const blocker = createPolicyBlocker({
      code: 'signed_original_invalid',
      messageAr: 'النسخة الموقعة الحالية غير صالحة.',
    })
    expect(
      signedOriginalGate(policy({ signedOriginalSatisfied: false, blockers: [blocker] })),
    ).toEqual({
      gate: 'signedOriginal',
      status: 'blocked',
      messageAr: 'النسخة الموقعة الحالية غير صالحة.',
    })
  })

  it('falls back to the default Arabic message when unsatisfied without a signed blocker', () => {
    expect(signedOriginalGate(policy({ signedOriginalSatisfied: false }))).toEqual({
      gate: 'signedOriginal',
      status: 'blocked',
      messageAr: 'النسخة الموقعة من المستند مطلوبة قبل الترحيل.',
    })
  })

  it('passes for posted/reversed/cancelled documents even when the policy is unsatisfied', () => {
    for (const status of ['Posted', 'Reversed', 'Cancelled'] as const) {
      expect(signedOriginalGate(policy({ signedOriginalSatisfied: false }), status)).toEqual({
        gate: 'signedOriginal',
        status: 'pass',
        messageAr: null,
      })
    }
  })

  it('still blocks pre-post statuses when the policy is unsatisfied', () => {
    for (const status of ['Draft', 'Submitted', 'Rejected'] as const) {
      expect(signedOriginalGate(policy({ signedOriginalSatisfied: false }), status)).toEqual({
        gate: 'signedOriginal',
        status: 'blocked',
        messageAr: 'النسخة الموقعة من المستند مطلوبة قبل الترحيل.',
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
    ).toEqual({ gate: 'capability', status: 'pass', messageAr: null })
  })

  it('skips lines without a material domain with an unknown non-blocking gate', () => {
    expect(evaluateCapabilityGate([line({ materialDomainId: null })], capability, 'Issue')).toEqual(
      {
        gate: 'capability',
        status: 'unknown',
        messageAr: null,
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
    })
  })

  it('passes when every participating domain supports the operation', () => {
    expect(
      evaluateCapabilityGate([line({ materialDomainId: DOMAIN_ID })], capability, 'Issue'),
    ).toEqual({ gate: 'capability', status: 'pass', messageAr: null })
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
    ).toEqual({ gate: 'capability', status: 'unknown', messageAr: null })
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
    const blocker = createPolicyBlocker()
    const preflight = evaluateDocumentPreflight(
      input({ policy: policy({ signedOriginalSatisfied: true, blockers: [blocker] }) }),
    )
    expect(preflight.blockers).toEqual([blocker])
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
    const advisory = createOperationalAdvisory({
      countReference: 'JRY-2026-014',
      messageAr: 'هناك جرد نشط يغطي نطاق هذا المستودع.',
    })
    const preflight = evaluateDocumentPreflight(
      input({
        policy: policy({ signedOriginalSatisfied: true, advisories: [advisory] }),
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
    const evaluated = policy({ documentStatus: 'Submitted' })
    expect(evaluateActionDecision(evaluated, 'Post', denied)).toEqual({
      presentation: 'Hidden',
      reasonAr: null,
    })
  })

  it('disables a policy-disabled action with the server Arabic reason', () => {
    const evaluated = policy({ documentStatus: 'Submitted' })
    expect(evaluateActionDecision(evaluated, 'Submit', permitted)).toEqual({
      presentation: 'Disabled',
      reasonAr: 'المستند مُرسل بالفعل.',
    })
  })

  it('enables an enabled action under a permitted session', () => {
    const evaluated = policy({
      documentStatus: 'Submitted',
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
    const evaluated = policy({ documentStatus: 'Posted', actions: [] })
    expect(evaluateActionDecision(evaluated, 'Post', permitted)).toEqual({
      presentation: 'Hidden',
      reasonAr: null,
    })
  })
})
