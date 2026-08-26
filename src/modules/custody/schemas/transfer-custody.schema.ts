import { z } from 'zod'

/**
 * Transfer form schema (e19-t05): a new holder is mandatory; the reason is
 * optional narrative for the custody audit trail.
 */
export const transferCustodySchema = z.object({
  holderId: z.uuid('يجب اختيار الحائز الجديد.'),
  holderDisplayName: z.string(),
  reason: z.string().trim().max(300, 'يجب ألا يتجاوز السبب 300 محرفاً.').optional(),
})

export type TransferCustodyFormValues = z.infer<typeof transferCustodySchema>
