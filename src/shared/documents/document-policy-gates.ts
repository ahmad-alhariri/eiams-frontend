import type {
  CapabilityOperation,
  DocumentActionType,
  DocumentLine,
  DocumentPolicy,
  DocumentType,
  OperationalAdvisory,
  PolicyBlocker,
} from '@/shared/types/generated/eiams-v1'
import { formatNumber } from '@/shared/utils/format'

/**
 * Pure preflight-gate model of the shared document policy-gate coordinator
 * (e12-t12). One shared source of truth for the three client-side preflight
 * gates (capability, balance, signed-original) plus the action-level
 * presentation decision — the single composition every document feature
 * (receiving e13, issue e16, transfer e17, return e19, opening e15,
 * adjustment e21) consumes instead of re-implementing.
 *
 * All functions here are pure and hook-free: they operate on already-resolved
 * data (a loaded `DocumentPolicy`, per-domain capability verdicts, line
 * snapshots) so they are fully unit-testable. Server data flows in from the
 * hook layer only; nothing here fetches or derives anything locally.
 *
 * Contract anchors:
 * - D-ATT-01: the signed-original gate is SERVER-AUTHORITATIVE ONLY. This
 *   module never infers satisfaction from attachments/files; it only reads
 *   `policy.signedOriginalSatisfied` and the server blocker codes.
 * - Inventory-count freeze policy: `ActiveSoftFreeze` advisories are
 *   WARNINGS ONLY — they pass through `DocumentPreflight.advisories` untouched
 *   and never participate in the gates, so they can never block or disable.
 * - Outbound balance ceiling: only Issue/Transfer lines are balance-checked
 *   (AGENTS.md rules 3/5; negative stock is blocked in v1). Receiving/Opening
 *   have no balance ceiling; a null `availableBalance` means no live balance
 *   is known → `unknown` (a neutral note, never a block).
 */

export type PreflightGateStatus = 'pass' | 'blocked' | 'unknown'

export interface PreflightGate {
  gate: 'capability' | 'balance' | 'signedOriginal'
  status: PreflightGateStatus
  messageAr: string | null
}

export type DocumentPreflight = {
  status: 'blocked' | 'warn' | 'clear'
  gates: readonly PreflightGate[]
  blockers: readonly PolicyBlocker[]
  advisories: readonly OperationalAdvisory[]
}

/**
 * Minimal structural line snapshot the gates operate on. Server-loaded
 * `DocumentLine` records satisfy it structurally (see
 * {@link toPreflightLineShapes}); edit forms pass their draft line snapshots —
 * which carry `materialDomainId` — directly (see
 * {@link useDocumentPolicyGate} `lines` option).
 */
export interface PreflightLineShape {
  quantity: number
  availableBalance: number | null | undefined
  materialNameAr?: string | null
  materialDomainId?: string | null
}

/**
 * One already-resolved capability verdict per participating material domain.
 * `messageAr` is filled by the hook layer from the capability validation hook
 * (the pure layer only falls back to a generic Arabic message).
 */
export interface CapabilityEvaluation {
  domainId: string
  status: 'supported' | 'blocked' | 'unknown'
  messageAr?: string | null
}

export interface DocumentActionDecision {
  presentation: 'Hidden' | 'Disabled' | 'Enabled'
  reasonAr: string | null
}

const OUTBOUND_DOCUMENT_TYPES: ReadonlySet<DocumentType> = new Set(['Issue', 'Transfer'])

/** Issue/Transfer are the only v1 outbound types with a balance ceiling. */
export function isOutboundDocumentType(documentType: DocumentType): boolean {
  return OUTBOUND_DOCUMENT_TYPES.has(documentType)
}

/**
 * Maps the document type to the warehouse-capability operation the document
 * exercises. Adjustment/Opening have no capability operation in v1 → the
 * capability gate is not applicable for them.
 */
export function capabilityOperationForDocumentType(
  documentType: DocumentType,
): CapabilityOperation | undefined {
  switch (documentType) {
    case 'Receiving':
      return 'Receiving'
    case 'Issue':
      return 'Issue'
    case 'Transfer':
      return 'Transfer'
    case 'Return':
      return 'Return'
    case 'Adjustment':
    case 'Opening':
      return undefined
  }
}

const BALANCE_UNKNOWN_NOTE = 'لا يتوفر رصيد حي لهذه المادة حالياً.'

