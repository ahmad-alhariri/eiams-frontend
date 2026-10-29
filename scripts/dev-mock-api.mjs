/**
 * DEV-ONLY mock API server — self-contained, Node built-ins only.
 *
 * Usage:
 *   node scripts/dev-mock-api.mjs
 *
 * Starts on 127.0.0.1:8787. Serves seed data for browser-level QA
 * (Chrome DevTools MCP / MSW contract checks). Never touches a DB.
 *
 * Pagination contract (matches wire envelope from src/test/msw/envelope.ts):
 *   - Primary: `page` (one-based, 1..N) + `pageSize` (1..100, default 10)
 *   - Legacy: `pageIndex` (zero-based) also accepted; if given with `page`,
 *     `page` wins. Documented here because the app sends 1-based `page` but
 *     older callers / the bead contract may send `pageIndex`.
 *
 * Envelope shape (exact):
 *   success: true, data: <payload>, pagination: {page,page_size,total_items,
 *   total_pages,has_previous_page,has_next_page,total_count}, meta: {request_id,timestamp}
 * Error: success: false, error: {code,message,details,request_id}
 *
 * Endpoints implemented (full table at bottom of file):
 *   /api/v1/organization/sites, /org-units, /employees, /external-parties
 *   /api/v1/catalog/domains, /categories, /families, /materials,
 *   /units-of-measure, /materials/{id}/unit-conversions
 *
 * Filters supported: search (substring on nameAr/name/ar), status (0/1/2 or "active"/"inactive"),
 * domainId / familyId (catalog hierarchy). POST/PUT/DELETE/deactivate endpoints
 * return 201/200/422 per contract.
 */

import http from 'node:http'
import { URL } from 'node:url'

const HOST = '127.0.0.1'
const PORT = 8787
const BASE = '/api/v1'

// --- Seed data (Arabic labels, small but complete) ---
const sites = [
  {
    id: 'site-1',
    organizationId: 'org-1',
    name: 'المقر الرئيسي',
    code: 'HQ',
    location: 'دمشق',
    governorateCode: 'دمشق',
    status: 'Active',
  },
  {
    id: 'site-2',
    organizationId: 'org-1',
    name: 'فرع دمشق',
    code: 'DAM',
    location: 'دمشق',
    governorateCode: 'دمشق',
    status: 'Active',
  },
  {
    id: 'site-3',
    organizationId: 'org-1',
    name: 'مستودع حلب',
    code: 'ALE',
    location: 'حلب',
    governorateCode: 'حلب',
    status: 'Inactive',
  },
]

const orgUnits = [
  {
    id: 'ou-1',
    siteId: 'site-1',
    parentId: null,
    name: 'الإدارة العامة',
    unitType: 'إدارة',
    status: 'Active',
  },
  {
    id: 'ou-2',
    siteId: 'site-1',
    parentId: 'ou-1',
    name: 'قسم المخزون',
    unitType: 'قسم',
    status: 'Active',
  },
  {
    id: 'ou-3',
    siteId: 'site-2',
    parentId: null,
    name: 'التوريد والتوزيع',
    unitType: 'قسم',
    status: 'Active',
  },
  {
    id: 'ou-4',
    siteId: 'site-3',
    parentId: null,
    name: 'الصيانة',
    unitType: 'قسم',
    status: 'Inactive',
  },
]

const employees = [
  {
    id: 'emp-1',
    orgUnitId: 'ou-1',
    fullName: 'أحمد الخالد',
    employeeNumber: 'EMP-001',
    jobTitle: 'مدير',
    status: 'Active',
  },
  {
    id: 'emp-2',
    orgUnitId: 'ou-2',
    fullName: 'سارة الرفاعي',
    employeeNumber: 'EMP-002',
    jobTitle: 'مهندس',
    status: 'Active',
  },
  {
    id: 'emp-3',
    orgUnitId: 'ou-3',
    fullName: 'محمد النassar',
    employeeNumber: 'EMP-003',
    jobTitle: 'مشرف',
    status: 'Active',
  },
  {
    id: 'emp-4',
    orgUnitId: 'ou-3',
    fullName: 'ليلى عباس',
    employeeNumber: 'EMP-004',
    jobTitle: 'محاسب',
    status: 'Inactive',
  },
  {
    id: 'emp-5',
    orgUnitId: 'ou-2',
    fullName: 'عمر سعيد',
    employeeNumber: 'EMP-005',
    jobTitle: 'فني',
    status: 'Active',
  },
  {
    id: 'emp-6',
    orgUnitId: 'ou-4',
    fullName: 'نورة حسن',
    employeeNumber: 'EMP-006',
    jobTitle: 'مهندس صيانة',
    status: 'Active',
  },
]

