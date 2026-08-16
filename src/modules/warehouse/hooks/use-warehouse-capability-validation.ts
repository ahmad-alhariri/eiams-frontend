import { useCallback, useMemo } from 'react'

import type { CapabilityOperation, WarehouseCapability } from '@/shared/types/generated/eiams-v1'

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
const EMPTY_OPERATIONS: readonly CapabilityOperation[] = []

export function useWarehouseCapabilityValidation(warehouseId: string | undefined) {
  const capabilitiesQuery = useWarehouseCapabilitiesQuery(warehouseId)
  const { data, isLoading, isError } = capabilitiesQuery
  const capabilities = data ?? EMPTY_CAPABILITIES

  const domainOperations = useMemo(() => {
    const operationsByDomain = new Map<string, ReadonlySet<CapabilityOperation>>()
    for (const capability of capabilities) {
      operationsByDomain.set(capability.domain.id, new Set(capability.operations))
    }
    return operationsByDomain
  }, [capabilities])

  const domainNames = useMemo(() => {
    const namesByDomain = new Map<string, string>()
    for (const capability of capabilities) {
      namesByDomain.set(capability.domain.id, capability.domain.displayName)
    }
    return namesByDomain
  }, [capabilities])

  const validates = useCallback(
    (domainId: string | undefined, operation: CapabilityOperation): CapabilityValidation => {
      if (warehouseId === undefined || domainId == null || isLoading || isError) {
        return { status: 'unknown' }
      }
      const operations = domainOperations.get(domainId)
      if (operations === undefined || !operations.has(operation)) {
        const domainName = domainNames.get(domainId)
        const messageAr =
          domainName === undefined
            ? `المستودع لا يمتلك قدرة "${OPERATION_LABELS[operation]}" لمجال هذه المادة.`
            : `المستودع لا يمتلك قدرة "${OPERATION_LABELS[operation]}" لمجال "${domainName}".`
        return { status: 'blocked', messageAr }
      }
      return { status: 'supported' }
    },
    [warehouseId, isLoading, isError, domainOperations, domainNames],
  )

  const getOperationsForDomain = useCallback(
    (domainId: string | undefined): readonly CapabilityOperation[] => {
      if (domainId == null) {
        return EMPTY_OPERATIONS
      }
      const operations = domainOperations.get(domainId)
      return operations === undefined ? EMPTY_OPERATIONS : [...operations]
    },
    [domainOperations],
  )

  return { capabilities, isLoading, isError, validates, getOperationsForDomain }
}