function balanceUnknownNote(materialNameAr: string | null | undefined): string {
  return materialNameAr === null || materialNameAr === undefined || materialNameAr === ''
    ? BALANCE_UNKNOWN_NOTE
    : `لا يتوفر رصيد حي للمادة «${materialNameAr}» حالياً.`
}

/**
 * Balance ceiling gate (AGENTS.md rules 3/5). Only outbound types
 * (Issue/Transfer) are checked; a definite over-balance blocks, a null
 * `availableBalance` yields `unknown` (neutral note, never a block), anything
 * else passes.
 */
export function evaluateBalanceGate(
  lines: readonly PreflightLineShape[],
  documentType: DocumentType,
): PreflightGate {
  if (!isOutboundDocumentType(documentType)) {
    return { gate: 'balance', status: 'pass', messageAr: null }
  }
  for (const line of lines) {
    const balance = line.availableBalance
    if (balance !== null && balance !== undefined && line.quantity > balance) {
      return {
        gate: 'balance',
        status: 'blocked',
        messageAr: `الكمية المطلوبة (${formatNumber(line.quantity)}) تتجاوز الرصيد المتاح (${formatNumber(balance)}) للمادة «${line.materialNameAr ?? ''}».`,
      }
    }
  }
  for (const line of lines) {
    if (line.availableBalance === null || line.availableBalance === undefined) {
      return {
        gate: 'balance',
        status: 'unknown',
        messageAr: balanceUnknownNote(line.materialNameAr),
      }
    }
  }
  return { gate: 'balance', status: 'pass', messageAr: null }
}

/**
 * The D-ATT-01 signed-original gate — SERVER-AUTHORITATIVE ONLY. Satisfaction
 * is read exclusively from `policy.signedOriginalSatisfied`; the frontend
 * NEVER derives it from attachments, files, or local upload state. A missing
 * policy is `unknown` (indeterminate — never enables); an unsatisfied gate
 * surfaces the server's Arabic blocker message when a signed-original blocker
 * code is present, otherwise the canonical default Arabic message.
 */
const SIGNED_BLOCKER_SUFFIXES: readonly string[] = [
  'signed_original_missing',
  'signed_original_invalid',
  'signed_original_immutable',
]

const SIGNED_GATE_PENDING = 'بانتظار تقييم سياسة الخادم للنسخة الموقعة...'
const SIGNED_GATE_DEFAULT_BLOCKED = 'النسخة الموقعة من المستند مطلوبة قبل الترحيل.'

function isSignedOriginalBlocker(code: string): boolean {
  // Accepts both the canonical machine codes and the `document.*`-prefixed
  // vocabulary the dev mock API serves.
  return SIGNED_BLOCKER_SUFFIXES.some((suffix) => code === suffix || code.endsWith(`.${suffix}`))
}

export function signedOriginalGate(policy: DocumentPolicy | null): PreflightGate {
  if (policy === null) {
    return { gate: 'signedOriginal', status: 'unknown', messageAr: SIGNED_GATE_PENDING }
  }
  if (policy.signedOriginalSatisfied) {
    return { gate: 'signedOriginal', status: 'pass', messageAr: null }
  }
  const blocker = policy.blockers.find((entry) => isSignedOriginalBlocker(entry.code))
  return {
    gate: 'signedOriginal',
    status: 'blocked',
    messageAr: blocker?.messageAr ?? SIGNED_GATE_DEFAULT_BLOCKED,
  }
}

const CAPABILITY_GATE_UNKNOWN = 'لم يكتمل بعد تقييم قدرة المستودع لمجال هذه المادة.'
const CAPABILITY_GATE_DEFAULT_BLOCKED = 'المستودع لا يمتلك قدرة العملية المطلوبة لمجال هذه المادة.'

/**
 * Warehouse-capability gate (AGENTS.md rule 6). Only lines carrying an
 * explicit `materialDomainId` participate — those are the draft lines
 * captured by edit forms. Server-loaded (read-only) documents never carry it,
 * so capability preflight is not re-evaluated client-side there (the server
 * owns capability revalidation at post); the gate is then `unknown` with no
 * note (warn-level only, never a block).
 */
