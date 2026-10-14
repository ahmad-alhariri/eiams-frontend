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

/**
 * ONE ESLint instance for every probe in this file.
 *
 * Each `new ESLint()` re-reads and re-resolves the whole flat config from disk,
 * so building one per probe made this suite pay that cost eight times over.
 *
 * The dominant cost is unavoidable: ESLint must resolve the flat config at
 * least once, which measures ~2.4s here, while every later probe costs 10–20ms.
 * That first resolution used to land inside the FIRST probe's assertion window.
 * On an idle machine it fit comfortably inside the 20s default, but in the full
 * suite — where 297 files compete for the same workers — it occasionally blew
 * past it, failing a suite that passes every time it is run alone. `PROBE_TIMEOUT`
 * below gives the config resolution room to finish on a loaded machine. It does
 * NOT relax any assertion: a probe that fails to report its violation still fails.
 */
const SHARED_ESLINT = new ESLint({ cwd: process.cwd() })

const PROBE_TIMEOUT = 60_000

async function lint(code: string): Promise<string[]> {
  const [result] = await SHARED_ESLINT.lintText(code, {
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

describe(
  'envelope guard: a service may not read .data',
  () => {
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
  },
  PROBE_TIMEOUT,
)

describe(
  'envelope guard: a service may not call an HTTP client directly',
  () => {
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
  },
  PROBE_TIMEOUT,
)

describe(
  'the guards actually run against the real service files',
  () => {
    it('finds no .data read left in any service today', async () => {
      // The other half of non-vacuity: if the compliant fixtures above are the only
      // clean cases, this proves the migration is complete rather than proving the
      // rule is toothless.
      //
      // Every glob is mirrored from the `files` list of the guard block in
      // `eslint.config.js`, so a path that moves has to move in both places — a
      // glob that matches nothing throws here instead of quietly guarding nothing.
      // `axios-transport.ts` is intentionally absent: it is the one sanctioned
      // unwrapper, excluded from the guard itself.
      const results = await SHARED_ESLINT.lintFiles([
        'src/modules/*/services/*.service.ts',
        'src/shared/documents/*-service.ts',
        'src/shared/documents/*-transport.ts',
        'src/shared/api/api-transport.ts',
        'src/shared/api/transport.ts',
      ])

      const offences = results.flatMap((result) =>
        result.messages
          .filter((message) => message.ruleId === 'no-restricted-syntax')
          .map((message) => `${result.filePath}: ${message.message}`),
      )

      expect(offences).toEqual([])
    })
  },
  PROBE_TIMEOUT,
)
