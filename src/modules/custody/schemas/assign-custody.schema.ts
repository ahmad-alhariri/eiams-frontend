import { z } from 'zod'

/**
 * Personal-assignment form schema (e19-t03 / PRD §12.8): an active Employee
 * is mandatory; the optional reason is bounded like other narrative fields.
 */
export const assignCustodySchema = z.object({
  /** Selected Employee counterpart id (from the shared lookup). */
  holderId: z.uuid('يجب اختيار الموظف المكلف.'),
  /** Display name captured at selection for the audit reason text. */
  holderDisplayName: z.string(),
  reason: z.string().trim().max(300, 'يجب ألا يتجاوز السبب 300 محرفاً.').optional(),
})

export type AssignCustodyFormValues = z.infer<typeof assignCustodySchema>
