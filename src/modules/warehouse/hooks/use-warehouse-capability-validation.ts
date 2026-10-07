import { useCallback, useMemo } from 'react'

import type {
  CapabilityOperation,
  WarehouseCapability,
} from '@/modules/warehouse/types/warehouse.api-types'
import { useWarehouseCapabilitiesQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'

export type CapabilityValidation =
  { status: 'supported' } | { status: 'blocked'; messageAr: string } | { status: 'unknown' }

export const OPERATION_LABELS: Record<CapabilityOperation, string> = {
  Receiving: 'استلام',
  Issue: 'صرف',
  Transfer: 'تحويل',
  Count: 'جرد',
  Return: 'إرجاع',
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
  const capabilities = data ?? EMPTY_CAPABILITIES

  // Build map: warehouseId -> domainId -> set of operations
  const operationsByWarehouseDomain = useMemo(() => {
    const outer = new Map<string, Map<string, ReadonlySet<CapabilityOperation>>>()
    for (const cap of capabilities) {
      const warehouseMap =
        outer.get(cap.warehouseId) ?? new Map<string, ReadonlySet<CapabilityOperation>>()
      // Backend returns `operations` as array; normalize to Set
      const ops = new Set<CapabilityOperation>(cap.operations)
      warehouseMap.set(cap.domainId, ops)
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
