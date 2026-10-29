import type { CustodyStatus, CustodySubjectType } from '@/modules/custody/types/custody.types'

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

/**
 * Arabic labels for the custody SUBJECT vocabulary. A custody row is a
 * responsibility over one of: a registered asset (`Asset`, identified by its
 * asset number), a serial-tracked durable (`TrackedUnit`, identified by its
 * serial number) or a quantity-tracked durable (`MaterialQuantity`, identified
 * by its material and the quantity still held). None of them is a stock figure.
 */
export const CUSTODY_SUBJECT_TYPE_LABELS_AR = {
  Asset: 'أصل ثابت',
  TrackedUnit: 'معمرة بالتسلسل',
  MaterialQuantity: 'معمرة بكمية',
} as const satisfies Record<CustodySubjectType, string>
