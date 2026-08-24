import { z } from 'zod'

/**
 * Return petal schema (e19-t06 / contract ReturnInfo): the original issue
 * document reference is mandatory (uuid), the human-readable issue paper
 * reference and free-text reason ride along for auditability.
 */
export const returnInfoFormSchema = z.object({
  originalIssueDocumentId: z.uuid('يجب إدخال معرّف سند الصرف الأصلي.'),
  originalIssueReference: z.string().trim().max(100).optional(),
  returnReason: z
    .string()
    .trim()
    .min(3, 'يجب إدخال سبب الإرجاع.')
    .max(300, 'يجب ألا يتجاوز سبب الإرجاع 300 محرفاً.'),
})

export type ReturnInfoFormValues = z.infer<typeof returnInfoFormSchema>
