/**
 * Shared documents' view of the active session scope.
 *
 * `useActiveScopeContext` is re-exported from the auth module so shared
 * documents code faces the shared alias instead of a module path. The scope
 * machinery itself stays in `modules/auth` (the session store and service own
 * the scope projection); tests that mock
 * `@/modules/auth/hooks/use-active-scope-context` keep working because this
 * re-export resolves to that same module file.
 */
export { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
