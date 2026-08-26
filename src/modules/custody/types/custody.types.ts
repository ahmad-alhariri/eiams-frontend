import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived filters and server-side ordering for custody reads (e19-t01). */
export type ListCustodiesQuery = NonNullable<operations['listCustodies']['parameters']['query']>
export type CustodyMutationRequest =
  operations['assignCustody']['requestBody']['content']['application/json']
