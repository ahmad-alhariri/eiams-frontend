import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialUnitConversionFormDialog } from '@/modules/catalog/components/material-unit-conversion-form-dialog'
import {
  useCreateMaterialUnitConversionMutation,
  useRemoveMaterialUnitConversionMutation,
  useUpdateMaterialUnitConversionMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialUnitConversionsQuery,
  useUnitsOfMeasureQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toCreateMaterialUnitConversionRequest,
  toUpdateMaterialUnitConversionRequest,
  type MaterialUnitConversionFormValues,
} from '@/modules/catalog/schemas/material-unit-conversion.schemas'
import type { Material, MaterialUnitConversion } from '@/modules/catalog/types/catalog.types'
import { MAX_WIRE_PAGE_SIZE } from '@/shared/api/pagination'
import { ReferenceLimitNote } from '@/shared/feedback/reference-limit-note'
import { ContentCard } from '@/shared/layout/content-card'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { toast } from '@/shared/ui/toast-manager'

const conversionColumnHelper = createColumnHelper<
  typeof dataTableFeatures,
  MaterialUnitConversion
>()

/**
 * The unit list behind this card is a REFERENCE load for two joins: the
 * alternative-unit label in the rows, and the base unit's `unitType` the create
 * dialog filters candidates by. Both need the whole directory, so it is asked
 * for at the backend's maximum page — 100, never more — instead of inheriting
 * the server default of 20 and silently offering a truncated picker.
 */
const UNITS_REFERENCE_PAGE = { page: 1, pageSize: MAX_WIRE_PAGE_SIZE } as const

/**
 * Manages alternative units for one material only. Factors always resolve
 * directly to the material's server-owned base unit; this is not a global UoM
 * conversion table.
 *
 * A conversion carries no `status`: it is not a suspendable master record, so
 * its lifecycle ends in DELETE (`useRemoveMaterialUnitConversionMutation`), not
 * in an "Inactive" command that no catalog route serves.
 */
