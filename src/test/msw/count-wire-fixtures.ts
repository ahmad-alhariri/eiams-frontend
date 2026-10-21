import { http, type HttpHandler } from 'msw'

import { okJson } from './envelope'

/**
 * Name-lookup handlers for the count module.
 *
 * The live count DTOs carry ids and numbers only, so the count UI resolves a
 * display name through the OWNING module's single-read endpoint
 * (`GET /catalog/materials/{materialId}`, `GET /warehouses/{warehouseId}`)
 * with per-id caching. The global handler registry is empty by design, so a
 * feature test that renders a count line must register these handlers itself —
 * without them the component degrades to the raw id and every name assertion
 * fails for a reason that has nothing to do with the count contract.
 */
export interface CountNameFixtures {
  /** materialId -> the `nameAr` the catalog read returns. */
  readonly materials?: Readonly<Record<string, string>>
  /** warehouseId -> the `name` the warehouse read returns. */
  readonly warehouses?: Readonly<Record<string, string>>
}

const API_BASE_URL = '/api/v1'

export function countNameHandlers(fixtures: CountNameFixtures): readonly HttpHandler[] {
  return [
    http.get(`${API_BASE_URL}/catalog/materials/:materialId`, ({ params }) => {
      const materialId = String(params['materialId'])
      const nameAr = fixtures.materials?.[materialId]
      if (nameAr === undefined) {
        return okJson({ id: materialId, nameAr: materialId })
      }
      return okJson({ id: materialId, nameAr })
    }),
    http.get(`${API_BASE_URL}/warehouses/:warehouseId`, ({ params }) => {
      const warehouseId = String(params['warehouseId'])
      const name = fixtures.warehouses?.[warehouseId]
      if (name === undefined) {
        return okJson({ id: warehouseId, name: warehouseId })
      }
      return okJson({ id: warehouseId, name })
    }),
  ]
}