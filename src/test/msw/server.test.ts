import { http } from 'msw'
import { describe, expect, it } from 'vitest'
import { okJson } from './envelope'
import { createSession } from './factories'
import { server } from './server'

/**
 * Harness self-test, NOT a session-endpoint test. What it proves is that a
 * handler registered through `server.use` intercepts a matching request at all;
 * the session payload is incidental, so it comes from the shared factory rather
 * than being hand-rolled here.
 *
 * The hand-rolled fixture this replaced carried the pre-D-SRS-01 legacy shape
 * (`{user: {userId, username, displayName, status, rowVersion}, permissionCodes}`)
 * and answered it with a bare `HttpResponse.json`. That is two facts about a
 * deleted contract asserted by the file whose job is to assert nothing about
 * contracts, so a future reader could reasonably have believed the shape was
 * live. `okJson` + `createSession` leave the assertion about interception and
 * nothing else.
 */
describe('MSW test server baseline', () => {
  it('intercepts a contract endpoint and returns the fixture', async () => {
    const fixture = createSession()

    server.use(http.get('/api/v1/auth/session', () => okJson(fixture)))

    const response = await fetch('/api/v1/auth/session')
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toMatchObject({ success: true, data: fixture })
  })
})
