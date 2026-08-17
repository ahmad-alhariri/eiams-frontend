import type { DocumentStatus } from '@/shared/types/generated/eiams-v1'

/**
 * Single source of truth for the document mutability window (D-ATT-01
 * "Attachment lifetime"): only `Draft` is mutable — including the post-Revise
 * Draft, which is still `Draft`. Submitted / Rejected / Posted / Reversed /
 * Cancelled are read-only.
 */
export function isDocumentMutable(status: DocumentStatus | undefined): boolean {
  return status === 'Draft'
}

/** Arabic explanation of the read-only window per status; `null` when mutable or unknown. */
const READ_ONLY_REASONS_AR: Readonly<Partial<Record<DocumentStatus, string>>> = {
  Submitted: 'المستند مُرسل ولا يمكن تعديله',
  Rejected: 'المستند مرفوض — استخدم «مراجعة» لإعادة فتح التعديل',
  Posted: 'المستند مُرصد وهو غير قابل للتعديل',
  Reversed: 'المستند معكوس وهو غير قابل للتعديل',
  Cancelled: 'المستند ملغى ولا يمكن تعديله',
}

/**
 * Arabic reason a document cannot be edited. `null` for a mutable Draft, for
 * an unknown status, and when the status is not loaded yet.
 */
export function documentReadOnlyReasonAr(status: DocumentStatus | undefined): string | null {
  if (status === undefined) {
    return null
  }
  return READ_ONLY_REASONS_AR[status] ?? null
}
