import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Revert-proof: if the transport stops using the shared unwrap helper,
 * this source-scan fails. The transport is the ONLY production consumer
 * of `unwrapData`; removing the call would make the helper dead again.
 */
describe('transport unwrap discipline', () => {
  it('calls unwrapData inside the shared transport (harness path)', () => {
    const source = readFileSync(join(process.cwd(), 'src/shared/services/api.client.ts'), 'utf8')
    expect(source).toContain('unwrapData(')
  })

  it('calls unwrapData inside the production transport', () => {
    const source = readFileSync(join(process.cwd(), 'src/shared/api/axios-transport.ts'), 'utf8')
    expect(source).toContain('unwrapData(')
  })
})
