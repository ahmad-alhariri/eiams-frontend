import { z } from 'zod'

import type {
  CapabilityOperation,
  WarehouseCapability,
  WarehouseCapabilityUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

const OPERATION_VALUES = ['Receiving', 'Issue', 'Transfer', 'Count', 'Return'] as const

const capabilityRowSchema = z.object({
  domainId: z.uuid('يجب اختيار مجال مواد صالح.'),
  operations: z
    .array(z.enum(OPERATION_VALUES))
    .min(1, 'يجب اختيار عملية واحدة على الأقل لكل مجال.'),
})

/** The replace endpoint accepts an intentional, complete capability matrix. */
export const warehouseCapabilitiesSchema = z
  .object({ capabilities: z.array(capabilityRowSchema) })
  .superRefine(({ capabilities }, context) => {
    const seenDomainIds = new Set<string>()
    capabilities.forEach((capability, index) => {
      if (seenDomainIds.has(capability.domainId)) {
        context.addIssue({
          code: 'custom',
          message: 'لا يمكن تكرار مجال المواد في قدرات المستودع.',
          path: ['capabilities', index, 'domainId'],
        })
      }
      seenDomainIds.add(capability.domainId)
    })
  })

export type WarehouseCapabilitiesFormValues = z.infer<typeof warehouseCapabilitiesSchema>

export const CAPABILITY_OPERATIONS: readonly CapabilityOperation[] = OPERATION_VALUES

/** Preserves the server concurrency version for existing rows; new rows start at zero. */
export function toWarehouseCapabilitiesRequest(
  values: WarehouseCapabilitiesFormValues,
  currentCapabilities: readonly WarehouseCapability[],
): readonly WarehouseCapabilityUpsertRequest[] {
  const rowVersionByDomain = new Map(
    currentCapabilities.map((capability) => [capability.domain.id, capability.rowVersion]),
  )

  return values.capabilities.map((capability) => ({
    domainId: capability.domainId,
    operations: capability.operations,
    rowVersion: rowVersionByDomain.get(capability.domainId) ?? 0,
  }))
}