const externalParties = [
  {
    id: 'ep-1',
    nameAr: 'شركة الموردين العامة',
    code: 'GSC',
    contactInfo: 'info@gsc.local',
    notes: 'مورد رئيسي',
    status: 'Active',
    rowVersion: 1,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ep-2',
    nameAr: 'مركز التوزيع المركزي',
    code: 'CDC',
    contactInfo: 'info@cdc.local',
    notes: null,
    status: 'Active',
    rowVersion: 1,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ep-3',
    nameAr: 'مقاول الصيانة',
    code: 'MC',
    contactInfo: 'mc@local',
    notes: null,
    status: 'Active',
    rowVersion: 1,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  },
  {
    id: 'ep-4',
    nameAr: 'مورد قطع الغيار',
    code: 'SPS',
    contactInfo: 'sps@local',
    notes: null,
    status: 'Inactive',
    rowVersion: 1,
    createdAtUtc: '2026-01-01T00:00:00Z',
    updatedAtUtc: '2026-01-01T00:00:00Z',
  },
]

const organizations = [
  { id: 'org-1', name: 'المقر العام', code: 'HQ', status: 'Active' },
  { id: 'org-2', name: 'فرع حلب', code: 'ALE', status: 'Active' },
  { id: 'org-3', name: 'الفرع الشرقي', code: 'EAS', status: 'Inactive' },
]

const domains = [
  { id: 'dom-1', name: 'مواد بناء', code: 'BLD', status: 'Active' },
  { id: 'dom-2', name: 'معدات كهربائية', code: 'ELE', status: 'Active' },
  { id: 'dom-3', name: 'مستلزمات مكتبية', code: 'OFF', status: 'Inactive' },
]

const categories = [
  {
    id: 'cat-1',
    materialDomainId: 'dom-1',
    parentCategoryId: null,
    name: 'أسمنت',
    code: 'CMT',
    status: 'Active',
  },
  {
    id: 'cat-2',
    materialDomainId: 'dom-1',
    parentCategoryId: 'cat-1',
    name: 'أسمنت أبيض',
    code: 'WHT',
    status: 'Active',
  },
  {
    id: 'cat-3',
    materialDomainId: 'dom-2',
    parentCategoryId: null,
    name: 'أسلاك',
    code: 'WIR',
    status: 'Active',
  },
  {
    id: 'cat-4',
    materialDomainId: 'dom-2',
    parentCategoryId: null,
    name: 'لوحات التحكم',
    code: 'CP',
    status: 'Active',
  },
  {
    id: 'cat-5',
    materialDomainId: 'dom-3',
    parentCategoryId: null,
    name: 'أوراق',
    code: 'PAP',
    status: 'Active',
  },
  {
    id: 'cat-6',
    materialDomainId: 'dom-3',
    parentCategoryId: null,
    name: 'أقلام',
    code: 'PEN',
    status: 'Inactive',
  },
]

const families = [
  {
    id: 'fam-1',
    categoryId: 'cat-1',
    name: 'أسمنت بورتلاند',
    code: 'PC',
    status: 'Active',
  },
  {
    id: 'fam-2',
    categoryId: 'cat-3',
    name: 'أسلاك النحاس',
    code: 'CW',
    status: 'Active',
  },
  {
    id: 'fam-3',
    categoryId: 'cat-4',
    name: 'لوحات ذكية',
    code: 'SP',
    status: 'Active',
  },
  {
    id: 'fam-4',
    categoryId: 'cat-5',
    name: 'أوراق A4',
    code: 'A4',
    status: 'Active',
  },
  {
    id: 'fam-5',
    categoryId: 'cat-1',
    name: 'أسمنت سريع',
    code: 'RC',
    status: 'Inactive',
  },
  {
    id: 'fam-6',
    categoryId: 'cat-2',
    name: 'أسمنت زخرفي',
    code: 'DEC',
    status: 'Active',
  },
]

