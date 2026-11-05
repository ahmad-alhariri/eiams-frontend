import { apiTransport } from '@/shared/api/transport'
import { withSignal, type RequestContext } from '@/shared/api/api-transport'
import { toWireOneBasedPaginationParams } from '@/shared/api/pagination'
import type {
  ListMaterialUnitConversionsQuery,
  ListUnitsOfMeasureQuery,
  MaterialUnitConversion,
  MaterialUnitConversionPage,
  UnitOfMeasure,
  UnitOfMeasurePage,
} from '@/shared/types/catalog.wire-types'
import { pathWithId } from '@/shared/services/api-path'

const UNITS_OF_MEASURE_PATH = '/catalog/units-of-measure'
const MATERIAL_UNIT_CONVERSIONS_PATH = '/catalog/materials/{materialId}/unit-conversions'

/**
 * READ CONTRACT — catalog list reads, one implementation per endpoint, owned
 * here in the shared layer so `src/shared` never imports a feature module for
 * the data it needs. Pure service: no react-query, no cache, no UI — the owning
 * hooks (see `@/shared/catalog/use-catalog-reference-queries`) read through it.
 *
 * Every list result is the shared `ApiPage<T>` (normalized, one-based page,
 * camelCase fields); the 1-based wire page is clamped by
 * `toWireOneBasedPaginationParams` in exactly one place.
 */

/**
 * `GET /catalog/units-of-measure` binds NO filter at all — not even `status`.
 * Only `page`/`pageSize`.
 */
export async function listUnitsOfMeasure(
  query: ListUnitsOfMeasureQuery,
  context?: RequestContext,
): Promise<UnitOfMeasurePage> {
  return await apiTransport.requestPage<UnitOfMeasure>({
    path: UNITS_OF_MEASURE_PATH,
    method: 'GET',
    query: toWireOneBasedPaginationParams(query),
    ...withSignal(context),
  })
}

/**
 * `GET /catalog/materials/{materialId}/unit-conversions` binds NO filter — the
 * material comes from the path and nothing else but pagination applies.
 */
export async function listMaterialUnitConversions(
  materialId: string,
  query: ListMaterialUnitConversionsQuery,
  context?: RequestContext,
): Promise<MaterialUnitConversionPage> {
  return await apiTransport.requestPage<MaterialUnitConversion>({
    path: pathWithId(MATERIAL_UNIT_CONVERSIONS_PATH, '{materialId}', materialId),
    method: 'GET',
    query: toWireOneBasedPaginationParams(query),
    ...withSignal(context),
  })
}
