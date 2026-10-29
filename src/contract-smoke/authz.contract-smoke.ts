/**
 * Contract smoke — coverage item 5: authorization denials across the seeded
 * role matrix, driven ONLY through the frontend's real service layer.
 *
 * FOUR logins in this file (keeper, auditor, admin, suspended probe.keeper) —
 * one per user, cached by `createFileSession` and reused by every test below.
 *
 * Established wire facts asserted EXACTLY here (see `docs/contract-smoke.md`):
 * - Keeper CAN create a draft (`document.create`) but `document.post` is denied
 *   with a deliberate 404 `WAREHOUSE_DOCUMENTS_NOT_FOUND`, NOT 403: the backend
 *   answers 404 for both "no such document" and "not authorized" so a document
 *   id is never leaked across warehouse scope
 *   (`eiams-backend/src/Web.Api/Controllers/WarehouseDocuments/PostDocumentController.cs:19-26`).
 * - Auditor (read-everything) has no admin permissions: `GET /admin/users`
 *   -> 403 `AUTHORIZATION_FORBIDDEN`.
 * - Admin (SYSTEM_ADMIN, no `asset.view`): `GET /assets`
 *   -> 403 `AUTHORIZATION_FORBIDDEN`.
 * - A suspended user's LOGIN ITSELF is rejected 403 `USERS_SUSPENDED`; no
 *   session is ever installed.
 * The admin-family pagination check lives here too because it needs the admin
 * login: `adminService.listUsers` pages 1 and 2 return differing rows with a
 * full meta shape.
 */
import { describe, expect, it } from 'vitest'
import { adminService } from '@/modules/admin/services/admin.service'
import { assetService } from '@/modules/asset/services/asset.service'
import { documentService } from '@/shared/documents/document-transport'
import { createIdempotentRequest } from '@/shared/services/mutation-safety'
import { expectWireFailure } from './contract-assert'
import { createFileSession } from './contract-session'
import './contract-api-base'

const WAREHOUSE_ID = '373ba70c-aa2c-466d-b9b5-a9df47abf8da'

const fileSession = createFileSession()

describe('contract-smoke: authorization denials (4 roles, one login each)', () => {
  it('keeper document.post on a real draft -> exact 404 WAREHOUSE_DOCUMENTS_NOT_FOUND (deliberate anti-scope-leak)', async () => {
    await fileSession.login('keeper')
    const documentId = await documentService.createDocument({
      warehouseId: WAREHOUSE_ID,
      documentType: 'Receiving',
    })
    const draft = await documentService.getDocument(documentId)
    if (draft.documentStatus !== 'Draft') {
      throw new Error(
        `KEEPER DRAFT DIVERGENCE: created document is not Draft — observed status=200 body=${JSON.stringify(draft).slice(0, 400)}`,
      )
    }
    await expectWireFailure(
      'keeper document.post denial',
      () => documentService.postDocument(documentId, draft.rowVersion, createIdempotentRequest()),
      404,
      'WAREHOUSE_DOCUMENTS_NOT_FOUND',
    )
  })

  it('auditor GET /admin/users -> exact 403 AUTHORIZATION_FORBIDDEN', async () => {
    await fileSession.login('auditor')
    await expectWireFailure(
      'auditor admin.directory denial',
      () => adminService.listUsers({ page: 1, pageSize: 2 }),
      403,
      'AUTHORIZATION_FORBIDDEN',
    )
  })

  it('admin GET /assets -> exact 403 AUTHORIZATION_FORBIDDEN (no asset.view)', async () => {
    await fileSession.login('admin')
    await expectWireFailure(
      'admin asset.view denial',
      () => assetService.listAssets({ page: 1, pageSize: 5 }),
      403,
      'AUTHORIZATION_FORBIDDEN',
    )
  })

  it('admin adminService.listUsers pages 1 and 2 -> 200, full meta, differing rows', async () => {
    await fileSession.login('admin')
    const page1 = await adminService.listUsers({ page: 1, pageSize: 2 })
    const page2 = await adminService.listUsers({ page: 2, pageSize: 2 })
    if (page1.meta.page !== 1 || page2.meta.page !== 2) {
      throw new Error(
        `ADMIN PAGINATION DIVERGENCE: meta.page not echoed — page1=${JSON.stringify(page1.meta).slice(0, 400)} page2=${JSON.stringify(page2.meta).slice(0, 400)}`,
      )
    }
    for (const key of [
      'pageSize',
      'itemCount',
      'totalItems',
      'totalCount',
      'totalPages',
      'hasNextPage',
      'hasPreviousPage',
    ] as const) {
      if (page1.meta[key] === undefined) {
        throw new Error(
          `ADMIN PAGINATION SHAPE DIVERGENCE: meta.${key} missing — meta=${JSON.stringify(page1.meta).slice(0, 400)}`,
        )
      }
    }
    const ids1 = new Set(page1.items.map((row) => row.id))
    const ids2 = new Set(page2.items.map((row) => row.id))
    const overlap = Array.from(ids1).filter((id) => ids2.has(id))
    if (page1.items.length > 0 && page2.items.length > 0 && overlap.length > 0) {
      throw new Error(
        `ADMIN PAGINATION DIVERGENCE: page1 and page2 share rows — overlap=${JSON.stringify(overlap).slice(0, 400)}`,
      )
    }
    expect(page1.items.length).toBeGreaterThan(0)
  })

  it('probe.keeper suspended -> the LOGIN call itself is exact 403 USERS_SUSPENDED', async () => {
    await expectWireFailure(
      'suspended login rejection',
      () => fileSession.login('probe.keeper'),
      403,
      'USERS_SUSPENDED',
    )
  })
})
