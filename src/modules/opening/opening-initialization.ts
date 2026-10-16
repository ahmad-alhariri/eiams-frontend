import type { WarehouseInitializationStatus } from '@/modules/warehouse/types/warehouse.api-types'

/**
 * D-OPEN-02 (PRD §6.2, §6.4, §6.10, §6.12): an Opening document is a
 * one-time initialization operation, not a routine document type. Once a
 * warehouse carries an `Initialized` state row — whether it was initialized
 * with positive Opening movements or through the explicit zero-stock path —
 * a new Initial Opening document for that warehouse is refused.
 *
 * This module answers one question, in one place, for the draft form: does the
 * server-reported warehouse state stop the user from starting a new Opening
 * draft? The server stays authoritative either way — `OpeningSubmissionValidator`
 * refuses the submission and `OpeningPostingStrategy` refuses the post — so the
 * honest thing to do here is refuse early and say why, not to infer eligibility
 * the browser cannot know.
 *
 * `Reversed` deliberately does NOT block. The read endpoint reports it with the
 * source document and as-of date preserved for audit, and its own contract note
 * says re-initialization is "not permitted by the default policy" without the
 * wire saying so. Blocking on it would be the browser inventing a rule; letting
 * the server answer is the honest path.
 */

/** True when the warehouse's reported state refuses a new Initial Opening document. */
export function blocksNewOpeningDocument(
  status: WarehouseInitializationStatus | undefined | null,
): boolean {
  return status === 'Initialized' || status === 'ZeroStock'
}

/**
 * Arabic explanation for the blocked action, or `null` when the form is not
 * blocked. The wording states the observed server state and its consequence;
 * it never claims a write was rejected, because none has been attempted.
 */
export function openingInitializationBlockMessageAr(
  status: WarehouseInitializationStatus | undefined | null,
): string | null {
  switch (status) {
    case 'Initialized':
      return 'سبق تهيئة هذا المستودع برصيد افتتاحي، لذلك لا يمكن إنشاء سند افتتاحي جديد. تُسجَّل تصحيحات الرصيد عبر مستند تسوية.'
    case 'ZeroStock':
      return 'سبق تهيئة هذا المستودع على أنه فارغ، لذلك لا يمكن إنشاء سند افتتاحي جديد.'
    default:
      return null
  }
}
