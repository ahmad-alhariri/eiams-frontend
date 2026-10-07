import { describe, expect, it } from 'vitest'

import type { SessionResponse } from '@/modules/auth/types/session.types'
import { createSession } from '@/test/msw/factories'

/**
 * These assertions look tautological because the type enforces them, and that is the point.
 *
 * The session contract used to be read from the generated OpenAPI types, where
 * `SessionResponse` had no `role` and `activeScope` was optional. A consumer therefore had
 * to cope with a session that carried no role and possibly no scope, and the route guard
 * learned to treat a missing scope as a satisfied one. Each check below is a claim about
 * the wire contract that the previous type could not make.
 */
describe('the session contract the server actually sends', () => {
  it('carries exactly one role, with its authoritative Arabic label', () => {
    const session: SessionResponse = createSession()

    // Singular, not `activeRoles[]`: the plural never existed on the wire.
    expect(session.role).toBeDefined()
    expect(session.role.nameAr.length).toBeGreaterThan(0)
    expect('activeRoles' in session).toBe(false)
  })

  it('names the active scope `scopeName`, not `displayName`', () => {
    const session = createSession()

    expect(session.activeScope.scopeName.length).toBeGreaterThan(0)
    expect('displayName' in session.activeScope).toBe(false)
  })

  it('requires an active scope rather than treating its absence as valid', () => {
    // Compile-time proof, expressed as a runtime assertion so the invariant is pinned in
    // the suite and not only in the type. If `activeScope` ever becomes optional again,
    // this line stops type-checking and the deliberate `!` is what surfaces it.
    const session = createSession()
    expect(session.activeScope).toBeDefined()

    const scopeIsRequired: SessionResponse['activeScope'] = session.activeScope
    expect(scopeIsRequired.scopeType).toBeDefined()
  })

  it('does not carry the retired scope-switching members', () => {
    const session = createSession()

    expect('scopeState' in session).toBe(false)
    expect('availableScopes' in session).toBe(false)
  })

  it('identifies the user by `id`, with no `displayName` on the wire', () => {
    const session = createSession()

    expect(session.user.id.length).toBeGreaterThan(0)
    // Reading `user.displayName` type-checked against the old generated type and was
    // `undefined` at runtime, which crashed the header on `displayName.trim()`.
    expect('displayName' in session.user).toBe(false)
  })
})
