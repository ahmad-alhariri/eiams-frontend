/**
 * Contract smoke — coverage item 2: what the harness can reach and what the
 * backend must reject. Health is NOT a frontend-serviced endpoint (no service
 * in `src/modules/**` or `src/shared/**` calls it), so the paced raw
 * `budgetedFetch` is the honest vehicle for it; everything the frontend DOES
 * service goes through the real `apiClient`.
 *
 * Established wire facts:
 * - `GET /api/v1/health/ready` -> 200 `{"status":"Healthy"}`, NOT wrapped in
 *   the success envelope (asserted exactly).
 * - A direct call to the backend port with a foreign `Origin` is rejected
 *   403 `REFRESH_TOKEN_ORIGIN_REJECTED` — proving the origin check is the
 *   backend's, not the proxy's (the same probe through the proxy is asserted
 *   in `auth.contract-smoke.ts`).
 * - The suite proves the harness reports failures honestly: a probe to a dead
 *   port fails loudly, and the negative control (a tautological assertion)
 *   throws.
 */
import { describe, expect, it } from 'vitest'
import { apiClient } from '@/shared/services/api.client'
import { expectWireFailure } from './contract-assert'
import { budgetedFetch } from './contract-budget'
import './contract-api-base'

describe('contract-smoke: reachability guards', () => {
  it('probe to a dead port fails loudly (harness cannot silently pass on unreachable backend)', async () => {
    try {
      await fetch('http://127.0.0.1:59999/api/v1/health/ready', {
        signal: AbortSignal.timeout(2000),
      })
      throw new Error('REACHABILITY DIVERGENCE: expected unreachable but got a response')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/fetch|connect|timeout|econnrefused|abort/i.test(message)) {
        throw new Error(
          `REACHABILITY FAILURE: dead-port probe failed with an unexpected error — observed status=NO_RESPONSE body=${message.slice(0, 400)}`,
          { cause: error },
        )
      }
    }
  })

  it('GET /api/v1/health/ready through the proxy -> 200 {"status":"Healthy"} NOT envelope-wrapped', async () => {
    const response = await budgetedFetch('http://127.0.0.1:5188/api/v1/health/ready')
    const body: unknown = await response.json()
    if (response.status !== 200) {
      throw new Error(
        `HEALTH DIVERGENCE: expected 200 — observed status=${response.status} body=${JSON.stringify(body).slice(0, 400)}`,
      )
    }
    const record = body as Record<string, unknown>
    if (record['status'] !== 'Healthy') {
      throw new Error(
        `HEALTH SHAPE DIVERGENCE: expected {"status":"Healthy"} (no envelope) — observed status=${response.status} body=${JSON.stringify(body).slice(0, 400)}`,
      )
    }
    expect(record['success']).toBeUndefined()
  })

  it('direct call to backend :5000 with foreign Origin -> exact 403 REFRESH_TOKEN_ORIGIN_REJECTED', async () => {
    await expectWireFailure(
      'direct cross-origin refresh rejection',
      () =>
        apiClient.post('http://127.0.0.1:5000/api/v1/auth/refresh', undefined, {
          headers: { Origin: 'http://evil.origin' },
        }),
      403,
      'REFRESH_TOKEN_ORIGIN_REJECTED',
    )
  })

  it('[NEGATIVE] tautology control: the suite must be able to fail', () => {
    expect(() => expect(true).toBe(false)).toThrow()
  })
})
