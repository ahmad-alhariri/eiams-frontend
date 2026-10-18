import type { CapabilityOperation } from '@/modules/warehouse/types/warehouse.types'
import { normalizeWireErrorCode } from '@/shared/api/envelope'
import { arabicCopyForCode } from '@/shared/api/error-copy-ar'
import type { DocumentActionType } from '@/shared/documents/types/document-action.types'
import type {
  DocumentActionAvailability,
  DocumentLineResponse,
  DocumentPolicy,
  DocumentPolicyAdvisory,
  DocumentPolicyBlocker,
  DocumentStatus,
  DocumentType,
} from '@/shared/documents/types/document-wire.types'
import { formatFileSize, formatNumber } from '@/shared/utils/format'
import { isSignedOriginalBlockerCode } from '@/shared/documents/policy-blocker-codes'

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
  /**
   * The server blocker code this gate resolved against, when the gate reads one
   * from the policy (currently only the signed-original gate). e24-t07: lets a
   * consumer suppress a gate that restates a blocker the server already renders,
   * by code rather than by Arabic message text, so reworded server copy cannot
   * make the same failure appear twice. `null` for gates that have no server
   * code of their own (balance, capability).
   */
  blockerCode: string | null
}

export type DocumentPreflight = {
  status: 'blocked' | 'warn' | 'clear'
  gates: readonly PreflightGate[]
  blockers: readonly DocumentPolicyBlocker[]
  advisories: readonly DocumentPolicyAdvisory[]
}

/**
 * Arabic script guard. The one rule that keeps an Arabic-first screen from
 * switching language: a server-supplied sentence is trusted only when it
 * actually carries Arabic script. A blank string, `null`, or a Latin-only
 * string is refused so the governed code lookup speaks instead.
 */
const ARABIC_SCRIPT_PATTERN = /[\u0600-\u06FF]/u

function carriesArabicScript(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim().length > 0 && ARABIC_SCRIPT_PATTERN.test(text)
}

/**
 * Arabic for one server policy sentence (F-15).
 *
 * PREFER THE SERVER'S OWN SENTENCE. The live policy projection fills
 * `DocumentActionAvailabilityResponse.Reason`, `DocumentPolicyBlocker.Message`
 * and `DocumentPolicyAdvisory.Message` from the backend's Arabic `PolicyReasonAr`,
 * so a live response already carries the reason. D-ATT-01 puts the server in
 * charge of the reason — it must never be invented by the client — and reading it
 * here makes the screen correct for ANY current or future server code without a
 * frontend edit.
 *
 * FALL BACK TO THE GOVERNED CODE TABLE. When the server sent no sentence — or one
 * with no Arabic script, the only way an English string could arrive — the
 * frontend-owned `error-copy-ar.ts` entry for the code speaks instead
 * (`docs/backend-contract-reconciliation.md` §5).
 *
 * NEVER LEAK ENGLISH. A code the copy table has not heard of, paired with a
 * non-Arabic server string, resolves to `null` rather than the server's text, so
 * the sentence renders exactly as it did before the wire correction (no text)
 * instead of switching the UI into English.
 */
function policyMessageAr(code: string | null, serverText?: string | null): string | null {
  if (carriesArabicScript(serverText)) {
    return serverText.trim()
  }
  const copy = arabicCopyForCode(normalizeWireErrorCode(code))
  return copy === null ? null : copy.titleAr
}

/** Arabic text for a policy blocker: the server's own sentence, else its code. */
export function policyBlockerMessageAr(blocker: {
  readonly code: string
  readonly message?: string | null
}): string | null {
  return policyMessageAr(blocker.code, blocker.message)
}

/** Arabic text for a policy advisory: the server's own sentence, else its code. */
export function policyAdvisoryMessageAr(advisory: DocumentPolicyAdvisory): string | null {
  return policyMessageAr(advisory.code, advisory.message)
}

/** Arabic text for a disabled action's reason: the server's own sentence, else its code. */
export function actionAvailabilityReasonAr(
  availability: DocumentActionAvailability,
): string | null {
  return policyMessageAr(availability.reasonCode, availability.reason)
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
    return { gate: 'balance', status: 'pass', messageAr: null, blockerCode: null }
  }
  for (const line of lines) {
    const balance = line.availableBalance
    if (balance !== null && balance !== undefined && line.quantity > balance) {
      return {
        gate: 'balance',
        status: 'blocked',
        messageAr: `الكمية المطلوبة (${formatNumber(line.quantity)}) تتجاوز الرصيد المتاح (${formatNumber(balance)}) للمادة «${line.materialNameAr ?? ''}».`,
        blockerCode: null,
      }
    }
  }
  for (const line of lines) {
    if (line.availableBalance === null || line.availableBalance === undefined) {
      return {
        gate: 'balance',
        status: 'unknown',
        messageAr: balanceUnknownNote(line.materialNameAr),
        blockerCode: null,
      }
    }
  }
  return { gate: 'balance', status: 'pass', messageAr: null, blockerCode: null }
}

