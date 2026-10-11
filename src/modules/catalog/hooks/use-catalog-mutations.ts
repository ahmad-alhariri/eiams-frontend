import { createElement, useCallback, useState, type ReactElement } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { catalogService } from '@/modules/catalog/services/catalog.service'
import {
  materialStatusCommandValue,
  statusCommandValue,
  type MaterialStatus,
  type MoveMaterialCategoryRequest,
  type CreateMaterialUnitConversionRequest,
  type RecordStatus,
  type UpdateMaterialCategoryRequest,
  type UpdateMaterialDomainRequest,
  type UpdateMaterialFamilyRequest,
  type UpdateMaterialRequest,
  type UpdateMaterialUnitConversionRequest,
  type UpdateUnitOfMeasureRequest,
} from '@/modules/catalog/types/catalog.types'
import { isConflictError } from '@/shared/services/mutation-safety'
import { queryKeys } from '@/shared/services/query-keys'
import {
  ConflictRecoveryDialog,
  type ConflictRecoveryDialogCopy,
} from '@/shared/ui/conflict-recovery-dialog'

type UpdateMaterialDomainVariables = { domainId: string; request: UpdateMaterialDomainRequest }
type UpdateMaterialCategoryVariables = {
  categoryId: string
  request: UpdateMaterialCategoryRequest
}
type MoveMaterialCategoryVariables = {
  categoryId: string
  request: MoveMaterialCategoryRequest
}
type UpdateMaterialFamilyVariables = { familyId: string; request: UpdateMaterialFamilyRequest }
type UpdateMaterialVariables = { materialId: string; request: UpdateMaterialRequest }
type CreateMaterialUnitConversionVariables = {
  materialId: string
  request: CreateMaterialUnitConversionRequest
}
type UpdateMaterialUnitConversionVariables = {
  materialId: string
  conversionId: string
  request: UpdateMaterialUnitConversionRequest
}
type UpdateUnitOfMeasureVariables = { unitId: string; request: UpdateUnitOfMeasureRequest }
type SetUnitOfMeasureStatusVariables = { unitId: string; status: RecordStatus }
type RemoveMaterialUnitConversionVariables = {
  materialId: string
  conversionId: string
}

/**
 * Status-command variables, in the LANGUAGE OF THE RECORD.
 *
 * The caller passes the status it read off the row (`'Active'` / `'Inactive'`
 * for domain, category, family and unit) and the hook performs the only
 * conversion the wire allows. Status READS are enum names; status WRITES are
 * enum ORDINALS. Building the body here rather than letting a page write a bare
 * `0`/`1`/`2` keeps the two from ever being confused — a naked `0` at a call
 * site is indistinguishable from a falsy guard to the next reader.
 *
 * One named type per command, as `organization` does, even though the four
 * bodies are the same `[JsonRequired] int Status`: the id is what differs, and a
 * single generic `recordId` is how a domain's id ends up on a category's route.
 */
type SetMaterialDomainStatusVariables = { domainId: string; status: RecordStatus }
type SetMaterialCategoryStatusVariables = { categoryId: string; status: RecordStatus }
type SetMaterialFamilyStatusVariables = { familyId: string; status: RecordStatus }
type SetMaterialStatusVariables = { materialId: string; status: MaterialStatus }

function useInvalidateCatalog() {
  const queryClient = useQueryClient()
  const { activeScopeCacheKey } = useActiveScopeContext()

  return async () => {
    if (activeScopeCacheKey === undefined) return

    await queryClient.invalidateQueries({
      // Hierarchy names and units are embedded in downstream catalog responses.
      queryKey: queryKeys.scoped(activeScopeCacheKey, 'catalog'),
      exact: false,
    })
  }
}

export function useCreateMaterialDomainMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterialDomain, onSuccess: invalidate })
}

export function useUpdateMaterialDomainMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ domainId, request }: UpdateMaterialDomainVariables) =>
      catalogService.updateMaterialDomain(domainId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialCategoryMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterialCategory, onSuccess: invalidate })
}

export function useUpdateMaterialCategoryMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ categoryId, request }: UpdateMaterialCategoryVariables) =>
      catalogService.updateMaterialCategory(categoryId, request),
    onSuccess: invalidate,
  })
}

export function useMoveMaterialCategoryMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ categoryId, request }: MoveMaterialCategoryVariables) =>
      catalogService.moveMaterialCategory(categoryId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialFamilyMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterialFamily, onSuccess: invalidate })
}

export function useUpdateMaterialFamilyMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ familyId, request }: UpdateMaterialFamilyVariables) =>
      catalogService.updateMaterialFamily(familyId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createMaterial, onSuccess: invalidate })
}

/**
 * `PUT /catalog/materials/{materialId}`.
 *
 * The version travels on the request: `expectedCatalogVersion` must be the
 * `catalogVersion` the read served, VERBATIM, which is what
 * `toUpdateMaterialRequest` echoes. It is not called `rowVersion`, it is
 * required, and a stale echo is refused with 409
 * `MATERIALS_CATALOG_VERSION_MISMATCH`. Family, base unit and code are not
 * sentable here — they are create-only.
 */
export function useUpdateMaterialMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, request }: UpdateMaterialVariables) =>
      catalogService.updateMaterial(materialId, request),
    onSuccess: invalidate,
  })
}

export function useCreateMaterialUnitConversionMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, request }: CreateMaterialUnitConversionVariables) =>
      catalogService.createMaterialUnitConversion(materialId, request),
    onSuccess: invalidate,
  })
}

export function useUpdateMaterialUnitConversionMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, conversionId, request }: UpdateMaterialUnitConversionVariables) =>
      catalogService.updateMaterialUnitConversion(materialId, conversionId, request),
    onSuccess: invalidate,
  })
}

/**
 * The end of a conversion's lifecycle.
 *
 * A material unit conversion carries no `status` — it is not a suspendable
 * master record — so there is deliberately NO `useSetMaterialUnitConversionStatusMutation`
 * and no status route to call. Removal is the only lifecycle a conversion has.
 */
export function useRemoveMaterialUnitConversionMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, conversionId }: RemoveMaterialUnitConversionVariables) =>
      catalogService.removeMaterialUnitConversion(materialId, conversionId),
    onSuccess: invalidate,
  })
}

export function useCreateUnitOfMeasureMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: catalogService.createUnitOfMeasure, onSuccess: invalidate })
}

export function useUpdateUnitOfMeasureMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ unitId, request }: UpdateUnitOfMeasureVariables) =>
      catalogService.updateUnitOfMeasure(unitId, request),
    onSuccess: invalidate,
  })
}

export function useSetUnitOfMeasureStatusMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ unitId, status }: SetUnitOfMeasureStatusVariables) =>
      catalogService.setUnitOfMeasureStatus(unitId, { status: statusCommandValue[status] }),
    onSuccess: invalidate,
  })
}

export function useSetMaterialDomainStatusMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ domainId, status }: SetMaterialDomainStatusVariables) =>
      catalogService.setMaterialDomainStatus(domainId, { status: statusCommandValue[status] }),
    onSuccess: invalidate,
  })
}

export function useSetMaterialCategoryStatusMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ categoryId, status }: SetMaterialCategoryStatusVariables) =>
      catalogService.setMaterialCategoryStatus(categoryId, { status: statusCommandValue[status] }),
    onSuccess: invalidate,
  })
}

export function useSetMaterialFamilyStatusMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ familyId, status }: SetMaterialFamilyStatusVariables) =>
      catalogService.setMaterialFamilyStatus(familyId, { status: statusCommandValue[status] }),
    onSuccess: invalidate,
  })
}

/**
 * The only status command in this module whose ordinal space has three values,
 * because Material is the only catalog entity with `Archived`. `Archived` is
 * terminal, so a call site that wants it must name it.
 */
export function useSetMaterialStatusMutation() {
  const invalidate = useInvalidateCatalog()
  return useMutation({
    mutationFn: ({ materialId, status }: SetMaterialStatusVariables) =>
      catalogService.setMaterialStatus(materialId, { status: materialStatusCommandValue[status] }),
    onSuccess: invalidate,
  })
}

/**
 * Neutral Arabic copy for the material-update conflict dialog.
 *
 * It says nothing about whether the rejected write was applied, because a 409
 * does not carry that information — claiming "لم يتم الحفظ" (not saved) or "تم
 * الحفظ" (saved) would be a fabricated fact. The two honest moves are offered
 * and nothing else is asserted.
 */
