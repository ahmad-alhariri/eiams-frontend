import { z } from 'zod'

import type { IssueDraftDetails } from '@/shared/documents/types/document-wire.types'

/**
 * IssueTo petal capture (e16-t01), contract-shaped with no v2 behavior: the
 * form vocabulary mirrors the live `PartyType` quartet exactly, so every
 * server record is representable and no unknown-value fallback path is
 * needed beyond the label helper's defensive default.
 *
 * NOTE: there is deliberately NO `src/modules/issue/services/` file. The
 * frontend consumes no issue-specific endpoint — the consumer baseline
 * (`contracts/openapi/eiams-v1.consumer-baseline.json`, 134 endpoints) lists
 * none — so issue draft CRUD rides the shared document engine
 * (`src/shared/documents/document-transport.ts`) via the generic
 * `CompleteDraftRequest.issueTo` petal, exactly like the other five document
 * types. The sibling receiving module states the rule in its own service:
 * "Draft persistence is deliberately NOT duplicated here — the shared
 * document engine owns the `complete-draft` write".
 */

/** Live `Domain.Common.PartyType` values an issue recipient may take. */
export const ISSUE_RECIPIENT_TYPES = ['Employee', 'OrganizationalUnit', 'Site', 'External'] as const

export type IssueRecipientType = (typeof ISSUE_RECIPIENT_TYPES)[number]

/** Arabic labels for the recipient-type select on the issue create form. */
export const ISSUE_RECIPIENT_TYPE_LABELS_AR: Readonly<Record<IssueRecipientType, string>> = {
  Employee: 'موظف',
  OrganizationalUnit: 'وحدة تنظيمية',
  Site: 'موقع',
  External: 'جهة خارجية',
}

/**
 * Arabic label for a server `recipientType` value. All four contract values
 * map to their label; any foreign value (e.g. an older server seed) renders
 * as-is so records stay readable.
 */
export function recipientTypeLabelAr(recipientType: string): string {
  return ISSUE_RECIPIENT_TYPE_LABELS_AR[recipientType as IssueRecipientType] ?? recipientType
}

/**
 * 200-char cap on `issueReason` is the LIVE backend's own cap, not a
 * presentation choice: `Domain/IssueTos/IssueTo.cs` rejects a trimmed reason
 * that is empty or longer than 200 characters
 * (`IssueToErrors.IssueReasonInvalid`). The sibling transfer petal has the
 * same cap (`Domain/TransferInfos/TransferInfo.cs`).
 */
export const ISSUE_REASON_MAX_LENGTH = 200

export const issueInfoSchema = z.object({
  recipientType: z.enum(ISSUE_RECIPIENT_TYPES, 'يجب اختيار نوع الجهة المستلمة.'),
  recipientId: z.string().uuid('يجب اختيار الجهة المستلمة من القائمة.'),
  issueReason: z
    .string()
    .trim()
    .min(1, 'يجب إدخال سبب الصرف.')
    .max(ISSUE_REASON_MAX_LENGTH, `يجب ألا يتجاوز سبب الصرف ${ISSUE_REASON_MAX_LENGTH} محرفاً.`),
})

export type IssueInfoFormValues = z.infer<typeof issueInfoSchema>

/**
 * Maps form values to the live `IssueDraftDetails` petal, trimming the reason.
 *
 * The live write body is `{ recipientType, recipientId, issueReason }` and
 * nothing else: `Application.WarehouseDocuments.CompleteDraft.IssueDraftDetails`,
 * mirrored by `Web.Api.Controllers.IssueTos.UpsertIssueToController.RequestBody`
 * (the same three members plus `expectedRowVersion`). The frozen snapshot's
 * writable `recipientDisplayName` is gone — the server resolves the recipient
 * itself and serves the resolved name on the read projection
 * (`WarehouseDocumentDetailsResponse.IssueToResponse`), so the client never
 * sends one.
 */
export function toIssueInfo(values: IssueInfoFormValues): IssueDraftDetails {
  return {
    recipientType: values.recipientType,
    recipientId: values.recipientId,
    issueReason: values.issueReason.trim(),
  }
}
