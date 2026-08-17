import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import type { SessionResponse } from '@/shared/types/generated/eiams-v1'
import {
  createDocumentPolicy,
  createOperationalAdvisory,
  createWarehouseCapability,
  createWarehouseDocument,
  createWarehouseDocumentLine,
  fixtureUuid,
} from '@/test/msw/factories'
import {
  createWarehouseDocumentDetailHandler,
  createWarehouseDocumentPolicyHandler,
} from '@/test/msw/warehouse-document-handlers'
import { server } from '@/test/msw/server'

/** Mutable session-scope mock; tests swap the effective permissionCodes. */
const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import { useDocumentPolicyGate } from './use-document-policy-gate'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(200)
const WAREHOUSE_ID = fixtureUuid(30)
const DOMAIN_ID = fixtureUuid(20)

const ALL_DOCUMENT_CODES = [
  'document.view',
  'document.update',
  'document.submit',
  'document.post',
  'document.reject',
  'document.revise',
  'document.cancel',
  'document.reverse',
]

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'document.manager',
      displayName: 'مدير المستندات',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function createWrapper(permissionCodes: readonly string[] = ALL_DOCUMENT_CODES) {
  const client = createQueryClient()
  client.setQueryData(authSessionQueryKey, sessionWith(permissionCodes))
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function issueDocument(
  overrides: {
    lines?: ReturnType<typeof createWarehouseDocumentLine>[]
    policy?: ReturnType<typeof createDocumentPolicy>
    status?: 'Draft' | 'Submitted'
  } = {},
) {
  const documentStatus = overrides.status ?? 'Submitted'
  return createWarehouseDocument({
    documentId: DOCUMENT_ID,
    documentType: 'Issue',
    documentStatus,
    lines: overrides.lines ?? [
      createWarehouseDocumentLine({
        lineId: fixtureUuid(201),
        material: { code: 'OFF-SUP-A4', nameAr: 'ورق تصوير A4' },
        quantity: 25,
        availableBalance: 12,
      }),
    ],
    warehouse: { id: WAREHOUSE_ID, displayName: 'مستودع الفرع — حلب' },
    policy:
      overrides.policy ??
      createDocumentPolicy({
        documentId: DOCUMENT_ID,
        documentStatus,
        signedOriginalSatisfied: true,
      }),
  })
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('useDocumentPolicyGate', () => {
  it('composes detail and policy into a balance-blocked preflight and supports the composed refetch', async () => {
    const document = issueDocument()
    let policyRequests = 0
    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
        policyRequests += 1
        return HttpResponse.json(document.policy)
      }),
    )

    const { result } = renderHook(() => useDocumentPolicyGate(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.preflight).not.toBeNull())

    expect(result.current.document?.documentId).toBe(DOCUMENT_ID)
    expect(result.current.policy?.documentStatus).toBe('Submitted')
    expect(result.current.preflight?.status).toBe('blocked')
    expect(result.current.preflight?.gates.find((gate) => gate.gate === 'balance')).toEqual({
      gate: 'balance',
      status: 'blocked',
      messageAr: 'الكمية المطلوبة (٢٥) تتجاوز الرصيد المتاح (١٢) للمادة «ورق تصوير A4».',
    })

    const before = policyRequests
    await result.current.refetch()
    await waitFor(() => expect(policyRequests).toBeGreaterThan(before))
  })

  it('passes ActiveSoftFreeze advisories through without ever blocking the preflight', async () => {
    const document = issueDocument({
      lines: [
        createWarehouseDocumentLine({
          lineId: fixtureUuid(201),
          material: { code: 'OFF-SUP-A4', nameAr: 'ورق تصوير A4' },
          quantity: 6,
          availableBalance: 12,
        }),
      ],
      policy: createDocumentPolicy({
        documentId: DOCUMENT_ID,
        documentStatus: 'Submitted',
        signedOriginalSatisfied: true,
        advisories: [
          createOperationalAdvisory({
            countReference: 'JRY-2026-014',
            messageAr: 'هناك جرد نشط يغطي نطاق هذا المستودع.',
            scopeSummaryAr: 'يشمل مستودع الفرع — حلب',
            warehouseId: WAREHOUSE_ID,
          }),
        ],
      }),
    })
    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    const { result } = renderHook(() => useDocumentPolicyGate(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.preflight).not.toBeNull())

    expect(result.current.preflight?.status).not.toBe('blocked')
    expect(result.current.preflight?.advisories).toHaveLength(1)
    expect(result.current.preflight?.advisories[0]?.code).toBe('ActiveSoftFreeze')
    expect(result.current.preflight?.advisories[0]?.messageAr).toBe(
      'هناك جرد نشط يغطي نطاق هذا المستودع.',
    )
    expect(result.current.preflight?.gates).not.toContainEqual(
      expect.objectContaining({ status: 'blocked' }),
    )
  })

  it('blocks the preflight when the warehouse lacks the capability for a draft line domain', async () => {
    const document = issueDocument({
      status: 'Draft',
      lines: [],
      policy: createDocumentPolicy({
        documentId: DOCUMENT_ID,
        documentStatus: 'Draft',
        signedOriginalSatisfied: false,
      }),
    })
    const capability = createWarehouseCapability({
      warehouseId: WAREHOUSE_ID,
      operations: ['Receiving'],
    })
    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentPolicyHandler(document.policy),
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        HttpResponse.json([capability]),
      ),
    )

    const draftLines = [
      {
        quantity: 2,
        availableBalance: 10,
        materialDomainId: DOMAIN_ID,
        materialNameAr: 'حبر طابعة',
      },
    ]
    const { result } = renderHook(() => useDocumentPolicyGate(DOCUMENT_ID, { lines: draftLines }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.preflight).not.toBeNull())
    await waitFor(() =>
      expect(
        result.current.preflight?.gates.find((gate) => gate.gate === 'capability')?.status,
      ).toBe('blocked'),
    )

    expect(result.current.preflight?.status).toBe('blocked')
    expect(
      result.current.preflight?.gates.find((gate) => gate.gate === 'capability')?.messageAr,
    ).toBe('المستودع لا يمتلك قدرة "صرف" لمجال "تقنية المعلومات".')
  })

  it('composes policy presentation and permission into decisions and canSubmit/canPost', async () => {
    const document = issueDocument()
    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    const { result } = renderHook(() => useDocumentPolicyGate(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.policy).not.toBeNull())

    // Submitted policy: Submit is Disabled by the server, Post is Enabled.
    expect(result.current.decision('Submit').presentation).toBe('Disabled')
    expect(result.current.decision('Submit').reasonAr).toBe('المستند مُرسل بالفعل.')
    expect(result.current.decision('Post').presentation).toBe('Enabled')
    expect(result.current.canSubmit).toBe(false)
    expect(result.current.canPost).toBe(true)
  })

  it('hides actions the session permission set does not allow', async () => {
    const document = issueDocument()
    server.use(
      ...createWarehouseDocumentDetailHandler(document),
      ...createWarehouseDocumentPolicyHandler(document.policy),
    )

    const { result } = renderHook(() => useDocumentPolicyGate(DOCUMENT_ID), {
      wrapper: createWrapper(['document.view']),
    })

    await waitFor(() => expect(result.current.policy).not.toBeNull())

    expect(result.current.decision('Post')).toEqual({ presentation: 'Hidden', reasonAr: null })
    expect(result.current.canPost).toBe(false)
    expect(result.current.canSubmit).toBe(false)
  })
})