export const MATERIAL_UPDATE_CONFLICT_COPY: ConflictRecoveryDialogCopy = {
  titleAr: 'تغيّرت المادة على خادم النظام',
  descriptionAr:
    'رفض الخادم الحفظ لأن هذه المادة تغيّرت منذ تحميلها. لم يحدّد الخادم ما إذا كان الحفظ قد نُفّذ من عدمه، ولا يزعم النظام ذلك أيضاً. يمكنك تحميل النسخة الحالية من الخادم والبدء منها، أو البقاء على ما هو معروض الآن.',
  recoverLabelAr: 'تحميل النسخة الحالية',
  recoveringLabelAr: 'جارٍ التحميل...',
  stayLabelAr: 'البقاء على المعروض',
  slot: 'material-conflict-dialog',
}

export interface MaterialUpdateConflictApi {
  /** True while the recovery dialog is showing. */
  readonly isActive: boolean
  /**
   * Classifies a failed material write. Returns true when the failure was a 409
   * and the recovery dialog is now showing — in that case the caller has NOTHING
   * left to do, and in particular must not raise the generic error toast: the
   * dialog IS the whole response to a 409.
   *
   * Returns false for every other failure, which keeps the caller's usual
   * Arabic toast and inline field-error mapping intact.
   */
  readonly capture: (error: unknown) => boolean
  /** Render once, at the page root. `null` while no conflict is active. */
  readonly dialog: ReactElement | null
}

/**
 * Binds one material update to the shared neutral recovery dialog.
 *
 * `isConflictError` is applied HERE, at the hook boundary, rather than in the
 * page: a service is forbidden to normalize errors and a page should not each
 * re-derive the contract's 409 recogniser.
 *
 * `onRecover` is what "load the server's version" means for this screen —
 * usually refetching the material — and it is left to the caller because the
 * page owns the query. The dialog never claims the reload succeeded either.
 */
export function useMaterialUpdateConflict({
  onRecover,
}: {
  readonly onRecover?: (() => Promise<unknown> | unknown) | undefined
}): MaterialUpdateConflictApi {
  const [isActive, setIsActive] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const capture = useCallback((error: unknown) => {
    if (!isConflictError(error)) return false
    setIsActive(true)
    return true
  }, [])

  const dismiss = useCallback(() => setIsActive(false), [])

  const recover = useCallback(() => {
    if (onRecover === undefined) {
      setIsActive(false)
      return
    }
    setIsRefreshing(true)
    void (async () => {
      try {
        await onRecover()
      } finally {
        setIsRefreshing(false)
        setIsActive(false)
      }
    })()
  }, [onRecover])

  const dialog: ReactElement | null = isActive
    ? createElement(ConflictRecoveryDialog, {
        ...MATERIAL_UPDATE_CONFLICT_COPY,
        isRefreshing,
        onDismiss: dismiss,
        onRecover: recover,
      })
    : null

  return { isActive, capture, dialog }
}

/**
 * The material update plus its 409 recovery path, as one surface.
 *
 * A material update is the only write in this module that can be refused by
 * optimistic concurrency, so the page needs the mutation and the dialog bound
 * together rather than remembering to wire them side by side.
 *
 * `submit` returns true when the write was saved and false when it was a 409
 * that the dialog is now answering, so a caller writes:
 *
 * ```ts
 * if (!(await update.submit(variables))) return
 * toast.success({ title: 'تم حفظ تعديلات المادة.' })
 * ```
 */
export function useMaterialUpdateWithConflict({
  onSuccess,
  onRecover,
}: {
  readonly onSuccess?: (() => void) | undefined
  readonly onRecover?: (() => Promise<unknown> | unknown) | undefined
}) {
  const updateMutation = useUpdateMaterialMutation()
  const conflict = useMaterialUpdateConflict({ onRecover })

  const submit = useCallback(
    async (variables: UpdateMaterialVariables) => {
      try {
        await updateMutation.mutateAsync(variables)
      } catch (error: unknown) {
        if (conflict.capture(error)) return false
        throw error
      }
      onSuccess?.()
      return true
    },
    [conflict, onSuccess, updateMutation],
  )

  return { submit, isPending: updateMutation.isPending, dialog: conflict.dialog }
}
