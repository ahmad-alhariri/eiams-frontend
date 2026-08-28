import type { operations } from '@/shared/types/generated/eiams-v1'

/** Contract-derived server-side filters for the administration user directory. */
export type ListUsersQuery = NonNullable<operations['listUsers']['parameters']['query']>