/**
 * The D-ATT-01 signed-original gate — SERVER-AUTHORITATIVE ONLY. Satisfaction
 * is read exclusively from `policy.signedOriginalSatisfied`; the frontend
 * NEVER derives it from attachments, files, or local upload state. A missing
 * policy is `unknown` (indeterminate — never enables); an unsatisfied gate
 * surfaces the server's Arabic blocker message when a signed-original blocker
 * code is present, otherwise the canonical default Arabic message.
 */
const SIGNED_GATE_PENDING = 'بانتظار تقييم سياسة الخادم للنسخة الموقعة...'
const SIGNED_GATE_DEFAULT_BLOCKED = 'النسخة الموقعة من المستند مطلوبة قبل الترحيل.'

/** Statuses where posting is no longer possible: the gate is moot there. */
export const SIGNED_GATE_MOOT_STATUSES: ReadonlySet<DocumentStatus> = new Set([
  'Posted',
  'Reversed',
  'Cancelled',
])

function isSignedOriginalBlocker(code: string): boolean {
  // Accepts both the canonical machine codes and the `document.*`-prefixed
  // vocabulary the contract producers serve (e24-t07).
  return isSignedOriginalBlockerCode(code)
}

export function signedOriginalGate(
  policy: DocumentPolicy | null,
  documentStatus?: DocumentStatus,
): PreflightGate {
  // Once the document moved past posting (posted/reversed/cancelled) the
  // missing-original alert is stale: the requirement only constrains the
  // pre-post workflow, so the gate reports pass regardless of the policy.
  if (documentStatus !== undefined && SIGNED_GATE_MOOT_STATUSES.has(documentStatus)) {
    return { gate: 'signedOriginal', status: 'pass', messageAr: null, blockerCode: null }
  }
  if (policy === null) {
    return {
      gate: 'signedOriginal',
      status: 'unknown',
      messageAr: SIGNED_GATE_PENDING,
      blockerCode: null,
    }
  }
  if (policy.signedOriginalSatisfied) {
    return { gate: 'signedOriginal', status: 'pass', messageAr: null, blockerCode: null }
  }
  const blocker = policy.blockers.find((entry) => isSignedOriginalBlocker(entry.code))
  return {
    gate: 'signedOriginal',
    status: 'blocked',
    messageAr:
      (blocker === undefined ? null : policyBlockerMessageAr(blocker)) ??
      SIGNED_GATE_DEFAULT_BLOCKED,
    // Exposed so a consumer can suppress this gate when the server already
    // renders the same blocker, matching on code instead of Arabic text.
    blockerCode: blocker?.code ?? null,
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
    return { gate: 'capability', status: 'pass', messageAr: null, blockerCode: null }
  }
  const participatingDomains: string[] = []
  for (const line of lines) {
    const domainId = line.materialDomainId
    if (domainId !== null && domainId !== undefined && domainId !== '') {
      participatingDomains.push(domainId)
    }
  }
  if (participatingDomains.length === 0) {
    return { gate: 'capability', status: 'unknown', messageAr: null, blockerCode: null }
  }
  const byDomain = new Map(capability.map((evaluation) => [evaluation.domainId, evaluation]))
  for (const domainId of participatingDomains) {
    const evaluation = byDomain.get(domainId)
    if (evaluation?.status === 'blocked') {
      return {
        gate: 'capability',
        status: 'blocked',
        messageAr: evaluation.messageAr ?? CAPABILITY_GATE_DEFAULT_BLOCKED,
        blockerCode: null,
      }
    }
  }
  for (const domainId of participatingDomains) {
    const evaluation = byDomain.get(domainId)
    if (evaluation === undefined || evaluation.status === 'unknown') {
      return {
        gate: 'capability',
        status: 'unknown',
        messageAr: CAPABILITY_GATE_UNKNOWN,
        blockerCode: null,
      }
    }
  }
  return { gate: 'capability', status: 'pass', messageAr: null, blockerCode: null }
}

export interface DocumentPreflightInput {
  lines: readonly PreflightLineShape[]
  documentType: DocumentType
  policy: DocumentPolicy | null
  capability: readonly CapabilityEvaluation[]
  /**
   * Optional current document status: the signed-original gate turns `pass`
   * for statuses where posting is no longer possible (Posted/Reversed/
   * Cancelled) so stale alerts never surface after the transition.
   */
  documentStatus?: DocumentStatus
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
    signedOriginalGate(input.policy, input.documentStatus),
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
    advisories: input.policy?.warnings ?? [],
  }
}

