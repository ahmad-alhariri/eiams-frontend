/**
 * Contract-derived server-side filters for the administration user directory.
 *
 * Declared in the admin module rather than taken from the generated `operations`
 * map: that map advertised `pageIndex`, which the backend does not bind. It reads
 * `page` (1-based) and silently ignored `pageIndex`, so every "page 2" request
 * returned page 1. `gg1m` tracks the same defect across the other list pages.
 */
export type { ListUsersRequest as ListUsersQuery } from '@/modules/admin/types/user.types'
