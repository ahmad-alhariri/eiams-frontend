import { z } from 'zod'

import type {
  CreateMaterialCategoryRequest,
  MaterialCategory,
  MoveMaterialCategoryRequest,
  UpdateMaterialCategoryRequest,
} from '@/modules/catalog/types/catalog.types'

/**
 * `status` is NOT a form field: a new category is Active by definition and
 * status afterwards is its own command, whose body is an INTEGER ordinal rather
 * than this string. `materialDomainId` IS a form field even though it is not
 * updatable, because the create body binds it and the guards below need it to
 * keep the parent in the same domain.
 */
export const materialCategorySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'رمز التصنيف مطلوب.')
    .max(50, 'لا يمكن أن يتجاوز رمز التصنيف 50 حرفاً.'),
  materialDomainId: z.string('اختر مجال التصنيف.').uuid('اختر مجال التصنيف.'),
  name: z
    .string()
    .trim()
    .min(1, 'اسم التصنيف مطلوب.')
    .max(200, 'لا يمكن أن يتجاوز اسم التصنيف 200 حرف.'),
  // `null`, not `undefined`: the create body's own root sentinel is `null`, so
  // the form speaks the wire's language instead of converting at the mapper.
  parentCategoryId: z.union([z.string().uuid('اختر تصنيفاً أباً صالحاً.'), z.null()]),
})

export type MaterialCategoryFormValues = z.infer<typeof materialCategorySchema>

/**
 * Every category reachable DOWNWARD from `categoryId`, itself excluded.
 *
 * Exported because the cycle rule has two halves and both need the same graph:
 * the schema refuses such a parent on submit, and the dialog must not OFFER one
 * in the first place — an option the server answers with 409
 * `MATERIAL_CATEGORIES_CIRCULAR_PARENT` is not a choice the user should be able
 * to make. Duplicating the walk in the component is how the two halves drift.
 */
export function findDescendantIds(
  categoryId: string,
  categories: readonly MaterialCategory[],
): ReadonlySet<string> {
  const childrenByParentId = new Map<string, string[]>()
  for (const category of categories) {
    if (category.parentCategoryId === null) continue
    const children = childrenByParentId.get(category.parentCategoryId) ?? []
    children.push(category.id)
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
  const categoriesById = new Map(categories.map((candidate) => [candidate.id, candidate]))
  const descendantIds =
    category === null ? new Set<string>() : findDescendantIds(category.id, categories)

  return materialCategorySchema.superRefine((values, context) => {
    if (values.parentCategoryId === null) return

    const parent = categoriesById.get(values.parentCategoryId)
    if (parent === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['parentCategoryId'],
        message: 'اختر تصنيفاً أباً متاحاً.',
      })
      return
    }
    if (parent.materialDomainId !== values.materialDomainId) {
      context.addIssue({
        code: 'custom',
        path: ['parentCategoryId'],
        message: 'يجب أن يكون التصنيف الأب ضمن المجال نفسه.',
      })
    }
    if (category !== null && values.parentCategoryId === category.id) {
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

/**
 * `POST /catalog/categories` body — the only request that carries the domain
 * and the parent. Both are create-only from here on.
 */
export function toCreateMaterialCategoryRequest(
  values: MaterialCategoryFormValues,
): CreateMaterialCategoryRequest {
  return {
    materialDomainId: values.materialDomainId,
    parentCategoryId: values.parentCategoryId,
    name: values.name.trim(),
    code: values.code.trim(),
  }
}

/**
 * `PUT /catalog/categories/{materialCategoryId}` body — `name` and `code` only.
 *
 * `materialDomainId` is NOT here because re-domaining is not exposed by this
 * route, and `parentCategoryId` is NOT here because re-parenting has its own
 * command, {@link toMoveMaterialCategoryRequest}. Folding either into this body
 * is what the old single "upsert" shape invited.
 */
export function toUpdateMaterialCategoryRequest(
  values: MaterialCategoryFormValues,
): UpdateMaterialCategoryRequest {
  return {
    name: values.name.trim(),
    code: values.code.trim(),
  }
}

/**
 * `PUT /catalog/categories/{materialCategoryId}/parent` body, or `null` when
 * the selection did not move and no move command is worth sending.
 *
 * Returning `null` rather than always sending keeps an edit that never touched
 * the parent from making a second write the user did not ask for.
 */
export function toMoveMaterialCategoryRequest(
  values: MaterialCategoryFormValues,
  category: MaterialCategory,
): MoveMaterialCategoryRequest | null {
  if (values.parentCategoryId === category.parentCategoryId) return null
  return { parentCategoryId: values.parentCategoryId }
}