/**
 * Adapts server-loaded `DocumentLineResponse` records to the preflight line
 * shape.
 *
 * Two facts about the real detail read drive this adaptor:
 * - lines never carry `materialDomainId`, so capability preflight applies only to
 *   edit-form draft lines and is pinned to `null` here;
 * - lines carry only `materialId`, never a material name, and no balance, so the
 *   balance gate on a server-loaded Issue/Transfer document resolves to
 *   `unknown` — a neutral note that never blocks. The authoritative balance
 *   check is the server's own `InventoryBalances.InsufficientQuantity` policy
 *   blocker at post time.
 */
export function toPreflightLineShapes(
  lines: readonly DocumentLineResponse[],
): readonly PreflightLineShape[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    availableBalance: null,
    materialDomainId: null,
    materialNameAr: null,
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
    return { presentation: 'Disabled', reasonAr: actionAvailabilityReasonAr(availability) }
  }
  return { presentation: 'Enabled', reasonAr: null }
}

// ---------------------------------------------------------------------------
// Attachment limits (F-14 / D-ATT-01)
// ---------------------------------------------------------------------------

/**
 * The server-owned attachment limits the panel renders. Both members are read
 * from `DocumentPolicy`; both are optional because a cached policy written
 * before the backend added them can still reach the panel.
 */
export interface AttachmentLimits {
  readonly maxSizeBytes?: number | null
  readonly allowedContentTypes?: readonly string[] | null
}

/**
 * Human Arabic labels for the MIME types the attachment endpoint accepts.
 *
 * Mirrors `DROPZONE_ACCEPT`'s known set. An unknown type falls back to its raw
 * MIME string rather than being dropped, so a server that adds a type this
 * build has never seen still surfaces it instead of silently hiding a limit.
 */
const CONTENT_TYPE_LABELS_AR: Readonly<Record<string, string>> = {
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
  'application/pdf': 'PDF',
}

/** Arabic list of the server-allowed content types, or `null` when unset. */
export function attachmentContentTypesLabelAr(
  contentTypes: readonly string[] | null | undefined,
): string | null {
  if (contentTypes === null || contentTypes === undefined || contentTypes.length === 0) {
    return null
  }
  return contentTypes.map((type) => CONTENT_TYPE_LABELS_AR[type] ?? type).join(' / ')
}

/** Arabic size label for the server's max upload size, or `null` when unset. */
export function attachmentMaxSizeLabelAr(maxSizeBytes: number | null | undefined): string | null {
  return maxSizeBytes === null || maxSizeBytes === undefined ? null : formatFileSize(maxSizeBytes)
}

/**
 * The generic Arabic fallback used when the server sent no explicit limit. It
 * deliberately carries NO number: the panel must never print a hard-coded
 * "-5 MB" that the server does not back (F-14). The server's own response
 * (413/415/422) is the authoritative rejection, so "per server policy" is the
 * honest statement.
 */
const ATTACHMENT_LIMIT_FALLBACK_AR = 'وفق سياسة الخادم'

/** The signed-original section description, built from the server's limits. */
export function attachmentSignedDescriptionAr(limits: AttachmentLimits): string {
  const size = attachmentMaxSizeLabelAr(limits.maxSizeBytes)
  const types = attachmentContentTypesLabelAr(limits.allowedContentTypes)
  if (size !== null && types !== null) {
    return `نسخة واحدة فقط — ${size} كحد أقصى (${types})`
  }
  if (size !== null) {
    return `نسخة واحدة فقط — ${size} كحد أقصى`
  }
  if (types !== null) {
    return `نسخة واحدة فقط (${types})`
  }
  return `نسخة واحدة فقط — ${ATTACHMENT_LIMIT_FALLBACK_AR}`
}

/** The supporting-files section description, built from the server's limits. */
export function attachmentSupportingDescriptionAr(limits: AttachmentLimits): string {
  const size = attachmentMaxSizeLabelAr(limits.maxSizeBytes)
  const types = attachmentContentTypesLabelAr(limits.allowedContentTypes)
  if (size !== null && types !== null) {
    return `ملفات إضافية (${types}) — حتى ${size} للملف الواحد`
  }
  if (size !== null) {
    return `ملفات إضافية — حتى ${size} للملف الواحد`
  }
  if (types !== null) {
    return `ملفات إضافية (${types})`
  }
  return `ملفات إضافية — ${ATTACHMENT_LIMIT_FALLBACK_AR}`
}