export function MaterialUnitConversions({ material }: { material: Material }) {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const conversionsQuery = useMaterialUnitConversionsQuery(material.id)
  const unitsQuery = useUnitsOfMeasureQuery(UNITS_REFERENCE_PAGE)
  const createMutation = useCreateMaterialUnitConversionMutation()
  const updateMutation = useUpdateMaterialUnitConversionMutation()
  const removeMutation = useRemoveMaterialUnitConversionMutation()
  const [dialogConversion, setDialogConversion] = useState<
    MaterialUnitConversion | null | undefined
  >(undefined)
  const [removalTarget, setRemovalTarget] = useState<MaterialUnitConversion | null>(null)

  const conversions = useMemo(() => conversionsQuery.data?.items ?? [], [conversionsQuery.data])
  const unitsById = useMemo(
    () => new Map((unitsQuery.data?.items ?? []).map((unit) => [unit.id, unit])),
    [unitsQuery.data],
  )

  /** Units already serving as this material's alternative, so the form excludes them. */
  const activeUnitIds = useMemo<ReadonlySet<string>>(
    () => new Set(conversions.map((conversion) => conversion.fromUnitId)),
    [conversions],
  )
  /**
   * The alternative unit is a flat `fromUnitId` on the conversion — there is no
   * nested unit reference any more — so the label is resolved from the unit
   * reference list. An unknown id falls back to the raw value rather than
   * rendering a blank row.
   */
  const unitLabel = useCallback(
    (unitId: string) => unitsById.get(unitId)?.name ?? unitId,
    [unitsById],
  )
  const openCreate = useCallback(() => setDialogConversion(null), [])
  const openEdit = useCallback(
    (conversion: MaterialUnitConversion) => setDialogConversion(conversion),
    [],
  )
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogConversion(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: MaterialUnitConversionFormValues) => {
      const conversion = dialogConversion ?? null
      try {
        if (conversion === null) {
          // `toBaseUnitId` is the material's OWN base unit, supplied from the
          // record and never chosen in the form.
          await createMutation.mutateAsync({
            materialId: material.id,
            request: toCreateMaterialUnitConversionRequest(values, material.baseUnitId),
          })
          toast.success({ title: 'تمت إضافة وحدة بديلة للمادة.' })
        } else {
          // The update route binds `factor` ONLY: re-pointing the units is a
          // remove-and-add, which is what the delete action below is for.
          await updateMutation.mutateAsync({
            materialId: material.id,
            conversionId: conversion.id,
            request: toUpdateMaterialUnitConversionRequest(values),
          })
          toast.success({ title: 'تم حفظ تعديلات التحويل.' })
        }
        setDialogConversion(undefined)
      } catch (error: unknown) {
        const apiError = normalizeApiError(error)
        toast.error({
          title: apiError.titleAr,
          ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
        })
        throw error
      }
    },
    [createMutation, dialogConversion, material.baseUnitId, material.id, updateMutation],
  )

  /**
   * Removal is the end of a conversion's lifecycle and is irreversible, so it
   * is confirmed and the button stays busy until the server answers. Nothing
   * about the row is assumed to have changed if the call fails.
   */
  const confirmRemoval = useCallback(async () => {
    if (removalTarget === null) return
    try {
      await removeMutation.mutateAsync({
        materialId: material.id,
        conversionId: removalTarget.id,
      })
    } catch {
      return
    }

    toast.success({ title: 'تمت إزالة التحويل نهائياً.' })
    setRemovalTarget(null)
  }, [material.id, removeMutation, removalTarget])

  const columns = useMemo(
    () =>
      conversionColumnHelper.columns([
        conversionColumnHelper.accessor((conversion) => unitLabel(conversion.fromUnitId), {
          id: 'unit',
          header: 'الوحدة البديلة',
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">{getValue()}</span>
          ),
        }),
        conversionColumnHelper.accessor('factor', {
          id: 'factor',
          header: `عامل التحويل إلى ${material.baseUnitSymbol}`,
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        ...(canManage
          ? [
              conversionColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`تعديل التحويل ${unitLabel(row.original.fromUnitId)}`}
                      onClick={() => openEdit(row.original)}
                    >
                      <IconEdit aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`إزالة التحويل ${unitLabel(row.original.fromUnitId)}`}
                      onClick={() => setRemovalTarget(row.original)}
                    >
                      <IconTrash aria-hidden />
                    </Button>
                  </div>
                ),
              }),
            ]
          : []),
      ]),
    [canManage, material.baseUnitSymbol, openEdit, unitLabel],
  )

  return (
    <>
      <ContentCard
        title="الوحدات البديلة والتحويل"
        description={`كل وحدة بديلة تتحول مباشرةً إلى وحدة أساس المادة (${material.baseUnitSymbol}) بعامل خاص بهذه المادة، ولا يوجد عامل عام لوحدة القياس.`}
        action={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <IconPlus aria-hidden data-icon="inline-start" />
              إضافة وحدة بديلة
            </Button>
          ) : null
        }
      >
        <DataTable
          columns={columns}
          data={
            conversionsQuery.data === undefined
              ? conversionsQuery.isError
                ? null
                : undefined
              : [...conversions]
          }
          isLoading={conversionsQuery.isLoading}
          isError={conversionsQuery.isError}
          onRetry={() => void conversionsQuery.refetch()}
          errorTitle="تعذّر تحميل تحويلات وحدات المادة"
          errorMessage="تعذّر جلب الوحدات البديلة لهذه المادة. حاول مرة أخرى."
          emptyTitle="لا توجد وحدات بديلة"
          emptyDescription={`تستخدم المادة حاليًا وحدة الأساس ${material.baseUnitSymbol} فقط.`}
          emptyAction={
            canManage ? <Button onClick={openCreate}>إضافة وحدة بديلة</Button> : undefined
          }
        />
        <ReferenceLimitNote
          loadedCount={unitsQuery.data?.items.length}
          totalCount={unitsQuery.data?.totalItems}
          hint="تُختار الوحدة البديلة من أول مئة وحدة قياس فقط."
        />
      </ContentCard>
      <MaterialUnitConversionFormDialog
        open={dialogConversion !== undefined}
        material={material}
        conversion={dialogConversion ?? null}
        activeUnitIds={activeUnitIds}
        units={unitsQuery.data?.items ?? []}
        isUnitsLoading={unitsQuery.isLoading}
        isUnitsError={unitsQuery.isError}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={removalTarget !== null}
        onOpenChange={(open) => !open && setRemovalTarget(null)}
        title="إزالة وحدة بديلة"
        message={
          removalTarget === null
            ? ''
            : `سيُحذف عامل التحويل الخاص بـ ${unitLabel(removalTarget.fromUnitId)} نهائياً، ولن تُحتسب هذه الوحدة في حركات المادة بعد الإزالة. لا يمكن استرجاع التحويل.`
        }
        confirmLabel="إزالة التحويل"
        variant="destructive"
        busy={removeMutation.isPending}
        onConfirm={() => void confirmRemoval()}
      />
    </>
  )
}
