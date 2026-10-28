/**
 * Contract smoke — coverage item 9: one paginated read per API family, two
 * pages, through the frontend's REAL service layer, as the read-everything
 * auditor. ONE login in this file, reused by every test.
 *
 * Also asserted here:
 * - every family's wire path EXISTS on the live swagger document (fetched
 *   through the paced raw fetch — swagger is not a frontend-serviced API);
 * - `GET /custodies/pending` REQUIRES `warehouseId`: the frontend's
 *   `ListPendingCustodiesQuery` already makes it required, so a WITH-id call
 *   is 200 while the backend without one answers 404 `WAREHOUSES_NOT_FOUND`
 *   (the Round-2 "custody 404 divergence" was a harness path bug — the real
 *   frontend uses `/custodies`, which is on the live swagger);
 * - `GET /counterparts` without its REQUIRED `operation` -> 400
 *   `REQUEST_VALIDATION_FAILED` with details keyed by property name
 *   (`{"operation":[...]}`), which the frontend's `normalizeApiError` maps to
 *   a usable field error — unlike the FluentValidation shape asserted in
 *   `upload.contract-smoke.ts`.
 */
import axios from 'axios'
import { describe, it } from 'vitest'
import { adjustmentService } from '@/modules/adjustment/services/adjustment.service'
import { assetService } from '@/modules/asset/services/asset.service'
import { auditService } from '@/modules/audit/services/audit.service'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import { custodyService } from '@/modules/custody/services/custody.service'
import { inventoryService } from '@/modules/inventory/services/inventory.service'
import { counterpartLookupService } from '@/modules/organization/services/counterpart-lookup.service'
import { organizationService } from '@/modules/organization/services/organization.service'
import { reportsService } from '@/modules/reports/services/reports.service'
import { warehouseService } from '@/modules/warehouse/services/warehouse.service'
import { normalizeApiError } from '@/shared/services/api-error'
import { apiTransport } from '@/shared/api/transport'
import { wireEvidence } from './contract-assert'
import { budgetedFetch } from './contract-budget'
import { CONTRACT_BACKEND_SWAGGER } from './contract-origin'
import { createFileSession } from './contract-session'
import './contract-api-base'

const WAREHOUSE_ID = '373ba70c-aa2c-466d-b9b5-a9df47abf8da'

interface PagedFamily {
  readonly name: string
  readonly wirePath: string
  readonly read: (page: number) => Promise<unknown>
}

/** Flattens the inventory/count `{items, meta}` service shape into AnyPage. */
function flattenMeta(raw: unknown): unknown {
  const record = raw as Record<string, unknown>
  return record['meta'] === undefined ? raw : record['meta']
}

/**
 * Asserts the ApiPage shape on EITHER wire shape (top-level meta or sibling
 * meta) and returns the row list. Fails with the verbatim body, per the
 * evidence contract.
 */
function assertPageShape(
  name: string,
  raw: unknown,
): { items: ReadonlyArray<{ id?: unknown }>; page: unknown } {
  const meta = flattenMeta(raw) as Record<string, unknown>
  for (const key of [
    'page',
    'pageSize',
    'totalItems',
    'totalPages',
    'hasNextPage',
    'hasPreviousPage',
  ] as const) {
    if (meta[key] === undefined) {
      throw new Error(
        `PAGINATION SHAPE DIVERGENCE: ${name} meta.${key} missing — observed status=200 body=${JSON.stringify(raw).slice(0, 400)}`,
      )
    }
  }
  const items = (raw as Record<string, unknown>)['items']
  if (!Array.isArray(items)) {
    throw new Error(
      `PAGINATION SHAPE DIVERGENCE: ${name} has no items array — observed status=200 body=${JSON.stringify(raw).slice(0, 400)}`,
    )
  }
  return { items: items as ReadonlyArray<{ id?: unknown }>, page: meta['page'] }
}

const fileSession = createFileSession()

