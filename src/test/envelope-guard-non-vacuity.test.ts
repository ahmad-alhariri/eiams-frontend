import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/**
 * NON-VACUITY PROOF for the two envelope guards added to `eslint.config.js` in
 * `eiams-frontend-t77l`.
 *
 * A lint rule that never fires is indistinguishable from a rule that is not
 * there. `eiams-frontend-t77l`'s acceptance criteria require these rules be
 * "proven non-vacuous by a deliberate violation", so this runs the real ESLint
 * API over source that violates each rule on purpose and asserts it is
 * reported. It also asserts the compliant shape does NOT report, because a rule
 * that fires on everything is equally useless.
 *
 * The violations are linted as text at a path inside one of the globs the config
 * targets, so nothing is written to the working tree. They also assert the
 * compliant shape does NOT report, because a rule that fires on everything is
 * equally useless.
 */

// The path must sit inside the exact globs the config targets
// (`src/modules/*/services/*.service.ts`) or the service-purity block does not
// apply to it at all and every assertion below passes vacuously.
const SERVICE_GLOB_DIR = 'src/modules/envelope-guard-probe/services'

async function lint(code: string): Promise<string[]> {
  const eslint = new ESLint({ cwd: process.cwd() })
  const [result] = await eslint.lintText(code, {
    filePath: `${SERVICE_GLOB_DIR}/probe.service.ts`,
  })
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-error')
}

const COMPLIANT = `
import type { ApiTransport } from '@/shared/api/api-transport'

interface Role {
  readonly roleId: string
  readonly code: string
}

export function createProbeService(transport: ApiTransport) {
  return {
    async getRole(roleId: string): Promise<Role> {
      const role = await transport.request<Role>({
        path: \`/roles/\${roleId}\`,
        method: 'GET',
      })
      return role
    },
  }
}
`

describe('envelope guard: a service may not read .data', () => {
  it('reports a leftover hand-unwrap of the envelope', async () => {
    const violations = await lint(`
      export async function bad(transport: ApiTransport) {
        const response = await transport.request<{ id: string }>({ path: '/x', method: 'GET' })
        return response.data
      }
    `)

    expect(violations).toContain('no-restricted-syntax')
  })

  it('reports a .data read reached through any receiver', async () => {
    // The rule is intentionally receiver-agnostic. A payload that happens to own
    // a `data` field is a real possibility, and the fix is to rename the field or
    // read it in the hook boundary — not to widen the escape hatch that let the
    // original drift through.
    const violations = await lint(`
      export function readIt(response: { data: unknown }) {
        return response.data
      }
    `)

    expect(violations).toContain('no-restricted-syntax')
  })

  it('does not report a service that takes the payload directly', async () => {
    expect(await lint(COMPLIANT)).not.toContain('no-restricted-syntax')
  })
})

describe('envelope guard: a service may not call an HTTP client directly', () => {
  it.each(['get', 'post', 'put', 'patch', 'delete'])(
    'reports client.%s(...) bypassing the transport',
    async (method) => {
      const violations = await lint(`
        export async function bad(client: { ${method}(path: string): Promise<unknown> }) {
          const response = await client.${method}('/x')
          return response
        }
      `)

      expect(violations).toContain('no-restricted-syntax')
    },
  )

  it('reports a bare fetch, which the pre-existing rule also covers', async () => {
    expect(await lint(`export const go = () => fetch('/x')`)).toContain('no-restricted-syntax')
  })

  it('does not report the transport methods themselves', async () => {
    const violations = await lint(`
      export async function fine(transport: ApiTransport) {
        const page = await transport.requestPage<{ id: string }>({ path: '/x', method: 'GET' })
        await transport.requestEmpty({ path: '/x', method: 'DELETE' })
        return page
      }
    `)

    expect(violations).not.toContain('no-restricted-syntax')
  })
})

describe('the guards actually run against the real service files', () => {
  it('finds no .data read left in any service today', async () => {
    // The other half of non-vacuity: if the compliant fixtures above are the only
    // clean cases, this proves the migration is complete rather than proving the
    // rule is toothless.
    const eslint = new ESLint({ cwd: process.cwd() })
    const results = await eslint.lintFiles([
      'src/modules/*/services/*.service.ts',
      'src/shared/documents/*-service.ts',
      'src/shared/documents/*-transport.ts',
      'src/shared/services/*-transport.ts',
    ])

    const offences = results.flatMap((result) =>
      result.messages
        .filter((message) => message.ruleId === 'no-restricted-syntax')
        .map((message) => `${result.filePath}: ${message.message}`),
    )

    expect(offences).toEqual([])
  })
})
