/**
 * Assertion helpers for the contract suite.
 *
 * THE EVIDENCE CONTRACT (coverage item 4): every failing assertion names the
 * EXACT observed HTTP status and the response body verbatim, truncated to 400
 * characters. "error status <404" or a bare axios error is not acceptable
 * evidence — a reviewer must be able to classify the divergence from the
 * message alone.
 */
import axios from 'axios'
import { readApiError } from '@/shared/api/envelope'

/** `observed status=<n> body=<verbatim, 400 chars>` for any thrown transport error. */
export function wireEvidence(error: unknown): string {
  if (axios.isAxiosError(error) && error.response !== undefined) {
    return `observed status=${error.response.status} body=${JSON.stringify(error.response.data).slice(0, 400)}`
  }
  if (axios.isAxiosError(error)) {
    return `observed status=NO_RESPONSE body=${error.message.slice(0, 400)}`
  }
  return `observed status=NO_RESPONSE body=${String(error).slice(0, 400)}`
}

/**
 * Fails with exact evidence when `action` does NOT throw with the expected
 * status + wire code. The success path itself is the divergence: record the
 * envelope verbatim before throwing.
 */
export async function expectWireFailure(
  context: string,
  action: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode?: string,
): Promise<never> {
  let success: unknown
  try {
    success = await action()
  } catch (error: unknown) {
    if (!axios.isAxiosError(error) || error.response?.status !== expectedStatus) {
      throw new Error(`${context}: expected status=${expectedStatus} — ${wireEvidence(error)}`, {
        cause: error,
      })
    }
    const code = readWireCode(error)
    if (expectedCode !== undefined && code !== expectedCode) {
      throw new Error(
        `${context}: expected status=${expectedStatus} code=${expectedCode} — observed code=${code ?? 'NO_CODE'} body=${JSON.stringify(error.response.data).slice(0, 400)}`,
        { cause: error },
      )
    }
    return undefined as never
  }
  throw new Error(
    `${context}: expected status=${expectedStatus} but the call SUCCEEDED — observed body=${JSON.stringify(success).slice(0, 400)}`,
  )
}

/** Normalized wire error code of an axios failure, or null. */
export function readWireCode(error: unknown): string | null {
  if (!axios.isAxiosError(error)) {
    return null
  }
  return readApiError(error.response?.data)?.code ?? null
}
