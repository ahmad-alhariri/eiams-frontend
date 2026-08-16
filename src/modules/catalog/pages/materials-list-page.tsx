import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link, useInRouterContext } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialFormDialog } from '@/modules/catalog/components/material-form-dialog'
import {
  useCreateMaterialMutation,
  useUpdateMaterialMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialFamiliesQuery,
  useMaterialsQuery,
  useUnitsOfMeasureQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toMaterialRequest,
  type MaterialFormValues,
} from '@/modules/catalog/schemas/material.schemas'
import {
  MATERIAL_KIND_LABELS,
  TRACKING_TYPE_LABELS,
} from '@/modules/catalog/constants/catalog-labels'
import type { ListMaterialsQuery } from '@/modules/catalog/types/catalog.types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { Material, MaterialKind, RecordStatus } from '@/shared/types/generated/eiams-v1'

const materialColumnHelper = createColumnHelper<typeof dataTableFeatures, Material>()

function isMaterialKind(value: string | null): value is MaterialKind {
  return value === 'Consumable' || value === 'Durable' || value === 'Asset'
}

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/**
 * Scoped catalog material directory. The v1 API owns all filtering, search,
 * and pagination so this page keeps the current server page only.
 */
function MaterialsListPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [familyId, setFamilyId] = useState<string | undefined>()
  const [materialKind, setMaterialKind] = useState<MaterialKind | undefined>()
  const [status, setStatus] = useState<RecordStatus | undefined>()
  const [dialogMaterial, setDialogMaterial] = useState<Material | null | undefined>(undefined)

  const materialsQueryInput = useMemo<ListMaterialsQuery>(
    () => ({
      // Table controls are one-based; EIAMS v1 list endpoints are zero-based.
      pageIndex: currentPage - 1,
      pageSize,
      ...(search === '' ? {} : { search }),
      ...(familyId === undefined ? {} : { familyId }),
      ...(materialKind === undefined ? {} : { materialKind }),
      ...(status === undefined ? {} : { status }),
    }),
    [currentPage, familyId, materialKind, pageSize, search, status],
  )
  const materialsQuery = useMaterialsQuery(materialsQueryInput)
  const familiesQuery = useMaterialFamiliesQuery()
  const unitsQuery = useUnitsOfMeasureQuery()
  const createMutation = useCreateMaterialMutation()
  const updateMutation = useUpdateMaterialMutation()
  const submitFeedback = useSubmitFeedback()

  const openCreate = useCallback(() => setDialogMaterial(null), [])
  const openEdit = useCallback((material: Material) => setDialogMaterial(material), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogMaterial(undefined)
  }, [])

  const submitMaterial = useCallback(
    async (values: MaterialFormValues) => {
      const material = dialogMaterial ?? null
      await submitFeedback(async () => {
        const request = toMaterialRequest(values, material)
        if (material === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة المادة.' })
        } else {
          await updateMutation.mutateAsync({ materialId: material.materialId, request })
          toast.success({ title: 'تم حفظ تعديلات المادة.' })
        }
        setDialogMaterial(undefined)
      })
    },
    [createMutation, dialogMaterial, submitFeedback, updateMutation],
  )

  const handleSearchChange = useCallback(
    (nextSearch: string) => {
      setPage(1)
      setSearch(nextSearch)
    },
    [setPage],
  )

  const handleFamilyChange = useCallback(
    (value: string | null) => {
      setPage(1)
      setFamilyId(value === null || value === 'all' ? undefined : value)
    },
    [setPage],
  )

  const handleMaterialKindChange = useCallback(
    (value: string | null) => {
      setPage(1)
      setMaterialKind(isMaterialKind(value) ? value : undefined)
    },
    [setPage],
  )

  const handleStatusChange = useCallback(
    (value: string | null) => {
      setPage(1)
      setStatus(isRecordStatus(value) ? value : undefined)
    },
    [setPage],
  )

  const columns = useMemo(
    () =>
      materialColumnHelper.columns([
        materialColumnHelper.accessor('nameAr', {
          id: 'nameAr',
          header: 'اسم الصنف',
          cell: ({ getValue, row }) => (
            <MaterialDetailLink materialId={row.original.materialId}>
              {getValue()}
            </MaterialDetailLink>
          ),
        }),
        materialColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        materialColumnHelper.accessor((material) => material.family.displayName, {
          id: 'family',
          header: 'العائلة',
        }),
        materialColumnHelper.accessor((material) => material.baseUnit.displayName, {
          id: 'baseUnit',
          header: 'وحدة القياس',
        }),
        materialColumnHelper.accessor('materialKind', {
          id: 'materialKind',
          header: 'نوع الصنف',
          cell: ({ getValue }) => MATERIAL_KIND_LABELS[getValue()],
        }),
        materialColumnHelper.accessor('trackingType', {
          id: 'trackingType',
          header: 'التتبع',
          cell: ({ getValue }) => TRACKING_TYPE_LABELS[getValue()],
        }),
        materialColumnHelper.accessor('requiresAssetNumber', {
          id: 'requiresAssetNumber',
          header: 'رقم الأصل',
          cell: ({ getValue }) => (getValue() ? 'مطلوب' : 'غير مطلوب'),
        }),
        materialColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        ...(canManage
          ? [
              materialColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`تعديل ${row.original.nameAr}`}
                    onClick={() => openEdit(row.original)}
                  >
                    <IconEdit aria-hidden />
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canManage, openEdit],
  )

  const page = materialsQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="الأصناف"
        subtitle="دليل الأصناف المركزي ضمن نطاق العمل الحالي، للبحث والتصفية والاطلاع على بيانات التتبع المعتمدة."
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
            <FilterSelect
              label="العائلة"
              triggerLabel="تصفية حسب العائلة"
              value={familyId ?? 'all'}
              onValueChange={handleFamilyChange}
            >
              <SelectItem value="all">كل العائلات</SelectItem>
              {familiesQuery.data?.map((family) => (
                <SelectItem key={family.familyId} value={family.familyId}>
                  {family.nameAr}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              label="النوع"
              triggerLabel="تصفية حسب نوع الصنف"
              value={materialKind ?? 'all'}
              onValueChange={handleMaterialKindChange}
            >
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="Consumable">مستهلكة</SelectItem>
              <SelectItem value="Durable">عهدة تشغيلية</SelectItem>
              <SelectItem value="Asset">أصل ثابت</SelectItem>
            </FilterSelect>
            <FilterSelect
              label="الحالة"
              triggerLabel="تصفية حسب حالة الصنف"
              value={status ?? 'all'}
              onValueChange={handleStatusChange}
            >
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="Active">نشط</SelectItem>
              <SelectItem value="Inactive">غير نشط</SelectItem>
            </FilterSelect>
            {canManage ? (
              <Button type="button" onClick={openCreate}>
                <IconPlus aria-hidden data-icon="inline-start" />
                إضافة مادة
              </Button>
            ) : null}
          </div>
        }
      />

      <ContentCard
        title="قائمة الأصناف"
        description="ابحث بالاسم أو الرمز، وطبّق مرشحات العائلة أو النوع أو الحالة. تُنفذ جميع النتائج والترقيم في الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, materialsQuery.isError)}
          isLoading={materialsQuery.isLoading}
          isError={materialsQuery.isError}
          onRetry={() => void materialsQuery.refetch()}
          errorTitle="تعذّر تحميل الأصناف"
          errorMessage="تعذّر جلب قائمة الأصناف. حاول مرة أخرى."
          emptyTitle="لا توجد أصناف"
          emptyDescription="لم يتم العثور على أصناف تطابق معايير البحث الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث بالاسم أو الرمز..."
        />
      </ContentCard>
      <MaterialFormDialog
        open={dialogMaterial !== undefined}
        material={dialogMaterial ?? null}
        families={familiesQuery.data ?? []}
        units={unitsQuery.data ?? []}
        isReferencesLoading={familiesQuery.isLoading || unitsQuery.isLoading}
        isReferencesError={familiesQuery.isError || unitsQuery.isError}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitMaterial}
      />
    </div>
  )
}

function MaterialDetailLink({
  children,
  materialId,
}: {
  children: React.ReactNode
  materialId: string
}) {
  const inRouter = useInRouterContext()
  const path = ROUTE_PATHS.catalogMaterialDetail.replace(':materialId', materialId)
  const className =
    'font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  if (inRouter) {
    return (
      <Link to={path} className={className}>
        {children}
      </Link>
    )
  }

  return (
    <a href={path} className={className}>
      {children}
    </a>
  )
}

function FilterSelect({
  children,
  label,
  onValueChange,
  triggerLabel,
  value,
}: {
  children: React.ReactNode
  label: string
  onValueChange: (value: string | null) => void
  triggerLabel: string
  value: string
}) {
  return (
    <div className="flex min-w-36 flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger aria-label={triggerLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  )
}

export default MaterialsListPage