const materials = [
  {
    id: 'mat-1',
    familyId: 'fam-1',
    nameAr: 'أسمنت بورتلاند 50 كغ',
    nameEn: 'Portland Cement 50kg',
    code: 'PC50',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-1',
    materialDomainName: 'مواد بناء',
    baseUnitId: 'uom-1',
    baseUnitSymbol: 'kg',
  },
  {
    id: 'mat-2',
    familyId: 'fam-2',
    nameAr: 'سلك نحاس 2.5 مم',
    nameEn: 'Copper Wire 2.5mm',
    code: 'CW25',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-2',
    materialDomainName: 'معدات كهربائية',
    baseUnitId: 'uom-2',
    baseUnitSymbol: 'm',
  },
  {
    id: 'mat-3',
    familyId: 'fam-3',
    nameAr: 'لوحة تحكم ذكية 3-phase',
    nameEn: 'Smart 3-Phase Control Panel',
    code: 'SP3',
    materialKind: 'Asset',
    trackingType: 'Serial',
    hasExpiry: false,
    requiresAssetNumber: true,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-2',
    materialDomainName: 'معدات كهربائية',
    baseUnitId: 'uom-3',
    baseUnitSymbol: 'u',
  },
  {
    id: 'mat-4',
    familyId: 'fam-4',
    nameAr: 'ورق A4 500 صفحة',
    nameEn: 'A4 Paper 500 Sheets',
    code: 'A4-500',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-3',
    materialDomainName: 'مستلزمات مكتبية',
    baseUnitId: 'uom-4',
    baseUnitSymbol: 'bx',
  },
  {
    id: 'mat-5',
    familyId: 'fam-5',
    nameAr: 'أسمنت سريع 25 كغ',
    nameEn: 'Rapid Cement 25kg',
    code: 'RC25',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Inactive',
    materialDomainId: 'dom-1',
    materialDomainName: 'مواد بناء',
    baseUnitId: 'uom-1',
    baseUnitSymbol: 'kg',
  },
  {
    id: 'mat-6',
    familyId: 'fam-6',
    nameAr: 'أسمنت زخرفي أبيض',
    nameEn: 'White Decorative Cement',
    code: 'WDC',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-1',
    materialDomainName: 'مواد بناء',
    baseUnitId: 'uom-1',
    baseUnitSymbol: 'kg',
  },
  {
    id: 'mat-7',
    familyId: 'fam-1',
    nameAr: 'أسمنت بورتلاند 100 كغ',
    nameEn: 'Portland Cement 100kg',
    code: 'PC100',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-1',
    materialDomainName: 'مواد بناء',
    baseUnitId: 'uom-1',
    baseUnitSymbol: 'kg',
  },
  {
    id: 'mat-8',
    familyId: 'fam-2',
    nameAr: 'سلك نحاس 4 مم',
    nameEn: 'Copper Wire 4mm',
    code: 'CW40',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-2',
    materialDomainName: 'معدات كهربائية',
    baseUnitId: 'uom-2',
    baseUnitSymbol: 'm',
  },
  {
    id: 'mat-9',
    familyId: 'fam-4',
    nameAr: 'ورق A3 250 صفحة',
    nameEn: 'A3 Paper 250 Sheets',
    code: 'A3-250',
    materialKind: 'Consumable',
    trackingType: 'Quantity',
    hasExpiry: false,
    requiresAssetNumber: false,
    catalogVersion: 1,
    attributes: null,
    status: 'Active',
    materialDomainId: 'dom-3',
    materialDomainName: 'مستلزمات مكتبية',
    baseUnitId: 'uom-4',
    baseUnitSymbol: 'bx',
  },
  {
    id: 'mat-10',
    familyId: 'fam-3',
    nameAr: 'لوحة تحكم أحادية الطور',
    nameEn: 'Single Phase Control Panel',
    code: 'SP1',
    materialKind: 'Asset',
    trackingType: 'Serial',
    hasExpiry: false,
    requiresAssetNumber: true,
    catalogVersion: 1,
    attributes: null,
    status: 'Inactive',
    materialDomainId: 'dom-2',
    materialDomainName: 'معدات كهربائية',
    baseUnitId: 'uom-3',
    baseUnitSymbol: 'u',
  },
]

const uoms = [
  { id: 'uom-1', name: 'كيلوغرام', symbol: 'kg', unitType: 'Quantity', status: 'Active' },
  { id: 'uom-2', name: 'متر', symbol: 'm', unitType: 'Quantity', status: 'Active' },
  { id: 'uom-3', name: 'وحدة', symbol: 'u', unitType: 'Quantity', status: 'Active' },
  { id: 'uom-4', name: 'علبة', symbol: 'bx', unitType: 'Quantity', status: 'Inactive' },
  { id: 'uom-5', name: 'طن', symbol: 't', unitType: 'Quantity', status: 'Active' },
]

const conversions = [
  {
    id: 'conv-1',
    materialId: 'mat-1',
    fromUnitId: 'uom-1',
    toUnitId: 'uom-5',
    factor: 0.001,
    status: 'Active',
  },
  {
    id: 'conv-2',
    materialId: 'mat-7',
    fromUnitId: 'uom-1',
    toUnitId: 'uom-5',
    factor: 0.001,
    status: 'Active',
  },
  {
    id: 'conv-3',
    materialId: 'mat-2',
    fromUnitId: 'uom-2',
    toUnitId: 'uom-2',
    factor: 1.0,
    status: 'Active',
  },
  {
    id: 'conv-4',
    materialId: 'mat-4',
    fromUnitId: 'uom-4',
    toUnitId: 'uom-4',
    factor: 1.0,
    status: 'Inactive',
  },
]

