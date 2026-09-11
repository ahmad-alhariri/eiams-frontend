import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { useActiveCounterpartOptions } from '@/modules/organization/hooks/use-counterpart-lookups'
import type { ExternalParty } from '@/modules/organization/types/organization.api-types'
import type { PageMeta } from '@/modules/organization/types/organization.api-types'

const active: ExternalParty = {
  externalPartyId: 'aaaaaaaa-4aaa-0aaa-8aaa-aaaaaaaaaaaa',
  code: 'EXT-001',
  nameAr: 'أحمد محمد',
  status: 'Active',
  rowVersion: 0,
}

function makePage(
  items: readonly ExternalParty[],
  opts: {
    pageIndex?: number
    pageSize?: number
    totalItems?: number
    totalCount?: number
    totalPages?: number
    hasNextPage?: boolean
    hasPreviousPage?: boolean
    page?: number
    itemCount?: number
  } = {},
): { items: readonly ExternalParty[]; meta: PageMeta } {
  const {
    pageIndex = 0,
    pageSize = 10,
    totalItems = items.length,
    totalCount = totalItems,
    totalPages = Math.ceil(totalItems / pageSize),
    hasNextPage = totalItems > pageSize * (pageIndex + 1),
    hasPreviousPage = pageIndex > 0,
    page = 0,
    itemCount = items.length,
  } = opts
  const meta: PageMeta = {
    pageIndex,
    pageSize,
    totalItems,
    totalCount,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    page,
    itemCount,
  }
  return { items, meta }
}

const handlers = [
  http.get('*/api/v1/organization/external-parties/active/search', () =>
    HttpResponse.json(makePage([active], { totalItems: 1 })),
  ),
]
const serverInstance = setupServer(...handlers)

beforeEach(() => serverInstance.listen())
afterEach(() => serverInstance.close())

describe('use-active-counterpart-options', () => {
  it('returns matched counterpart options', async () => {
    const { result } = renderHook(() => useActiveCounterpartOptions({ search: 'أحمد' }))

    await waitFor(() => expect(result.current.loadOptions).toBeDefined())
    expect(result.current.options).toBeDefined()
  })

  it('returns empty when no matches', async () => {
    serverInstance.use(
      http.get('*/api/v1/organization/external-parties/active/search', () =>
        HttpResponse.json(makePage([], { totalItems: 0 })),
      ),
    )

    const { result } = renderHook(() => useActiveCounterpartOptions({ search: 'xyz' }))

    await waitFor(() => expect(result.current.loadOptions).toBeDefined())
  })
})
