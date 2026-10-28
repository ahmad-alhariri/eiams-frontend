import { ROUTE_PATHS, type RouteKey } from '@/config/routes'
import type { DocumentType } from '@/shared/documents/types/document-wire.types'

/**
 * Pinned document-list entries shared by the route-driven shared list page
 * and the per-module page seams (receiving, issue, ...). Kept outside the
 * component file so both stay fast-refresh compatible — and it is the ONE
 * place the route → document-type mapping lives.
 */
export type DocumentRouteEntry = {
  documentType: DocumentType
  detailRouteKey: RouteKey
  routeKey: RouteKey
  /** New-document route opened by the create action in the list header. */
  createRouteKey: RouteKey
  /** Arabic label for the create action, e.g. 'سند استلام جديد'. */
  createLabelAr: string
}

/** Receiving list entry — owned by the receiving module seam (e13-t02). */
export const RECEIVING_DOCUMENT_LIST_ENTRY: DocumentRouteEntry = {
  routeKey: 'documentReceiving',
  detailRouteKey: 'documentReceivingDetail',
  createRouteKey: 'documentReceivingNew',
  createLabelAr: 'سند استلام جديد',
  documentType: 'Receiving',
}

/** Opening-balance list entry — owned by the opening module seam (e15-t01). */
export const OPENING_DOCUMENT_LIST_ENTRY: DocumentRouteEntry = {
  routeKey: 'documentOpening',
  detailRouteKey: 'documentOpeningDetail',
  createRouteKey: 'documentOpeningNew',
  createLabelAr: 'سند رصيد افتتاحي جديد',
  documentType: 'Opening',
}

/** Issue list entry — owned by the issue module seam (e16-t02). */
export const ISSUE_DOCUMENT_LIST_ENTRY: DocumentRouteEntry = {
  routeKey: 'documentIssue',
  detailRouteKey: 'documentIssueDetail',
  createRouteKey: 'documentIssueNew',
  createLabelAr: 'سند إصدار جديد',
  documentType: 'Issue',
}

/** Transfer list entry — owned by the transfer module seam (e17). */
export const TRANSFER_DOCUMENT_LIST_ENTRY: DocumentRouteEntry = {
  routeKey: 'documentTransfer',
  detailRouteKey: 'documentTransferDetail',
  createRouteKey: 'documentTransferNew',
  createLabelAr: 'سند تحويل جديد',
  documentType: 'Transfer',
}

/** Return list entry — owned by the return module seam (e19). */
export const RETURN_DOCUMENT_LIST_ENTRY: DocumentRouteEntry = {
  routeKey: 'documentReturn',
  detailRouteKey: 'documentReturnDetail',
  createRouteKey: 'documentReturnNew',
  createLabelAr: 'سند إرجاع جديد',
  documentType: 'Return',
}

/**
 * Every document-list route the shared page serves, keyed by its path.
 *
 * The single source of truth for "which document type does this list URL
 * show". The shared page used to keep its own copy of this map, which
 * duplicated the entries above and drifted from them.
 */
export const DOCUMENT_LIST_ROUTE_ENTRIES: Readonly<Record<string, DocumentRouteEntry>> = {
  [ROUTE_PATHS.documentReceiving]: RECEIVING_DOCUMENT_LIST_ENTRY,
  [ROUTE_PATHS.documentIssue]: ISSUE_DOCUMENT_LIST_ENTRY,
  [ROUTE_PATHS.documentTransfer]: TRANSFER_DOCUMENT_LIST_ENTRY,
  [ROUTE_PATHS.documentOpening]: OPENING_DOCUMENT_LIST_ENTRY,
  [ROUTE_PATHS.documentReturn]: RETURN_DOCUMENT_LIST_ENTRY,
}
