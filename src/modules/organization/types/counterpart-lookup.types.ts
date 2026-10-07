import type { ExternalParty } from '@/modules/organization/types/organization.api-types'
import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived, server-scoped filters for active write choices. */
export type SearchCounterpartsQuery = NonNullable<
  operations['searchCounterparts']['parameters']['query']
>

/** A resolved counterpart reference for write flows. */
export type CounterpartReference = {
  type?: string
  id: string
}

/** Server-side filter shape for counterpart list queries. */
export interface CounterpartSearchOptions {
  search?: string
  siteId?: string
  scopeSenderId?: string
  filters?: string
}

/** Map a counterpart status value to its Arabic UI label. */
export function counterpartStatusLabelAr(counterpart: ExternalParty): string {
  return counterpart.status === 'Inactive' ? 'غير نشط' : 'نشط'
}

/** Returns a write-ready counterpart reference or null when the option is unusable. */
export function validateCounterpartForWrite(
  counterpart: ExternalParty | undefined,
): { isValid: true; reference: CounterpartReference } | { isValid: false; messageAr: string } {
  if (!counterpart) {
    return { isValid: false, messageAr: 'اختر جهة مستلمة أو حائزة نشطة.' }
  }
  if (counterpart.status !== 'Active') {
    return {
      isValid: false,
      messageAr: 'الجهة المختارة غير نشطة. اختر جهة نشطة أخرى قبل المتابعة.',
    }
  }
  return { isValid: true, reference: { type: 'ExternalParty', id: counterpart.externalPartyId } }
}
