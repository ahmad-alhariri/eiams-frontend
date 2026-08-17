import { IconArchive, IconEdit, IconPlus } from '@tabler/icons-react'
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
  toMaterialUnitConversionCreateRequest,
  toMaterialUnitConversionUpdateRequest,
  type MaterialUnitConversionFormValues,
} from '@/modules/catalog/schemas/material-unit-conversion.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { toast } from '@/shared/ui/toast-manager'
import type { Material, MaterialUnitConversion } from '@/shared/types/generated/eiams-v1'

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

  const activeFromUnitIds = useMemo(
    () =>
      new Set(
        (conversionsQuery.data ?? [])
          .filter((conversion) => conversion.status === 'Active')
          .map((conversion) => conversion.fromUnit.id),
      ),
    [conversionsQuery.data],
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
            request: toMaterialUnitConversionCreateRequest(values),
          })
          toast.success({ title: 'تمت إضافة وحدة بديلة للمادة.' })
        } else {
          await updateMutation.mutateAsync({
            materialId: material.materialId,
            conversionId: conversion.conversionId,
            request: toMaterialUnitConversionUpdateRequest(values, conversion),
          })
          toast.success({
            title: conversion.usedInPostedDocuments
              ? 'تمت أرشفة التحويل المستخدم.'
              : 'تم حفظ تعديلات التحويل.',
          })
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
    [createMutation, dialogConversion, material.materialId, updateMutation],
  )

  const columns = useMemo(
    () =>
      conversionColumnHelper.columns([
        conversionColumnHelper.accessor((conversion) => conversion.fromUnit.displayName, {
          id: 'fromUnit',
          header: 'الوحدة البديلة',
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">{getValue()}</span>
          ),
        }),
        conversionColumnHelper.accessor('factor', {
          id: 'factor',
          header: `عامل التحويل إلى ${material.baseUnit.displayName}`,
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        conversionColumnHelper.accessor((conversion) => conversion.baseUnit.displayName, {
          id: 'baseUnit',
          header: 'وحدة الأساس',
        }),
        conversionColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        conversionColumnHelper.accessor('usedInPostedDocuments', {
          id: 'historicalUse',
          header: 'استخدام مرحّل',
          cell: ({ getValue }) => (getValue() ? 'نعم — العامل محفوظ' : 'لا'),
        }),
        ...(canManage
          ? [
              conversionColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => {
                  const conversion = row.original
                  if (conversion.status !== 'Active') return '—'
                  const isUsed = conversion.usedInPostedDocuments
                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        isUsed
                          ? `أرشفة تحويل ${conversion.fromUnit.displayName}`
                          : `تعديل تحويل ${conversion.fromUnit.displayName}`
                      }
                      onClick={() => openEdit(conversion)}
                    >
                      {isUsed ? <IconArchive aria-hidden /> : <IconEdit aria-hidden />}
                    </Button>
                  )
                },
              }),
            ]
          : []),
      ]),
    [canManage, material.baseUnit.displayName, openEdit],
  )

  const conversions = conversionsQuery.data
  return (
    <>
      <ContentCard
        title="الوحدات البديلة والتحويل"
        description={`كل وحدة بديلة تتحول مباشرةً إلى وحدة أساس المادة (${material.baseUnit.displayName}) بعامل خاص بهذه المادة، ولا يوجد عامل عام لوحدة القياس.`}
        action={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <IconPlus aria-hidden data-icon="inline-start" />
              إضافة وحدة بديلة
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          data={
            conversions === undefined
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
          emptyDescription={`تستخدم المادة حاليًا وحدة الأساس ${material.baseUnit.displayName} فقط.`}
          emptyAction={
            canManage ? <Button onClick={openCreate}>إضافة وحدة بديلة</Button> : undefined
          }
        />
      </ContentCard>
      <MaterialUnitConversionFormDialog
        open={dialogConversion !== undefined}
        material={material}
        conversion={dialogConversion ?? null}
        activeFromUnitIds={activeFromUnitIds}
        units={unitsQuery.data ?? []}
        isUnitsLoading={unitsQuery.isLoading}
        isUnitsError={unitsQuery.isError}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </>
  )
}
