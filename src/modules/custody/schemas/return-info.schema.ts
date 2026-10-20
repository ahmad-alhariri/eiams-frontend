import { z } from 'zod'

/**
 * Return petal schema (e19-t06 / contract ReturnInfo): the original issue
 * document reference is mandatory (uuid, chosen through the posted-issue
 * selector — never typed by hand) plus the free-text reason. The paper
 * reference carries NO server slot in `ReturnInfo`, so it is not captured here.
 *
 * FIX-R1: `RETURN_REASON_MAX_LENGTH` mirrors the backend domain cap in
 * `eiams-backend/src/Domain/ReturnInfos/ReturnInfo.cs`
 * (`normalizedReason.Length is 0 or > 200` ⇒ `ReturnInfoInvalid`). The
 * cross-repo alignment test (`return-info.schema.test.ts`) reads that file and
 * fails when either side drifts.
 */
export const RETURN_REASON_MAX_LENGTH = 200

export const returnInfoFormSchema = z.object({
  originalIssueDocumentId: z.uuid('يجب إدخال معرّف سند الصرف الأصلي.'),
  returnReason: z
    .string()
    .trim()
    .min(3, 'يجب إدخال سبب الإرجاع.')
    .max(RETURN_REASON_MAX_LENGTH, 'يجب ألا يتجاوز سبب الإرجاع 200 محرفاً.'),
})

export type ReturnInfoFormValues = z.infer<typeof returnInfoFormSchema>