export function evaluateCapabilityGate(
  lines: readonly PreflightLineShape[],
  capability: readonly CapabilityEvaluation[],
  operation: CapabilityOperation | undefined,
): PreflightGate {
  if (operation === undefined) {
    return { gate: 'capability', status: 'pass', messageAr: null }
  }
  const participatingDomains: string[] = []
  for (const line of lines) {
    const domainId = line.materialDomainId
    if (domainId !== null && domainId !== undefined && domainId !== '') {
      participatingDomains.push(domainId)
    }
  }
  if (participatingDomains.length === 0) {
    return { gate: 'capability', status: 'unknown', messageAr: null }
  }
  const byDomain = new Map(capability.map((evaluation) => [evaluation.domainId, evaluation]))
  for (const domainId of participatingDomains) {
    const evaluation = byDomain.get(domainId)
    if (evaluation?.status === 'blocked') {
      return {
        gate: 'capability',
        status: 'blocked',
        messageAr: evaluation.messageAr ?? CAPABILITY_GATE_DEFAULT_BLOCKED,
      }
    }
  }
  for (const domainId of participatingDomains) {
    const evaluation = byDomain.get(domainId)
    if (evaluation === undefined || evaluation.status === 'unknown') {
      return { gate: 'capability', status: 'unknown', messageAr: CAPABILITY_GATE_UNKNOWN }
    }
  }
  return { gate: 'capability', status: 'pass', messageAr: null }
}

export interface DocumentPreflightInput {
  lines: readonly PreflightLineShape[]
  documentType: DocumentType
  policy: DocumentPolicy | null
  capability: readonly CapabilityEvaluation[]
}

/**
 * Aggregates the three gates into one preflight verdict: `blocked` when any
 * gate blocks, `warn` when any gate is unknown, otherwise `clear`. Server
 * policy blockers and advisories pass through untouched — advisories are
 * warnings only (SoftFreeze never blocks) and are rendered exclusively by the
 * lifecycle action bar.
 */
export function evaluateDocumentPreflight(input: DocumentPreflightInput): DocumentPreflight {
  const gates: readonly PreflightGate[] = [
    evaluateBalanceGate(input.lines, input.documentType),
    signedOriginalGate(input.policy),
    evaluateCapabilityGate(
      input.lines,
      input.capability,
      capabilityOperationForDocumentType(input.documentType),
    ),
  ]
  const hasBlocked = gates.some((gate) => gate.status === 'blocked')
  const hasUnknown = gates.some((gate) => gate.status === 'unknown')
  return {
    status: hasBlocked ? 'blocked' : hasUnknown ? 'warn' : 'clear',
    gates,
    blockers: input.policy?.blockers ?? [],
    advisories: input.policy?.advisories ?? [],
  }
}

/**
 * Adapts server-loaded `DocumentLine` records to the preflight line shape.
 * Server lines never carry `materialDomainId` (capability preflight applies
 * only to edit-form draft lines), so the adaptor pins it to `null`.
 */
export function toPreflightLineShapes(
  lines: readonly DocumentLine[],
): readonly PreflightLineShape[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    availableBalance: line.availableBalance ?? null,
    materialDomainId: null,
    materialNameAr: line.material.nameAr,
  }))
}

/**
 * One action-level presentation decision composing the server-authoritative
 * policy presentation with the session permission gate:
 * - permission missing → `Hidden` (mirrors the server's unauthorized
 *   treatment; never rendered);
 * - policy `Disabled` → `Disabled` with the policy's Arabic reason;
 * - policy `Enabled` + permission → `Enabled`.
 * A missing policy can never enable an action (D-ATT-01 indeterminate state).
 */
export function evaluateActionDecision(
  policy: DocumentPolicy | null,
  action: DocumentActionType,
  isActionPermitted: (action: DocumentActionType) => boolean,
): DocumentActionDecision {
  if (!isActionPermitted(action)) {
    return { presentation: 'Hidden', reasonAr: null }
  }
  if (policy === null) {
    return { presentation: 'Disabled', reasonAr: null }
  }
  const availability = policy.actions.find((entry) => entry.action === action)
  if (availability === undefined || availability.presentation === 'Hidden') {
    return { presentation: 'Hidden', reasonAr: null }
  }
  if (availability.presentation === 'Disabled') {
    return { presentation: 'Disabled', reasonAr: availability.reasonAr ?? null }
  }
  return { presentation: 'Enabled', reasonAr: null }
}
