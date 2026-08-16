import type {
  CounterpartOption,
  CounterpartType,
  operations,
} from '@/shared/types/generated/eiams-v1'

/** Contract-derived, server-scoped filters for active write choices. */
export type SearchCounterpartsQuery = NonNullable<
  operations['searchCounterparts']['parameters']['query']
>

/** Stable polymorphic identity carried by Issue and Custody write payloads. */
export type CounterpartReference = Pick<CounterpartOption, 'type' | 'id'>

export interface CounterpartSearchOptions {
  type?: CounterpartType
  siteId?: string
}

export interface CounterpartWriteValidation {
  isValid: boolean
  messageAr?: string
}

/** Arabic status text for read-only historical displays. */
export function counterpartStatusLabelAr(counterpart: CounterpartOption): string {
  return counterpart.status === 'Active' ? 'نشط' : 'غير نشط'
}

/**
 * A browser may only submit an option that is still active. The document and
 * custody APIs repeat this validation server-side for scope, existence, and
 * race safety; this guard only gives the form an immediate Arabic response.
 */
export function validateCounterpartForWrite(
  counterpart: CounterpartOption | undefined,
): CounterpartWriteValidation {
  if (counterpart === undefined) {
    return { isValid: false, messageAr: 'اختر جهة مستلمة أو حائزة نشطة.' }
  }

  if (counterpart.status !== 'Active') {
    return {
      isValid: false,
      messageAr: 'الجهة المختارة غير نشطة. اختر جهة نشطة أخرى قبل المتابعة.',
    }
  }

  return { isValid: true }
}
