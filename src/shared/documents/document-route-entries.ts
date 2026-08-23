import type { RouteKey } from '@/config/routes'
import type { WarehouseDocument } from '@/shared/types/generated/eiams-v1'

/**
 * Pinned document-list entries shared by the route-driven shared list page
 * and the per-module page seams (receiving, issue, ...). Kept outside the
 * component file so both stay fast-refresh compatible.
 */
export type DocumentRouteEntry = {
  documentType: WarehouseDocument['documentType']
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
