import type { CustodyStatus } from '@/modules/custody/types/custody.types'

/**
 * Arabic labels for the custody `status` string, which is SUBJECT-DEPENDENT:
 * an Asset row is `Active` / `Closed`, a TrackedUnit row is `Issued` /
 * `Returned` / `Disposed`, a MaterialQuantity row is `Active` /
 * `FullyReturned`, and the server falls back to `Unknown`.
 */
export const CUSTODY_STATUS_LABELS_AR = {
  Active: 'نشطة',
  Closed: 'مغلقة',
  Issued: 'مصروفة',
  Returned: 'مرتجعة',
  Disposed: 'مستبعدة',
  FullyReturned: 'مرتجعة بالكامل',
  Unknown: 'غير معروفة',
} as const satisfies Record<CustodyStatus, string>