// --- Envelope helpers (mirror src/test/msw/envelope.ts) ---
function ordinalToStatus(o) {
  if (o === 0 || o === 'Active') return 'Active'
  if (o === 1 || o === 'Inactive') return 'Inactive'
  if (o === 2 || o === 'Archived') return 'Archived'
  return String(o === 0 ? 'Active' : o === 1 ? 'Inactive' : o === 2 ? 'Archived' : o)
}
function meta() {
  return {
    request_id: 'mock-req-' + Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toISOString(),
  }
}
function ok(data, pagination) {
  return {
    success: true,
    data: data === undefined ? null : data,
    pagination: pagination || null,
    meta: meta(),
  }
}
function paginated(items, page = 1, pageSize = 10) {
  const p = Math.max(1, page)
  const ps = Math.min(100, Math.max(1, pageSize || 10))
  const total = items.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / ps)
  const start = (p - 1) * ps
  const slice = items.slice(start, start + ps)
  return {
    items: slice,
    pagination: {
      page: p,
      page_size: ps,
      total_items: total,
      total_pages: totalPages,
      has_previous_page: p > 1,
      has_next_page: p < totalPages,
      total_count: total,
    },
  }
}
function err(code, message, details = null) {
  return { success: false, error: { code, message, details, request_id: meta().request_id } }
}

// --- Filter / search ---
function matchesSearch(item, q) {
  if (!q) return true
  const s = (q || '').toString().toLowerCase()
  const hay = (
    (item.nameAr || '') +
    ' ' +
    (item.name || '') +
    ' ' +
    (item.code || '')
  ).toLowerCase()
  return hay.includes(s)
}
function filterStatus(items, status) {
  if (status === undefined || status === null || status === '') return items
  const v = String(status).toLowerCase()
  return items.filter((i) => {
    const s = String(i.status || '').toLowerCase()
    if (v === 'active' || v === '1') return s === 'active'
    if (v === 'inactive' || v === '0') return s === 'inactive'
    if (v === 'archived' || v === '2') return s === 'archived'
    return s === v
  })
}

