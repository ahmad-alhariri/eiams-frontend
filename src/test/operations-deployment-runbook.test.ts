import runbookRaw from '../../docs/operations-deployment-runbook.md?raw'
import { describe, expect, it } from 'vitest'

describe('operations and deployment runbook', () => {
  it('requires immutable quality, contract, and backend-ratification evidence before promotion', () => {
    expect(runbookRaw).toContain('pnpm install --frozen-lockfile')
    expect(runbookRaw).toContain('pnpm run contract:validate')
    expect(runbookRaw).toContain('pnpm run quality')
    expect(runbookRaw).toContain('eiams-frontend-e01.7')
  })

  it('preserves the same-origin HTTPS and non-persistence security boundary', () => {
    expect(runbookRaw).toContain('Proxy `/api/v1`')
    expect(runbookRaw).toContain('`Secure`, `HttpOnly`, `SameSite=Strict`')
    expect(runbookRaw).toContain('must not contain an\nabsolute host')
    expect(runbookRaw).toContain('Never attach screenshots')
  })

  it('defines safe smoke, rollback, and unresolved-release gates', () => {
    expect(runbookRaw).toContain('Post-deploy smoke checks')
    expect(runbookRaw).toContain('Do not use a production document post')
    expect(runbookRaw).toContain('Incident, rollback, and recovery')
    expect(runbookRaw).toContain('not ready for production')
  })
})