describe('contract-smoke: paginated families through the service layer (auditor)', () => {
  it('every family page 1 vs 2 -> ApiPage shape, meta echoed, rows differ', async () => {
    await fileSession.login('auditor')
    const families: ReadonlyArray<PagedFamily> = [
      {
        name: 'inventory balances',
        wirePath: '/inventory/balances',
        read: (page) => inventoryService.listBalances({ page, pageSize: 5 }),
      },
      {
        name: 'inventory movements',
        wirePath: '/inventory/movements',
        read: (page) => inventoryService.listMovements({ page, pageSize: 5 }),
      },
      {
        name: 'assets',
        wirePath: '/assets',
        read: (page) => assetService.listAssets({ page, pageSize: 5 }),
      },
      {
        name: 'warehouses',
        wirePath: '/warehouses',
        read: (page) => warehouseService.listWarehouses({ page, pageSize: 5 }),
      },
      {
        name: 'sites',
        wirePath: '/sites',
        read: (page) => organizationService.listSites({ page, pageSize: 5 }),
      },
      {
        name: 'employees',
        wirePath: '/employees',
        read: (page) => organizationService.listEmployees({ page, pageSize: 5 }),
      },
      {
        name: 'materials',
        wirePath: '/catalog/materials',
        read: (page) => catalogService.listMaterials({ page, pageSize: 5 }),
      },
      {
        name: 'audit logs',
        wirePath: '/audit-logs',
        read: (page) => auditService.listAuditLogs({ page, pageSize: 5 }),
      },
      {
        name: 'inventory report',
        wirePath: '/reports/inventory',
        read: (page) => reportsService.getInventoryReport({ page, pageSize: 5 }),
      },
      {
        name: 'adjustments',
        wirePath: '/adjustments',
        read: (page) => adjustmentService.listAdjustments({ page, pageSize: 5 }),
      },
      {
        name: 'custodies',
        wirePath: '/custodies',
        read: (page) => custodyService.listCustodies({ page, pageSize: 5 }),
      },
    ]
    // The live swagger document is the ground truth these paths exist on.
    const swagger = await budgetedFetch(CONTRACT_BACKEND_SWAGGER)
    const paths = (await swagger.json()) as { paths?: Record<string, unknown> }
    if (paths['paths'] === undefined) {
      throw new Error(
        `SWAGGER DIVERGENCE: no paths document — observed status=${swagger.status} body=${JSON.stringify(paths).slice(0, 400)}`,
      )
    }
    const livePaths = paths['paths'] ?? {}
    for (const family of families) {
      const live = `/api/v1${family.wirePath}`
      if (livePaths[live] === undefined) {
        throw new Error(
          `SWAGGER PATH DIVERGENCE: frontend family ${family.name} uses ${live}, absent from the live swagger document (available: ${Object.keys(
            livePaths,
          )
            .filter((p) => p.includes(family.wirePath.split('/').pop() ?? ''))
            .slice(0, 8)
            .join(', ')})`,
        )
      }
    }
    for (const family of families) {
      const first = assertPageShape(family.name, await family.read(1))
      const second = assertPageShape(family.name, await family.read(2))
      if (first.page !== 1 || second.page !== 2) {
        throw new Error(
          `PAGINATION ECHO DIVERGENCE: ${family.name} meta.page not echoed — observed page1=${String(first.page)} page2=${String(second.page)}`,
        )
      }
      const ids1 = new Set(first.items.map((row) => row.id))
      const ids2 = new Set(second.items.map((row) => row.id))
      const overlap = Array.from(ids1).filter((id) => ids2.has(id))
      if (
        first.items.length > 0 &&
        second.items.length > 0 &&
        overlap.length === first.items.length
      ) {
        throw new Error(
          `PAGINATION DIVERGENCE: ${family.name} page1 and page2 are identical — overlap=${JSON.stringify(overlap).slice(0, 400)}`,
        )
      }
    }
  })

  it('GET /custodies/pending WITH warehouseId -> 200 ApiPage (the id is required by the frontend type)', async () => {
    await fileSession.login('auditor')
    const page = await custodyService.listPendingCustodies({
      warehouseId: WAREHOUSE_ID,
      page: 1,
      pageSize: 5,
    })
    assertPageShape('custodies/pending', page)
  })

  it('GET /counterparts without operation -> 400 REQUEST_VALIDATION_FAILED, field error mapped to `operation`', async () => {
    await fileSession.login('auditor')
    try {
      await apiTransport.requestPage({
        path: '/counterparts',
        method: 'GET',
        query: { page: 1, pageSize: 5 },
      })
      throw new Error(
        'COUNTERPARTS VALIDATION DIVERGENCE: expected 400 but the call SUCCEEDED — the required `operation` filter is no longer enforced',
      )
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 400) {
        throw new Error(`counterparts validation: expected status=400 — ${wireEvidence(error)}`, {
          cause: error,
        })
      }
      const normalized = normalizeApiError(error)
      const mapped = normalized.fieldErrors.map((fieldError) => fieldError.field)
      if (!mapped.includes('operation')) {
        throw new Error(
          `FIELD-ERROR MAPPING DIVERGENCE: normalizeApiError did not map the missing \`operation\` — observed status=400 fieldErrors=${JSON.stringify(normalized.fieldErrors).slice(0, 400)} body=${JSON.stringify(error.response.data).slice(0, 400)}`,
          { cause: error },
        )
      }
    }
  })

  it('GET /counterparts with operation=Receiving -> 200 resolutions through the frontend lookup service', async () => {
    await fileSession.login('auditor')
    const resolutions = await counterpartLookupService.searchCounterparts({
      operation: 'Receiving',
      pageSize: 5,
    })
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      throw new Error(
        `COUNTERPARTS DIVERGENCE: expected resolutions — observed status=200 body=${JSON.stringify(resolutions).slice(0, 400)}`,
      )
    }
  })
})
