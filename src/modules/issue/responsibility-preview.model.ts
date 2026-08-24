import type { CounterpartType, CustodyKind } from '@/shared/types/generated/eiams-v1'

import { ISSUE_RECIPIENT_TYPE_LABELS_AR } from '@/modules/issue/schemas/issue-info.schema'

/**
 * Issue responsibility preview (e16-t06).
 *
 * PRD 12.3 business rules: issuing to an `Employee` automatically opens
 * `Personal` custody; issuing to an `OrganizationalUnit` or a `Site` opens
 * `Operational` custody pending personal assignment. `External` follows the
 * operational pattern (the receiving party holds the asset operationally).
 *
 * The mapping below is presentation guidance only: custody creation is
 * server-owned on posting and this model never persists anything.
 */

export interface IssueResponsibilityPreview {
  /** Custody kind the server will open for the selected recipient type. */
  custodyKind: CustodyKind | null
  /** Arabic headline describing the resulting responsibility. */
  messageAr: string | null
}

const CUSTODY_KIND_BY_RECIPIENT_TYPE: Readonly<Record<CounterpartType, CustodyKind>> = {
  Employee: 'Personal',
  OrganizationalUnit: 'Operational',
  Site: 'Operational',
  External: 'Operational',
}

const RESPONSIBILITY_MESSAGE_AR: Readonly<Record<CustodyKind, string>> = {
  Personal: 'سيُسجَّل الحفظ باسم الجهة المستلمة (حفظ شخصي) فور ترحيل السند.',
  Operational:
    'تنتقل المسؤولية التشغيلية إلى الجهة المستلمة فور الترحيل، ويبقى الحفظ قيد التخصيص الشخصي.',
}

export function issueResponsibilityPreview(
  recipientType: string,
  recipientDisplayName: string,
): IssueResponsibilityPreview {
  if (recipientType === '' || !(recipientType in CUSTODY_KIND_BY_RECIPIENT_TYPE)) {
    return { custodyKind: null, messageAr: null }
  }
  const custodyKind = CUSTODY_KIND_BY_RECIPIENT_TYPE[recipientType as CounterpartType]
  const holderLabel =
    recipientDisplayName.trim() !== ''
      ? recipientDisplayName.trim()
      : ISSUE_RECIPIENT_TYPE_LABELS_AR[recipientType as CounterpartType]
  return {
    custodyKind,
    messageAr: `${RESPONSIBILITY_MESSAGE_AR[custodyKind]} (الجهة: ${holderLabel})`,
  }
}