// --- Router ---
function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  const path = url.pathname
    .replace(new RegExp('^' + BASE + '/organization/'), BASE + '/')
    .replace(new RegExp('^' + BASE + '/organizational-units/'), BASE + '/org-units/')
    .replace(/\/catalog\/units(?=\/|\?|$)/, '/catalog/units-of-measure')
  const method = req.method

  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  // Helper: parse query params
  const q = Object.fromEntries(url.searchParams.entries())
  const search = q.search || q.q || ''
  const status = q.status !== undefined ? q.status : q.statusFilter
  const domainId = q.domainId || q.materialDomainId || q.categoryId || null
  const familyId = q.familyId || q.materialFamilyId || null
  // Pagination: accept both page (1-based) and pageIndex (0-based); page wins
  let page = 1
  if (q.page !== undefined && q.page !== '') page = Math.max(1, parseInt(q.page, 10) || 1)
  else if (q.pageIndex !== undefined && q.pageIndex !== '')
    page = Math.max(1, (parseInt(q.pageIndex, 10) || 0) + 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || q.limit || 10, 10) || 10))

  // 1. Organization: sites
  if (path === `${BASE}/sites` && method === 'GET') {
    let arr = sites.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 1b. Organization: organizations
  if (path === `${BASE}/organizations` && method === 'GET') {
    let arr = organizations.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 1c. Organization: organization detail
  const orgDetail = path.match(new RegExp(`^${BASE}/organizations/([^/]+)$`))
  if (orgDetail && method === 'GET') {
    const id = orgDetail[1]
    const o = organizations.find((x) => x.id === id)
    if (!o) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Organization not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(o)))
    return
  }

  // 2. Organization: org-units (also /organizational-units alias for service parity)
  if (
    (path === `${BASE}/org-units` || path === `${BASE}/organizational-units`) &&
    method === 'GET'
  ) {
    let arr = orgUnits.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    if (q.siteId) arr = arr.filter((i) => i.siteId === q.siteId)
    if (q.parentId !== undefined && q.parentId !== '')
      arr = arr.filter(
        (i) => i.parentId === q.parentId || (q.parentId === 'null' && i.parentId === null),
      )
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 3. Organization: employees
  if (path === `${BASE}/employees` && method === 'GET') {
    let arr = employees.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    if (q.siteId) arr = arr.filter((i) => i.siteId === q.siteId)
    if (q.orgUnitId) arr = arr.filter((i) => i.orgUnitId === q.orgUnitId)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 4. Organization: external-parties (GET)
  if (path === `${BASE}/external-parties` && method === 'GET') {
    let arr = externalParties.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    if (q.siteId) arr = arr.filter((i) => i.siteId === q.siteId)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 5. External-parties deactivate (PUT /external-parties/{id}/deactivate) and status (PUT /external-parties/{id}/status)
  if (path.startsWith(`${BASE}/external-parties/`) && (method === 'PUT' || method === 'PATCH')) {
    const rest = path.slice(`${BASE}/external-parties/`.length)
    const id = rest.split('/')[0]
    const item = externalParties.find((e) => e.id === id)
    if (!item) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    // Deactivate command
    if (rest.includes('/deactivate')) {
      item.status = 'Inactive'
      res.statusCode = 200
      res.end(JSON.stringify(ok({ ...item, status: 'Inactive' })))
      return
    }
    // Status update
    if (rest.includes('/status')) {
      try {
        const b = JSON.parse(req.body || '{}')
        if (b.status !== undefined) item.status = ordinalToStatus(b.status)
      } catch {
        /* ignore */
      }
      res.statusCode = 200
      res.end(JSON.stringify(ok(item)))
      return
    }
  }

  // 6. External-parties DELETE
  if (path.startsWith(`${BASE}/external-parties/`) && method === 'DELETE') {
    const id = path.slice(`${BASE}/external-parties/`.length).split('/')[0]
    const idx = externalParties.findIndex((e) => e.id === id)
    if (idx >= 0) externalParties.splice(idx, 1)
    res.statusCode = 200
    res.end(JSON.stringify(ok({ deleted: true, id })))
    return
  }

  // 6b. Org-unit detail
  if (path.match(new RegExp(`^\\${BASE}/org-units/[^/]+$`)) && method === 'GET') {
    const id = path.split('/').pop()
    const item = orgUnits.find((o) => o.id === id)
    if (!item) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(item)))
    return
  }
  // 6c. Org-unit tree
  if (path.match(new RegExp(`^\\${BASE}/org-units/[^/]+/tree$`)) && method === 'GET') {
    const id = path.split('/')[4]
    const root = orgUnits.find((o) => o.id === id)
    if (!root) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    const build = (node) => ({
      ...node,
      children: orgUnits.filter((c) => c.parentId === node.id).map(build),
    })
    res.statusCode = 200
    res.end(JSON.stringify(ok(build(root))))
    return
  }
  // 6d. Employee detail
  if (path.match(new RegExp(`^\\${BASE}/employees/[^/]+$`)) && method === 'GET') {
    const id = path.split('/').pop()
    const item = employees.find((e) => e.id === id)
    if (!item) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(item)))
    return
  }
  // 6e. External-party detail
  if (path.match(new RegExp(`^\\${BASE}/external-parties/[^/]+$`)) && method === 'GET') {
    const id = path.split('/').pop()
    const item = externalParties.find((e) => e.id === id)
    if (!item) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(item)))
    return
  }
  // 6f. External-party create/update (POST/PUT)
  if (path === `${BASE}/external-parties` && method === 'POST') {
    const body = JSON.parse(req.body || '{}')
    const item = {
      ...body,
      id: 'ep-' + (externalParties.length + 1),
      status: body.status || 'Active',
      rowVersion: 1,
      createdAtUtc: '2026-01-01T00:00:00Z',
      updatedAtUtc: '2026-01-01T00:00:00Z',
    }
    externalParties.push(item)
    res.statusCode = 201
    res.end(JSON.stringify(ok({ id: item.id })))
    return
  }
  if (path.match(new RegExp(`^\\${BASE}/external-parties/[^/]+$`)) && method === 'PUT') {
    const id = path.split('/').pop()
    const idx = externalParties.findIndex((e) => e.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    const body = JSON.parse(req.body || '{}')
    externalParties[idx] = {
      ...externalParties[idx],
      ...body,
      id,
      updatedAtUtc: new Date().toISOString(),
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok({ id })))
    return
  }

  // 7. Catalog: domains (the frontend calls /catalog/domains; material-domains kept as an alias)
  if (
    (path === `${BASE}/catalog/domains` || path === `${BASE}/catalog/material-domains`) &&
    method === 'GET'
  ) {
    let arr = domains.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 8. Catalog: categories
  if (path === `${BASE}/catalog/categories` && method === 'GET') {
    let arr = categories.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    if (domainId) arr = arr.filter((i) => i.materialDomainId === domainId)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 9. Catalog: families
  if (path === `${BASE}/catalog/families` && method === 'GET') {
    let arr = families.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    if (domainId)
      arr = arr.filter(
        (i) => categories.find((c) => c.id === i.categoryId)?.materialDomainId === domainId,
      )
    if (familyId) arr = arr.filter((i) => i.id === familyId)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 9b. Catalog: category detail (GET /catalog/categories/{id})
  const catDetail = path.match(new RegExp(`^${BASE}/catalog/categories/([^/]+)$`))
  if (catDetail && method === 'GET') {
    const id = catDetail[1]
    const c = categories.find((x) => x.id === id)
    if (!c) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Category not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(c)))
    return
  }

  // 9c. Catalog: family detail (GET /catalog/families/{id})
  const famDetail = path.match(new RegExp(`^${BASE}/catalog/families/([^/]+)$`))
  if (famDetail && method === 'GET') {
    const id = famDetail[1]
    const f = families.find((x) => x.id === id)
    if (!f) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Family not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(f)))
    return
  }

  // 10. Catalog: materials
  if (path === `${BASE}/catalog/materials` && method === 'GET') {
    let arr = materials.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    if (familyId) arr = arr.filter((i) => i.materialFamilyId === familyId)
    if (domainId)
      arr = arr.filter(
        (i) =>
          families.find((f) => f.id === i.materialFamilyId)?.materialCategoryId === domainId ||
          families.find((f) => f.id === i.materialFamilyId)?.materialCategoryId,
      )
    // domain filter via family->category->domain
    if (domainId && !familyId) {
      const domainCatIds = new Set(
        categories.filter((c) => c.materialDomainId === domainId).map((c) => c.id),
      )
      arr = arr.filter((i) =>
        domainCatIds.has(families.find((f) => f.id === i.materialFamilyId)?.materialCategoryId),
      )
    }
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 11. Catalog: units-of-measure
  if (path === `${BASE}/catalog/units-of-measure` && method === 'GET') {
    let arr = uoms.slice()
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 12. Catalog: unit-conversions for material
  if (path.match(new RegExp(`^${BASE}/catalog/materials/[^/]+/unit-conversions$`))) {
    const matId = path.split('/')[4]
    let arr = conversions.filter((c) => c.materialId === matId)
    arr = arr.filter((i) => matchesSearch(i, search))
    arr = filterStatus(arr, status)
    const { items, pagination } = paginated(arr, page, pageSize)
    res.statusCode = 200
    res.end(JSON.stringify(ok(items, pagination)))
    return
  }

  // 13. Material create (POST /catalog/materials) — used by dialogs
  if (path === `${BASE}/catalog/materials` && method === 'POST') {
    let body = {}
    try {
      body = JSON.parse(req.body || '{}')
    } catch {}
    if (
      !body.nameAr ||
      !body.familyId ||
      !body.baseUnitId ||
      !body.materialKind ||
      !body.trackingType ||
      body.hasExpiry === undefined
    ) {
      res.statusCode = 422
      res.end(
        JSON.stringify(
          err(
            'VALIDATION_ERROR',
            'nameAr, familyId, baseUnitId, materialKind, trackingType, hasExpiry required',
            body,
          ),
        ),
      )
      return
    }
    const newM = {
      id: 'mat-new-' + Date.now(),
      ...body,
      status: body.status !== undefined ? body.status : 'Active',
      catalogVersion: 1,
      requiresAssetNumber: false,
      materialDomainId: 'dom-1',
      materialDomainName: 'مواد بناء',
      baseUnitSymbol: 'kg',
    }
    materials.push(newM)
    res.statusCode = 201
    res.end(JSON.stringify(ok(newM)))
    return
  }

  // 14a. Material detail (GET /catalog/materials/{id}) - the catalog detail page reads it
  const matDetail = path.match(new RegExp(`^${BASE}/catalog/materials/([^/]+)$`))
  if (matDetail && method === 'GET') {
    const id = matDetail[1]
    const m = materials.find((x) => x.id === id)
    if (!m) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Material not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(m)))
    return
  }

  // 14b. Unit of measure detail (GET /catalog/units-of-measure/{id})
  const uomDetail = path.match(new RegExp(`^${BASE}/catalog/units-of-measure/([^/]+)$`))
  if (uomDetail && method === 'GET') {
    const id = uomDetail[1]
    const u = uoms.find((x) => x.id === id)
    if (!u) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Unit of measure not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(u)))
    return
  }
  // 14. Material update (PUT /catalog/materials/{id})
  const matEdit = path.match(new RegExp(`^${BASE}/catalog/materials/([^/]+)$`))
  if (matEdit && method === 'PUT') {
    const id = matEdit[1]
    const idx = materials.findIndex((m) => m.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Material not found', { id })))
      return
    }
    let body = {}
    try {
      body = JSON.parse(req.body || '{}')
    } catch {}
    materials[idx] = { ...materials[idx], ...body }
    res.statusCode = 200
    res.end(JSON.stringify(ok(materials[idx])))
    return
  }

  // 15. Material status (PUT /catalog/materials/{id}/status)
  const matStatus = path.match(new RegExp(`^${BASE}/catalog/materials/([^/]+)/status$`))
  if (matStatus && (method === 'PUT' || method === 'PATCH')) {
    const id = matStatus[1]
    const idx = materials.findIndex((m) => m.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Material not found', { id })))
      return
    }
    let body = {}
    try {
      body = JSON.parse(req.body || '{}')
    } catch {}
    if (body.status !== undefined) materials[idx].status = ordinalToStatus(body.status)
    res.statusCode = 200
    res.end(JSON.stringify(ok(materials[idx])))
    return
  }

  // 16. Unit-conversion create (POST /catalog/materials/{id}/unit-conversions)
  const convCreate = path.match(new RegExp(`^${BASE}/catalog/materials/([^/]+)/unit-conversions$`))
  if (convCreate && method === 'POST') {
    const matId = convCreate[1]
    let body = {}
    try {
      body = JSON.parse(req.body || '{}')
    } catch {}
    if (!body.fromUnitId || !body.toUnitId) {
      res.statusCode = 422
      res.end(JSON.stringify(err('VALIDATION_ERROR', 'fromUnitId and toUnitId required', body)))
      return
    }
    const newC = {
      id: 'conv-new-' + Date.now(),
      materialId: matId,
      ...body,
      status: body.status !== undefined ? body.status : 1,
    }
    conversions.push(newC)
    res.statusCode = 201
    res.end(JSON.stringify(ok(newC)))
    return
  }

  // 17. Unit-conversion edit (PUT /catalog/materials/{matId}/unit-conversions/{convId})
  const convEdit = path.match(
    new RegExp(`^${BASE}/catalog/materials/([^/]+)/unit-conversions/([^/]+)$`),
  )
  if (convEdit && method === 'PUT') {
    const matId = convEdit[1],
      convId = convEdit[2]
    const idx = conversions.findIndex((c) => c.id === convId && c.materialId === matId)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Conversion not found', { convId, matId })))
      return
    }
    let body = {}
    try {
      body = JSON.parse(req.body || '{}')
    } catch {}
    conversions[idx] = { ...conversions[idx], ...body }
    res.statusCode = 200
    res.end(JSON.stringify(ok(conversions[idx])))
    return
  }

  // 18. Domain / category / family / UOM create endpoints (dialog support)
  if (path === `${BASE}/catalog/domains` && method === 'POST') {
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (!b.name || !b.code) {
      res.statusCode = 422
      res.end(JSON.stringify(err('VALIDATION_ERROR', 'name and code required', b)))
      return
    }
    const d = {
      id: 'dom-new-' + Date.now(),
      ...b,
      status: b.status !== undefined ? b.status : 'Active',
    }
    domains.push(d)
    res.statusCode = 201
    res.end(JSON.stringify(ok(d)))
    return
  }
  if (path === `${BASE}/catalog/categories` && method === 'POST') {
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (!b.name || !b.materialDomainId) {
      res.statusCode = 422
      res.end(JSON.stringify(err('VALIDATION_ERROR', 'name and materialDomainId required', b)))
      return
    }
    const c = {
      id: 'cat-new-' + Date.now(),
      ...b,
      status: b.status !== undefined ? b.status : 'Active',
    }
    categories.push(c)
    res.statusCode = 201
    res.end(JSON.stringify(ok(c)))
    return
  }
  if (path === `${BASE}/catalog/families` && method === 'POST') {
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (!b.name || !b.categoryId) {
      res.statusCode = 422
      res.end(JSON.stringify(err('VALIDATION_ERROR', 'name and categoryId required', b)))
      return
    }
    const f = {
      id: 'fam-new-' + Date.now(),
      ...b,
      status: b.status !== undefined ? b.status : 'Active',
    }
    families.push(f)
    res.statusCode = 201
    res.end(JSON.stringify(ok(f)))
    return
  }
  if (path === `${BASE}/catalog/units-of-measure` && method === 'POST') {
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (!b.name || !b.symbol || !b.unitType) {
      res.statusCode = 422
      res.end(JSON.stringify(err('VALIDATION_ERROR', 'name, symbol and unitType required', b)))
      return
    }
    const u = {
      id: 'uom-new-' + Date.now(),
      ...b,
      status: b.status !== undefined ? b.status : 'Active',
    }
    uoms.push(u)
    res.statusCode = 201
    res.end(JSON.stringify(ok(u)))
    return
  }

  // 19. Site / org-unit / employee / external-party updates (PUT by id)
  const siteEdit = path.match(new RegExp(`^${BASE}/sites/([^/]+)$`))
  if (siteEdit && method === 'PUT') {
    const id = siteEdit[1]
    const idx = sites.findIndex((s) => s.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    sites[idx] = { ...sites[idx], ...b }
    res.statusCode = 200
    res.end(JSON.stringify(ok(sites[idx])))
    return
  }
  const ouEdit = path.match(new RegExp(`^${BASE}/org-units/([^/]+)$`))
  if (ouEdit && method === 'PUT') {
    const id = ouEdit[1]
    const idx = orgUnits.findIndex((o) => o.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    orgUnits[idx] = { ...orgUnits[idx], ...b }
    res.statusCode = 200
    res.end(JSON.stringify(ok(orgUnits[idx])))
    return
  }
  const empEdit = path.match(new RegExp(`^${BASE}/employees/([^/]+)$`))
  if (empEdit && method === 'PUT') {
    const id = empEdit[1]
    const idx = employees.findIndex((e) => e.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    employees[idx] = { ...employees[idx], ...b }
    res.statusCode = 200
    res.end(JSON.stringify(ok(employees[idx])))
    return
  }

  // 20. Site status (PUT /sites/{id}/status), org-unit status, employee status
  const siteStat = path.match(new RegExp(`^${BASE}/sites/([^/]+)/status$`))
  if (siteStat && method === 'PUT') {
    const id = siteStat[1]
    const idx = sites.findIndex((s) => s.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (b.status !== undefined) sites[idx].status = ordinalToStatus(b.status)
    res.statusCode = 200
    res.end(JSON.stringify(ok(sites[idx])))
    return
  }
  const ouStat = path.match(new RegExp(`^${BASE}/org-units/([^/]+)/status$`))
  if (ouStat && method === 'PUT') {
    const id = ouStat[1]
    const idx = orgUnits.findIndex((o) => o.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (b.status !== undefined) orgUnits[idx].status = ordinalToStatus(b.status)
    res.statusCode = 200
    res.end(JSON.stringify(ok(orgUnits[idx])))
    return
  }
  const empStat = path.match(new RegExp(`^${BASE}/employees/([^/]+)/status$`))
  if (empStat && method === 'PUT') {
    const id = empStat[1]
    const idx = employees.findIndex((e) => e.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (b.status !== undefined) employees[idx].status = ordinalToStatus(b.status)
    res.statusCode = 200
    res.end(JSON.stringify(ok(employees[idx])))
    return
  }
  const orgStat = path.match(new RegExp(`^${BASE}/organizations/([^/]+)/status$`))
  if (orgStat && method === 'PUT') {
    const id = orgStat[1]
    const idx = organizations.findIndex((o) => o.id === id)
    if (idx < 0) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    let b = {}
    try {
      b = JSON.parse(req.body || '{}')
    } catch {}
    if (b.status !== undefined) organizations[idx].status = ordinalToStatus(b.status)
    res.statusCode = 200
    res.end(JSON.stringify(ok(organizations[idx])))
    return
  }
  // 21. Individual gets
  if (path === `${BASE}/sites` && method === 'GET') return // already handled
  const siteGet = path.match(new RegExp(`^${BASE}/sites/([^/]+)$`))
  if (siteGet && method === 'GET') {
    const id = siteGet[1]
    const item = sites.find((s) => s.id === id)
    if (!item) {
      res.statusCode = 404
      res.end(JSON.stringify(err('NOT_FOUND', 'Not found', { id })))
      return
    }
    res.statusCode = 200
    res.end(JSON.stringify(ok(item)))
    return
  }

  // Fallback
  res.statusCode = 404
  res.end(JSON.stringify(err('NOT_FOUND', 'Endpoint not implemented', { path, method })))
}

// Read body for POST/PUT/PATCH
function readBody(req, cb) {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    req.body = body
    cb()
  })
}

const server = http.createServer((req, res) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['content-length']) {
    readBody(req, () => handle(req, res))
  } else {
    handle(req, res)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Mock API running at http://${HOST}:${PORT}`)
  console.log(`Base: ${BASE}`)
  console.log(
    'Endpoints: organization/sites, org-units, employees, external-parties; catalog/domains, categories, families, materials, units-of-measure, materials/{id}/unit-conversions',
  )
  console.log(
    'Pagination: page (1-based, default 1) AND pageIndex (0-based, legacy) accepted; pageSize clamped 1..100',
  )
  console.log('Stop with Ctrl+C')
})
