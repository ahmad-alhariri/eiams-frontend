import { beforeEach, describe, expect, it } from 'vitest'

import { getDb, resetMockDatabase } from '@/mocks/db'
import { mockApiHandlers } from '@/mocks/handlers'
import { apiClient } from '@/shared/services/api.client'
import { fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

/**
 * Verifies the dev mock API against the contract shapes it claims to serve:
 * list shapes, query filters, pagination meta, CRUD persistence, and Arabic
 * 404 problems. The shared MSW node server hosts the real handlers so this
 * suite exercises exactly what `pnpm dev` serves, through the same axios
 * transport the pages use.
 */
describe('mock API handlers', () => {
  beforeEach(() => {
    resetMockDatabase()
    server.use(...mockApiHandlers)
  })

  it('lists catalog domains as an array and filters by status', async () => {
    const { data: domains } =
      await apiClient.get<Array<{ code: string; status: string }>>('/catalog/domains')
    expect(domains).toHaveLength(3)

    const { data: inactive } = await apiClient.get<Array<{ code: string }>>(
      '/catalog/domains?status=Inactive',
    )
    expect(inactive.map((domain) => domain.code)).toEqual(['MED'])
  })

  it('paginates materials with contract meta and respects family and search filters', async () => {
    const { data: body } = await apiClient.get<{
      items: Array<{ code: string }>
      meta: { pageIndex: number; pageSize: number; totalItems: number; totalPages: number }
    }>('/catalog/materials?pageIndex=1&pageSize=2')
    expect(body.items).toHaveLength(2)
    expect(body.meta).toEqual({ pageIndex: 1, pageSize: 2, totalItems: 4, totalPages: 2 })

    const printerFamilyId = getDb().families[1]!.familyId
    const { data: familyBody } = await apiClient.get<{ items: Array<{ code: string }> }>(
      `/catalog/materials?familyId=${printerFamilyId}`,
    )
    expect(familyBody.items.map((material) => material.code)).toEqual(['IT-HW-PRT-001'])

    const { data: searchBody } = await apiClient.get<{ items: Array<{ nameAr: string }> }>(
      '/catalog/materials?search=A4',
    )
    expect(searchBody.items.map((material) => material.nameAr)).toEqual(['ورق تصوير A4'])
  })

  it('filters root categories and categories by domain', async () => {
    const { data: rootCategories } = await apiClient.get<Array<{ nameAr: string }>>(
      '/catalog/categories?parentCategoryId=root',
    )
    expect(rootCategories.map((category) => category.nameAr)).toEqual([
      'الأجهزة',
      'المواد الاستهلاكية',
      'لوازم مكتبية',
    ])

    const itDomainId = getDb().domains[0]!.domainId
    const { data: domainCategories } = await apiClient.get<Array<{ code: string }>>(
      `/catalog/categories?domainId=${itDomainId}`,
    )
    expect(domainCategories.map((category) => category.code)).toEqual(['IT-HW', 'IT-CNS'])
  })

  it('persists created records and serves them on subsequent reads', async () => {
    await apiClient.post('/catalog/domains', {
      code: 'HR',
      nameAr: 'الموارد البشرية',
      rowVersion: 0,
      status: 'Active',
    })

    const { data: domains } = await apiClient.get<Array<{ code: string }>>('/catalog/domains')
    expect(domains.map((domain) => domain.code)).toEqual(expect.arrayContaining(['HR']))
  })

  it('updates a site and bumps rowVersion; unknown ids return an Arabic 404 problem', async () => {
    const siteId = getDb().sites[0]!.siteId
    const { data: updated } = await apiClient.put<{ nameAr: string; rowVersion: number }>(
      `/sites/${siteId}`,
      {
        code: 'DAM-HQ',
        nameAr: 'المقر الرئيسي (محدث)',
        address: 'دمشق',
        governorate: 'دمشق',
        rowVersion: 1,
        status: 'Active',
      },
    )
    expect(updated.nameAr).toBe('المقر الرئيسي (محدث)')
    expect(updated.rowVersion).toBe(2)

    const missing = await apiClient
      .get('/sites/00000000-0000-4000-8000-00000000ffff')
      .catch((error: unknown) => error)
    expect(missing).toHaveProperty('response.status', 404)
    expect(missing).toHaveProperty('response.data.code', 'record.not_found')
  })

  it('deactivates an external party without deleting its record', async () => {
    const partyId = getDb().externalParties[0]!.externalPartyId
    const { data: party } = await apiClient.post<{ status: string }>(
      `/external-parties/${partyId}/deactivate`,
    )
    expect(party.status).toBe('Inactive')

    const { data: list } = await apiClient.get<{ items: Array<{ nameAr: string }> }>(
      '/external-parties?status=Inactive',
    )
    expect(list.items.map((item) => item.nameAr)).toContain('شركة التجهيزات التقنية')
  })

  it('serves employees filtered by site', async () => {
    const siteId = getDb().sites[0]!.siteId
    const { data: body } = await apiClient.get<{ items: Array<{ employeeNumber: string }> }>(
      `/employees?siteId=${siteId}`,
    )
    expect(body.items).toHaveLength(3)
    expect(body.items.map((employee) => employee.employeeNumber)).toEqual([
      'EMP-001',
      'EMP-002',
      'EMP-003',
    ])
  })

  it('lists and filters warehouse documents with contract page meta', async () => {
    const { data: all } = await apiClient.get<{
      items: Array<{ documentStatus: string }>
      meta: { pageIndex: number; pageSize: number; totalItems: number; totalPages: number }
    }>('/warehouse-documents?pageIndex=0&pageSize=5')
    expect(all.items).toHaveLength(5)
    expect(all.meta).toEqual({ pageIndex: 0, pageSize: 5, totalItems: 6, totalPages: 2 })

    const { data: drafts } = await apiClient.get<{ items: Array<{ documentStatus: string }> }>(
      '/warehouse-documents?documentStatus=Draft',
    )
    expect(drafts.items).toHaveLength(1)
    expect(drafts.items[0]!.documentStatus).toBe('Draft')

    const { data: issueDocs } = await apiClient.get<{ items: Array<{ documentType: string }> }>(
      '/warehouse-documents?documentType=Issue',
    )
    expect(issueDocs.items.map((document) => document.documentType)).toEqual(['Issue', 'Issue'])
  })

  it('serves document detail, history, and evaluated policy and 404s unknown ids', async () => {
    const draft = getDb().warehouseDocuments[0]!

    const { data: detail } = await apiClient.get(`/warehouse-documents/${draft.documentId}`)
    expect(detail).toMatchObject({
      documentId: draft.documentId,
      documentStatus: 'Draft',
      documentType: 'Receiving',
    })

    const { data: history } = await apiClient.get<{
      currentStatus: string
      currentRowVersion: number
      events: unknown[]
    }>(`/warehouse-documents/${draft.documentId}/history`)
    expect(history.currentStatus).toBe('Draft')
    expect(history.currentRowVersion).toBe(draft.rowVersion)
    expect(Array.isArray(history.events)).toBe(true)

    const { data: policy } = await apiClient.get(`/warehouse-documents/${draft.documentId}/policy`)
    expect(policy).toMatchObject({ documentId: draft.documentId, documentStatus: 'Draft' })

    const unknown = await apiClient
      .get('/warehouse-documents/00000000-0000-4000-8000-00000000ffff')
      .catch((error: unknown) => error)
    expect(unknown).toHaveProperty('response.status', 404)
    expect(unknown).toHaveProperty('response.data.code', 'record.not_found')
  })

  it('applies a submit transition and appends its event to the history', async () => {
    const draft = getDb().warehouseDocuments[0]!

    await apiClient.post(`/warehouse-documents/${draft.documentId}/submit`, {
      rowVersion: draft.rowVersion,
    })

    const { data: detail } = await apiClient.get(`/warehouse-documents/${draft.documentId}`)
    expect(detail.documentStatus).toBe('Submitted')
    expect(detail.rowVersion).toBe(draft.rowVersion + 1)

    const { data: history } = await apiClient.get<{
      currentStatus: string
      currentRowVersion: number
      events: Array<{ eventType: string }>
    }>(`/warehouse-documents/${draft.documentId}/history`)
    expect(history.currentStatus).toBe('Submitted')
    expect(history.currentRowVersion).toBe(draft.rowVersion + 1)
    expect(history.events.map((event) => event.eventType)).toContain('Submitted')
  })

  it('replays a same-key submit with the byte-identical original result (D-LIFE-01 §94-97)', async () => {
    const draft = getDb().warehouseDocuments[0]!
    const key = '00000000-0000-4000-8000-00000000a11c'

    const { data: first } = await apiClient.post(
      `/warehouse-documents/${draft.documentId}/submit`,
      { rowVersion: draft.rowVersion },
      { headers: { 'Idempotency-Key': key } },
    )

    const { data: replay } = await apiClient.post(
      `/warehouse-documents/${draft.documentId}/submit`,
      { rowVersion: draft.rowVersion },
      { headers: { 'Idempotency-Key': key } },
    )

    expect(replay).toEqual(first)
    const { data: detail } = await apiClient.get(`/warehouse-documents/${draft.documentId}`)
    expect(detail.rowVersion).toBe(draft.rowVersion + 1)
    const { data: history } = await apiClient.get<{
      events: Array<{ eventType: string }>
    }>(`/warehouse-documents/${draft.documentId}/history`)
    expect(history.events.filter((event) => event.eventType === 'Submitted')).toHaveLength(1)
  })

  it('rejects a stale rowVersion with the lifecycle conflict envelope', async () => {
    const draft = getDb().warehouseDocuments[0]!

    const conflict = await apiClient
      .post(`/warehouse-documents/${draft.documentId}/submit`, {
        rowVersion: draft.rowVersion + 9,
      })
      .catch((error: unknown) => error)
    expect(conflict).toHaveProperty('response.status', 409)
    expect(conflict).toHaveProperty('response.data.code', 'document.version_conflict')
    expect(conflict).toHaveProperty('response.data.currentRowVersion', draft.rowVersion)
    expect(conflict).toHaveProperty('response.data.currentStatus', 'Draft')
    expect(conflict).toHaveProperty('response.data.policy.documentId', draft.documentId)

    const { data: unchanged } = await apiClient.get(`/warehouse-documents/${draft.documentId}`)
    expect(unchanged.documentStatus).toBe('Draft')
  })

  it('uploads an attachment to the draft, bumps the rowVersion, and serves it on detail', async () => {
    const draft = getDb().warehouseDocuments[0]!
    const form = new FormData()
    form.append('attachmentType', 'SignedOriginal')
    form.append('rowVersion', String(draft.rowVersion))
    form.append(
      'file',
      new File(['pdf-bytes'], 'receiving-2024-101-signed.pdf', { type: 'application/pdf' }),
    )

    const { data: attachment } = await apiClient.post(
      `/warehouse-documents/${draft.documentId}/attachments`,
      form,
    )
    expect(attachment).toMatchObject({
      attachmentType: 'SignedOriginal',
      documentId: draft.documentId,
      // The vitest node transport re-serializes multipart with undici, which
      // degrades the jsdom File to a plain Blob: the name arrives as "blob"
      // and the byte payload is dropped, so the mock stores fileSize 0 (see
      // multipart-parser.ts). Browser dev-mode sees real names and bytes via
      // native formData(); these lines fail loudly if that ever changes.
      originalFilename: 'blob',
      fileSize: 0,
    })

    const { data: detail } = await apiClient.get(`/warehouse-documents/${draft.documentId}`)
    expect(detail.rowVersion).toBe(draft.rowVersion + 1)
    expect(detail.attachments).toHaveLength(1)
    expect(detail.attachments[0].attachmentId).toBe(attachment.attachmentId)
    expect(detail.policy.signedOriginalSatisfied).toBe(true)
  })

  it('rejects a stale-rowVersion attachment delete with 409 and keeps the attachment', async () => {
    const draft = getDb().warehouseDocuments[0]!
    const uploadForm = new FormData()
    uploadForm.append('attachmentType', 'Supporting')
    uploadForm.append('rowVersion', String(draft.rowVersion))
    uploadForm.append('file', new File(['x'], 'note.pdf', { type: 'application/pdf' }))
    const { data: uploaded } = await apiClient.post(
      `/warehouse-documents/${draft.documentId}/attachments`,
      uploadForm,
    )
    const currentRowVersion = draft.rowVersion + 1

    const conflict = await apiClient
      .delete(`/warehouse-documents/${draft.documentId}/attachments/${uploaded.attachmentId}`, {
        params: { rowVersion: currentRowVersion + 5 },
      })
      .catch((error: unknown) => error)
    expect(conflict).toHaveProperty('response.status', 409)
    expect(conflict).toHaveProperty('response.data.code', 'document.version_conflict')

    const { data: detail } = await apiClient.get(`/warehouse-documents/${draft.documentId}`)
    expect(detail.attachments).toHaveLength(1)
    expect(detail.attachments[0].attachmentId).toBe(uploaded.attachmentId)
  })

  it('forbids deleting an attachment from a posted document with an Arabic 403 problem', async () => {
    const posted = getDb().warehouseDocuments.find(
      (document) => document.documentId === fixtureUuid(152),
    )!
    const attachmentId = posted.attachments[0]!.attachmentId

    const forbidden = await apiClient
      .delete(`/warehouse-documents/${posted.documentId}/attachments/${attachmentId}`, {
        params: { rowVersion: posted.rowVersion },
      })
      .catch((error: unknown) => error)
    expect(forbidden).toHaveProperty('response.status', 403)
    expect(forbidden).toHaveProperty('response.data.code', 'document.attachment_delete_not_allowed')
    expect(forbidden).toHaveProperty('response.data.titleAr', expect.stringContaining('الصلاحية'))

    const { data: detail } = await apiClient.get(`/warehouse-documents/${posted.documentId}`)
    expect(detail.attachments).toHaveLength(2)
  })

  it('deletes a draft attachment with the correct rowVersion and serves the removal on detail', async () => {
    const draft = getDb().warehouseDocuments[0]!
    const uploadForm = new FormData()
    uploadForm.append('attachmentType', 'Supporting')
    uploadForm.append('rowVersion', String(draft.rowVersion))
    uploadForm.append('file', new File(['x'], 'note.pdf', { type: 'application/pdf' }))
    const { data: uploaded } = await apiClient.post(
      `/warehouse-documents/${draft.documentId}/attachments`,
      uploadForm,
    )
    const nextRowVersion = draft.rowVersion + 1

    const response = await apiClient.delete(
      `/warehouse-documents/${draft.documentId}/attachments/${uploaded.attachmentId}`,
      { params: { rowVersion: nextRowVersion } },
    )
    expect(response.status).toBe(204)

    const { data: detail } = await apiClient.get(`/warehouse-documents/${draft.documentId}`)
    expect(detail.attachments).toHaveLength(0)
    expect(detail.rowVersion).toBe(nextRowVersion + 1)
    expect(detail.policy.signedOriginalSatisfied).toBe(false)
  })
})
