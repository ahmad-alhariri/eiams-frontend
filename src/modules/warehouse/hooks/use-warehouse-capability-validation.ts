import { useCallback, useMemo } from 'react'

import type {
  CapabilityOperation,
  WarehouseCapability,
} from '@/modules/warehouse/types/warehouse.api-types'
import { useWarehouseCapabilitiesQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'

export type CapabilityValidation =
  { status: 'supported' } | { status: 'blocked'; messageAr: string } | { status: 'unknown' }

/**
 * Arabic labels for the six `CapabilityOperation` enum values, including
 * `Adjustment` which the frozen frontend union silently dropped (lvt.1 / lvtk.4
 * ruling). Render every operation by this map, never by the raw enum name, to
 * satisfy the AGENTS.md "UI = Arabic" rule.
 */
export const OPERATION_LABELS: Record<CapabilityOperation, string> = {
  Receiving: 'استلام',
  Issue: 'صرف',
  Transfer: 'تحويل',
  Count: 'جرد',
  Return: 'إرجاع',
  Adjustment: 'تسوية',
}

const EMPTY_CAPABILITIES: readonly WarehouseCapability[] = []

/**
 * Shared empty result so a miss is referentially stable.
 *
 * `getOperationsForDomain` is consumed from render and its result is a dependency
 * of the callers' memos; handing back a fresh `new Set()` per miss made every
 * lookup a new reference and defeated that memoization for the common case (the
 * overwhelmingly frequent one being "no capability row for this domain").
 */
const EMPTY_OPERATIONS: ReadonlySet<CapabilityOperation> = new Set<CapabilityOperation>()

export interface UseWarehouseCapabilityValidationReturn {
  validationFor: (
    domainId: string | undefined,
    operation: CapabilityOperation,
  ) => CapabilityValidation
  validates: (domainId: string | undefined, operation: CapabilityOperation) => CapabilityValidation
  isLoading: boolean
  isError: boolean
  /** Read-only view of the computed operations map (warehouseId -> domainId -> operations). */
  operations: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<CapabilityOperation>>>
  /** Look up the set of enabled operations for a given material domain. */
  getOperationsForDomain: (domainId: string) => ReadonlySet<CapabilityOperation>
}

export function useWarehouseCapabilityValidation(
  warehouseId: string | undefined,
): UseWarehouseCapabilityValidationReturn {
  const capabilitiesQuery = useWarehouseCapabilitiesQuery(warehouseId)
  const { data, isLoading, isError } = capabilitiesQuery
  // The capability endpoint returns a paginated `ApiPage<WarehouseCapability>`;
  // the editor and the document gate only need the in-memory set, so we
  // collapse to the items array here. With the documented page size (50) the
  // paged read covers every plausible warehouse capability matrix; the rare
  // warehouse with >50 capability rows is a server-side pagination concern,
  // not a UI one.
  const capabilities = data?.items ?? EMPTY_CAPABILITIES

  // Build map: warehouseId -> domainId -> set of operations. The wire keys
  // the capability on (warehouseId, materialDomainId, operations[]) — not on
  // a nested `domain.id`. The editor and the document gate both consume this
  // map, and the document gate's predicate is `validates(domainId, op)`, so
  // the inner key must be the materialDomainId.
  const operationsByWarehouseDomain = useMemo(() => {
    const outer = new Map<string, Map<string, ReadonlySet<CapabilityOperation>>>()
    for (const cap of capabilities) {
      const warehouseMap =
        outer.get(cap.warehouseId) ?? new Map<string, ReadonlySet<CapabilityOperation>>()
      const ops = new Set<CapabilityOperation>(cap.operations)
      warehouseMap.set(cap.materialDomainId, ops)
      outer.set(cap.warehouseId, warehouseMap)
    }
    return outer
  }, [capabilities])

  const getOperationsForDomain = useCallback(
    (domainId: string): ReadonlySet<CapabilityOperation> => {
      const warehouseMap = operationsByWarehouseDomain.get(warehouseId ?? '')
      if (warehouseMap === undefined) return EMPTY_OPERATIONS
      return warehouseMap.get(domainId) ?? EMPTY_OPERATIONS
    },
    [operationsByWarehouseDomain, warehouseId],
  )

  const validationFor = useCallback(
    (domainId: string | undefined, operation: CapabilityOperation): CapabilityValidation => {
      if (isLoading || isError || warehouseId === undefined) {
        return { status: 'unknown' }
      }
      // An absent or empty domainId means the line has no material chosen yet, so
      // there is nothing to check against. Reporting `blocked` there would paint a
      // red "unsupported operation" under every untouched line of an open form.
      if (domainId === undefined || domainId === '') {
        return { status: 'unknown' }
      }
      const ops = getOperationsForDomain(domainId)
      if (ops.has(operation)) {
        return { status: 'supported' }
      }
      return {
        status: 'blocked',
        messageAr: `العملية ${OPERATION_LABELS[operation]} غير مدعومة لهذا المستودع والمجال المطلوبين.`,
      }
    },
    [getOperationsForDomain, isLoading, isError, warehouseId],
  )

  const validates = useCallback(
    (domainId: string | undefined, operation: CapabilityOperation): CapabilityValidation => {
      return validationFor(domainId, operation)
    },
    [validationFor],
  )

  return {
    validationFor,
    validates,
    isLoading,
    isError,
    // Map is structurally compatible: string keys only, ReadonlySet values.
    operations: operationsByWarehouseDomain as ReadonlyMap<
      string,
      ReadonlyMap<string, ReadonlySet<CapabilityOperation>>
    >,
    getOperationsForDomain,
  }
}
