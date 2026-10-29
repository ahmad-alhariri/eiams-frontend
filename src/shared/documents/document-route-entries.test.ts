import { describe, expect, it } from 'vitest'

import { ROUTE_PATHS } from '@/config/routes'
import {
  DOCUMENT_LIST_ROUTE_ENTRIES,
  ISSUE_DOCUMENT_LIST_ENTRY,
  OPENING_DOCUMENT_LIST_ENTRY,
  RECEIVING_DOCUMENT_LIST_ENTRY,
  RETURN_DOCUMENT_LIST_ENTRY,
  TRANSFER_DOCUMENT_LIST_ENTRY,
  type DocumentRouteEntry,
} from '@/shared/documents/document-route-entries'
import { readSource } from '@/test/support/source-scan'

/**
 * The route → document-type mapping has ONE owner: this module. The shared
 * list page used to declare its own copy of the map, so the same data lived
 * in two places and drifted.
 */
describe('document route entries', () => {
  it('maps every document-list route to its entry', () => {
    expect(DOCUMENT_LIST_ROUTE_ENTRIES[ROUTE_PATHS.documentReceiving]).toBe(
      RECEIVING_DOCUMENT_LIST_ENTRY,
    )
    expect(DOCUMENT_LIST_ROUTE_ENTRIES[ROUTE_PATHS.documentIssue]).toBe(ISSUE_DOCUMENT_LIST_ENTRY)
    expect(DOCUMENT_LIST_ROUTE_ENTRIES[ROUTE_PATHS.documentTransfer]).toBe(
      TRANSFER_DOCUMENT_LIST_ENTRY,
    )
    expect(DOCUMENT_LIST_ROUTE_ENTRIES[ROUTE_PATHS.documentOpening]).toBe(
      OPENING_DOCUMENT_LIST_ENTRY,
    )
    expect(DOCUMENT_LIST_ROUTE_ENTRIES[ROUTE_PATHS.documentReturn]).toBe(RETURN_DOCUMENT_LIST_ENTRY)
  })

  it('covers exactly the five document types the shared list serves', () => {
    expect(Object.values(DOCUMENT_LIST_ROUTE_ENTRIES).map((entry) => entry.documentType)).toEqual([
      'Receiving',
      'Issue',
      'Transfer',
      'Opening',
      'Return',
    ])
  })

  it.each([
    ['Receiving', RECEIVING_DOCUMENT_LIST_ENTRY],
    ['Issue', ISSUE_DOCUMENT_LIST_ENTRY],
    ['Transfer', TRANSFER_DOCUMENT_LIST_ENTRY],
    ['Opening', OPENING_DOCUMENT_LIST_ENTRY],
    ['Return', RETURN_DOCUMENT_LIST_ENTRY],
  ])('binds the %s entry to its own list, detail and create routes', (documentType, entry) => {
    const typedEntry: DocumentRouteEntry = entry
    expect(typedEntry.documentType).toBe(documentType)
    expect(ROUTE_PATHS[typedEntry.routeKey]).toContain('/documents/')
    expect(ROUTE_PATHS[typedEntry.detailRouteKey]).toContain(':documentId')
    expect(ROUTE_PATHS[typedEntry.createRouteKey]).toMatch(/\/new$/)
    // The Arabic create label is the one the list header shows.
    expect(typedEntry.createLabelAr).toMatch(/[\u0600-\u06FF]/u)
  })

  it('is the only place the list route entries are declared', () => {
    // Two sources of truth for the same data drift, so the shared list page
    // must not declare a map of its own.
    const pageSource = readSource('src/shared/documents/pages/document-list-page.tsx')
    expect(pageSource).toContain("from '@/shared/documents/document-route-entries'")
    expect(pageSource).not.toContain('const DOCUMENT_LIST_ROUTE_ENTRIES')
  })
})
