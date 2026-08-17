import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { type PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/shared/services/query.client'
import type {
  DocumentLifecycleHistory,
  DocumentPolicy,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import { createNamedReference, createPage, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const activeScope = vi.hoisted(() => ({
  key: { kind: 'enterprise' as const } as { kind: 'enterprise' } | undefined,
}))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

import {
  documentQueryKeys,
  useDocumentDetailQuery,
  useDocumentHistoryQuery,
  useDocumentListQuery,
  useDocumentPolicyQuery,
} from './use-document-queries'

const API_BASE_URL = '/api/v1'
const DOCUMENT_ID = fixtureUuid(60)
const WAREHOUSE_ID = fixtureUuid(30)
const TIMESTAMP = '2026-08-12T09:00:00.000Z'

function createPolicyFixture(): DocumentPolicy {
  return {
    actions: [],
    advisories: [],
    blockers: [],
    documentId: DOCUMENT_ID,
    documentStatus: 'Draft',
    evaluatedAt: TIMESTAMP,
    policyKind: 'Generic',
    rowVersion: 1,
    signedOriginalSatisfied: false,
  }
}

function createDocumentFixture(): WarehouseDocument {
  return {
    attachments: [],
    createdAt: TIMESTAMP,
    createdBy: createNamedReference({ id: fixtureUuid(10), displayName: 'أمين المستودع' }),
    documentId: DOCUMENT_ID,
    documentStatus: 'Submitted',
    documentType: 'Receiving',
    lines: [],
    paperDocumentNumber: 'DOC-001',
    paperDocumentYear: 2026,
    policy: createPolicyFixture(),
    rowVersion: 1,
    site: createNamedReference({ id: fixtureUuid(31), displayName: 'المقر الرئيسي' }),
    systemReferenceNumber: 'RCP-2026-0001',
    warehouse: createNamedReference({ id: WAREHOUSE_ID, displayName: 'المستودع المركزي' }),
  }
}

function createHistoryFixture(): DocumentLifecycleHistory {
  return {
    currentRowVersion: 1,
    currentStatus: 'Submitted',
    documentId: DOCUMENT_ID,
    events: [],
  }
}

function createWrapper() {
  const client = createQueryClient()
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

describe('document query hooks', () => {
  it('uses scope-isolated keys for document lists, detail, history, and policy', () => {
    const scope = { kind: 'enterprise' as const }
    const filters = { documentStatus: 'Submitted' as const }

    expect(documentQueryKeys.documents(scope, filters)).toEqual([
      'scoped',
      'enterprise',
      null,
      'document',
      'documents',
      filters,
    ])
    expect(documentQueryKeys.document(scope, DOCUMENT_ID)).toEqual([
      'scoped',
      'enterprise',
      null,
      'document',
      'documents',
      DOCUMENT_ID,
    ])
    expect(documentQueryKeys.history(scope, DOCUMENT_ID)).toEqual([
      'scoped',
      'enterprise',
      null,
      'document',
      'documents',
      DOCUMENT_ID,
      'history',
    ])
    expect(documentQueryKeys.policy(scope, DOCUMENT_ID)).toEqual([
      'scoped',
      'enterprise',
      null,
      'document',
      'documents',
      DOCUMENT_ID,
      'policy',
    ])
  })

  it('reads documents, detail, history, and policy through scoped operational queries', async () => {
    const document = createDocumentFixture()
    const history = createHistoryFixture()
    const policy = createPolicyFixture()

    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () =>
        HttpResponse.json(createPage([document])),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () =>
        HttpResponse.json(document),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () =>
        HttpResponse.json(history),
      ),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () =>
        HttpResponse.json(policy),
      ),
    )

    const list = renderHook(
      () => useDocumentListQuery({ documentStatus: 'Submitted', pageSize: 25 }),
      { wrapper: createWrapper() },
    )
    const detail = renderHook(() => useDocumentDetailQuery(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    const historyHook = renderHook(() => useDocumentHistoryQuery(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })
    const policyHook = renderHook(() => useDocumentPolicyQuery(DOCUMENT_ID), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true)
      expect(detail.result.current.isSuccess).toBe(true)
      expect(historyHook.result.current.isSuccess).toBe(true)
      expect(policyHook.result.current.isSuccess).toBe(true)
    })

    expect(list.result.current.data?.items).toEqual([document])
    expect(detail.result.current.data).toEqual(document)
    expect(historyHook.result.current.data).toEqual(history)
    expect(policyHook.result.current.data).toEqual(policy)
  })

  it('does not request document data before a server-selected scope exists', async () => {
    activeScope.key = undefined
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents`, () => {
        requestCount += 1
        return HttpResponse.json(createPage([createDocumentFixture()]))
      }),
    )

    const { result } = renderHook(() => useDocumentListQuery({ search: 'حاسوب' }), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'))
    expect(result.current.data).toBeUndefined()
    expect(requestCount).toBe(0)
  })

  it('does not request detail, history, or policy without a document id', async () => {
    let requestCount = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}`, () => {
        requestCount += 1
        return HttpResponse.json(createDocumentFixture())
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/history`, () => {
        requestCount += 1
        return HttpResponse.json(createHistoryFixture())
      }),
      http.get(`${API_BASE_URL}/warehouse-documents/${DOCUMENT_ID}/policy`, () => {
        requestCount += 1
        return HttpResponse.json(createPolicyFixture())
      }),
    )

    const detail = renderHook(() => useDocumentDetailQuery(null), {
      wrapper: createWrapper(),
    })
    const historyHook = renderHook(() => useDocumentHistoryQuery(null), {
      wrapper: createWrapper(),
    })
    const policyHook = renderHook(() => useDocumentPolicyQuery(null), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(detail.result.current.fetchStatus).toBe('idle')
      expect(historyHook.result.current.fetchStatus).toBe('idle')
      expect(policyHook.result.current.fetchStatus).toBe('idle')
    })

    expect(requestCount).toBe(0)
  })
})
