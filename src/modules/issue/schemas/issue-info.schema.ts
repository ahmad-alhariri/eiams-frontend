import { z } from 'zod'

import type { IssueTo } from '@/shared/types/generated/eiams-v1'

/**
 * IssueTo petal capture (e16-t01), contract-shaped with no v2 behavior: the
 * form vocabulary mirrors the contract `CounterpartType` quartet exactly, so
 * every server record is representable and no unknown-value fallback path is
 * needed beyond the label helper's defensive default.
 *
 * NOTE: there is deliberately NO `src/modules/issue/services/` file. The
 * contract defines no issue-specific endpoints — issue draft CRUD rides the
 * shared document engine (`src/shared/documents/document-transport.ts`) via
 * the generic `WarehouseDocumentDraftRequest.issueTo` petal, exactly like the
 * other five document types.
 */

/** Contract `CounterpartType` values an issue recipient may take. */
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
 * 500-char cap on `issueReason` is presentation-level only — schema.md types
 * it as an open text column; the cap matches sibling petals' VARCHAR caps and
 * keeps the reason box readable in the UI.
 */
const ISSUE_REASON_MAX_LENGTH = 500

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
 * Seeds form values from a server record (edit mode). A missing petal defaults
 * to blank fields — a fresh issue draft whose empty `recipientType` fails
 * validation until the user picks a recipient.
 */
export function fromIssueInfo(info?: IssueTo | null): IssueInfoFormValues {
  if (info === undefined || info === null) {
    return {
      recipientType: '' as IssueInfoFormValues['recipientType'],
      recipientId: '',
      issueReason: '',
    }
  }
  return {
    recipientType: info.recipientType,
    recipientId: info.recipientId,
    issueReason: info.issueReason,
  }
}

/**
 * Maps form values to the contract `IssueTo`, trimming the reason.
 *
 * `recipientDisplayName` handling (e16-t01 decision): the dev mock persists
 * `issueTo` verbatim (`buildDraftDocument` / `applyDraftToDocument` spread
 * `request.issueTo` through untouched), so whatever the client sends is what
 * comes back — the UI must therefore always pass the selected option's
 * displayName here when one was chosen. The production server derives the
 * display name from `recipient_type` + `recipient_id` on persistence, so the
 * `''` default is a safe placeholder whenever no option displayName exists.
 */
export function toIssueInfo(values: IssueInfoFormValues, recipientDisplayName?: string): IssueTo {
  return {
    issueReason: values.issueReason.trim(),
    recipientDisplayName: recipientDisplayName ?? '',
    recipientId: values.recipientId,
    recipientType: values.recipientType,
  }
}
