import { z } from 'zod'

import type {
  MaterialCategory,
  MaterialCategoryUpsertRequest,
} from '@/shared/types/generated/eiams-v1'

export const materialCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'رمز التصنيف مطلوب.')
    .max(50, 'لا يمكن أن يتجاوز رمز التصنيف 50 حرفاً.'),
  domainId: z.string().uuid('اختر مجال التصنيف.'),
  nameAr: z
    .string()
    .trim()
    .min(1, 'اسم التصنيف مطلوب.')
    .max(200, 'لا يمكن أن يتجاوز اسم التصنيف 200 حرف.'),
  parentCategoryId: z.string().uuid().optional(),
  status: z.enum(['Active', 'Inactive']),
})

export type MaterialCategoryFormValues = z.infer<typeof materialCategorySchema>

function findDescendantIds(
  categoryId: string,
  categories: readonly MaterialCategory[],
): ReadonlySet<string> {
  const childrenByParentId = new Map<string, string[]>()
  for (const category of categories) {
    if (category.parentCategoryId === undefined) continue
    const children = childrenByParentId.get(category.parentCategoryId) ?? []
    children.push(category.categoryId)
    childrenByParentId.set(category.parentCategoryId, children)
  }

  const descendantIds = new Set<string>()
  const pending = [...(childrenByParentId.get(categoryId) ?? [])]
  while (pending.length > 0) {
    const currentId = pending.pop()
    if (currentId === undefined || descendantIds.has(currentId)) continue
    descendantIds.add(currentId)
    pending.push(...(childrenByParentId.get(currentId) ?? []))
  }
  return descendantIds
}

/**
 * Adds only deterministic client guards to the contract schema. The server
 * remains authoritative for scope, concurrency, and concurrent hierarchy edits.
 */
export function createMaterialCategorySchema(
  categories: readonly MaterialCategory[],
  category: MaterialCategory | null,
) {
  const categoriesById = new Map(categories.map((candidate) => [candidate.categoryId, candidate]))
  const descendantIds =
    category === null ? new Set<string>() : findDescendantIds(category.categoryId, categories)

  return materialCategorySchema.superRefine((values, context) => {
    if (values.parentCategoryId === undefined) return

    const parent = categoriesById.get(values.parentCategoryId)
    if (parent === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['parentCategoryId'],
        message: 'اختر تصنيفاً أباً متاحاً.',
      })
      return
    }
    if (parent.domain.id !== values.domainId) {
      context.addIssue({
        code: 'custom',
        path: ['parentCategoryId'],
        message: 'يجب أن يكون التصنيف الأب ضمن المجال نفسه.',
      })
    }
    if (category !== null && values.parentCategoryId === category.categoryId) {
      context.addIssue({
        code: 'custom',
        path: ['parentCategoryId'],
        message: 'لا يمكن اختيار التصنيف نفسه كتصنيف أب.',
      })
    }
    if (descendantIds.has(values.parentCategoryId)) {
      context.addIssue({
        code: 'custom',
        path: ['parentCategoryId'],
        message: 'لا يمكن نقل التصنيف تحت أحد تصنيفاته الفرعية.',
      })
    }
  })
}

/** Maps form values to the exact v1 payload, including optimistic concurrency on edit. */
export function toMaterialCategoryRequest(
  values: MaterialCategoryFormValues,
  category: MaterialCategory | null,
): MaterialCategoryUpsertRequest {
  return {
    code: values.code.trim(),
    domainId: values.domainId,
    nameAr: values.nameAr.trim(),
    ...(values.parentCategoryId === undefined ? {} : { parentCategoryId: values.parentCategoryId }),
    rowVersion: category?.rowVersion ?? 0,
    status: values.status,
  }
}
