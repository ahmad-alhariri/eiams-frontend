import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialUnitConversionFormDialog } from '@/modules/catalog/components/material-unit-conversion-form-dialog'
import {
  useCreateMaterialUnitConversionMutation,
  useUpdateMaterialUnitConversionMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialUnitConversionsQuery,
  useUnitsOfMeasureQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toMaterialUnitConversionRequest,
  type MaterialUnitConversionFormValues,
} from '@/modules/catalog/schemas/material-unit-conversion.schemas'
import type { Material, MaterialUnitConversion } from '@/modules/catalog/types/catalog.types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { toast } from '@/shared/ui/toast-manager'

const conversionColumnHelper = createColumnHelper<
  typeof dataTableFeatures,
  MaterialUnitConversion
>()

/**
 * Manages alternative units for one material only. Factors always resolve
 * directly to the material's server-owned base unit; this is not a global UoM
 * conversion table.
 */
export function MaterialUnitConversions({ material }: { material: Material }) {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const conversionsQuery = useMaterialUnitConversionsQuery(material.materialId)
  const unitsQuery = useUnitsOfMeasureQuery()
  const createMutation = useCreateMaterialUnitConversionMutation()
  const updateMutation = useUpdateMaterialUnitConversionMutation()
  const [dialogConversion, setDialogConversion] = useState<
    MaterialUnitConversion | null | undefined
  >(undefined)

  const conversions = conversionsQuery.data?.items ?? []

  const activeUnitIds = useMemo<ReadonlySet<string>>(
    () =>
      new Set(
        conversions
          .filter((conversion) => conversion.status === 'Active')
          .map((conversion) => conversion.unit.id),
      ),
    [conversions],
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
          await createMutation.mutateAsync({
            materialId: material.materialId,
            request: toMaterialUnitConversionRequest(values, material.unitId, null),
          })
          toast.success({ title: 'تمت إضافة وحدة بديلة للمادة.' })
        } else {
          await updateMutation.mutateAsync({
            materialId: material.materialId,
            conversionId: conversion.materialUnitConversionId,
            request: toMaterialUnitConversionRequest(values, material.unitId, conversion),
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
    [createMutation, dialogConversion, material.materialId, material.unitId, updateMutation],
  )

  const columns = useMemo(
    () =>
      conversionColumnHelper.columns([
        conversionColumnHelper.accessor((conversion) => conversion.unit.displayName, {
          id: 'unit',
          header: 'الوحدة البديلة',
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">{getValue()}</span>
          ),
        }),
        conversionColumnHelper.accessor('conversionFactor', {
          id: 'conversionFactor',
          header: `عامل التحويل إلى ${material.unit.displayName}`,
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        conversionColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        ...(canManage
          ? [
              conversionColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`تعديل التحويل ${row.original.unit.displayName}`}
                    onClick={() => openEdit(row.original)}
                  >
                    <IconEdit aria-hidden />
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canManage, material.unit.displayName, openEdit],
  )

  return (
    <>
      <ContentCard
        title="الوحدات البديلة والتحويل"
        description={`كل وحدة بديلة تتحول مباشرةً إلى وحدة أساس المادة (${material.unit.displayName}) بعامل خاص بهذه المادة، ولا يوجد عامل عام لوحدة القياس.`}
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
          emptyDescription={`تستخدم المادة حاليًا وحدة الأساس ${material.unit.displayName} فقط.`}
          emptyAction={
            canManage ? <Button onClick={openCreate}>إضافة وحدة بديلة</Button> : undefined
          }
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
    </>
  )
}
