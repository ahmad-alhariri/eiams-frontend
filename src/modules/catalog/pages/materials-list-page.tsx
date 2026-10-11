import { IconArchive, IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link, useInRouterContext } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialFormDialog } from '@/modules/catalog/components/material-form-dialog'
import { MaterialStatusBadge } from '@/modules/catalog/components/material-status-badge'
import {
  useCreateMaterialMutation,
  useSetMaterialStatusMutation,
  useMaterialUpdateWithConflict,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialFamiliesQuery,
  useMaterialsQuery,
  useUnitsOfMeasureQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  MATERIAL_KIND_LABELS,
  MATERIAL_KIND_OPTIONS,
  TRACKING_TYPE_LABELS,
} from '@/modules/catalog/constants/catalog-labels'
import {
  toCreateMaterialRequest,
  toUpdateMaterialRequest,
  type MaterialFormValues,
} from '@/modules/catalog/schemas/material.schemas'
import type {
  ListMaterialsQuery,
  Material,
  MaterialKind,
  MaterialStatus,
} from '@/modules/catalog/types/catalog.types'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'

const materialColumnHelper = createColumnHelper<typeof dataTableFeatures, Material>()

function isMaterialKind(value: string | null): value is MaterialKind {
  return value === 'Consumable' || value === 'Durable' || value === 'Asset'
}

function isMaterialStatus(value: string | null): value is MaterialStatus {
  return value === 'Active' || value === 'Inactive' || value === 'Archived'
}

/**
 * Scoped catalog material directory.
 *
 * `familyId` and `status` are the two filters `GET /catalog/materials` actually
 * binds (alongside `materialDomainId` and pagination), so both are sent to the
 * server. There is NO server-side `search` and NO server-side `materialKind`
 * filter on that route, so those two controls filter the loaded page
 * client-side — and the copy says so instead of implying the server did it.
 */
function MaterialsListPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [familyId, setFamilyId] = useState<string | undefined>()
  const [materialKind, setMaterialKind] = useState<MaterialKind | undefined>()
  const [status, setStatus] = useState<MaterialStatus | undefined>()
  const [dialogMaterial, setDialogMaterial] = useState<Material | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<Material | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<Material | null>(null)

  const materialsQueryInput = useMemo<ListMaterialsQuery>(
    () => ({
      // Table controls are one-based AND so is the wire: the page crosses the
      // boundary unchanged. The `- 1` that used to live here put `page=0` on the
      // wire, which the backend answers with 400 REQUEST_VALIDATION_FAILED.
      page: currentPage,
      pageSize,
      ...(familyId === undefined ? {} : { familyId }),
      ...(status === undefined ? {} : { status }),
    }),
    [currentPage, familyId, pageSize, status],
  )
  const materialsQuery = useMaterialsQuery(materialsQueryInput)
  // Reference lists are read whole: the page size is the backend's maximum, so a
  // filter dropdown or the create form is not silently truncated at row 20.
  const familiesQuery = useMaterialFamiliesQuery({ pageSize: 100 })
  const unitsQuery = useUnitsOfMeasureQuery({ pageSize: 100 })
  const createMutation = useCreateMaterialMutation()
  const statusMutation = useSetMaterialStatusMutation()
  const submitFeedback = useSubmitFeedback()
  /**
   * A material update is the only write in this module that optimistic
   * concurrency can refuse: `expectedCatalogVersion` must be the version the
   * read served, and a stale echo is answered with 409
   * MATERIALS_CATALOG_VERSION_MISMATCH. The hook renders the neutral recovery
   * dialog and makes `submit` return `false` for that case, so the caller must
   * NOT raise its generic success/failure toast on a 409.
   */
  const materialUpdate = useMaterialUpdateWithConflict({
    onRecover: () => materialsQuery.refetch(),
  })

  const openCreate = useCallback(() => setDialogMaterial(null), [])
  const openEdit = useCallback((material: Material) => setDialogMaterial(material), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogMaterial(undefined)
  }, [])

  /**
   * Two bodies, not one "upsert": the create binds `familyId`, `baseUnitId` and
   * `code`; the update deliberately emits NONE of them and sends
   * `expectedCatalogVersion` instead.
   */
  const submitMaterial = useCallback(
    async (values: MaterialFormValues) => {
      const material = dialogMaterial ?? null
      await submitFeedback(async () => {
        if (material === null) {
          await createMutation.mutateAsync(toCreateMaterialRequest(values))
          toast.success({ title: 'تمت إضافة المادة.' })
          setDialogMaterial(undefined)
          return
        }

        const saved = await materialUpdate.submit({
          materialId: material.id,
          request: toUpdateMaterialRequest(values, material),
        })
        // `false` means a 409 is being answered by the recovery dialog; the
        // dialog IS the whole response, so no toast either way.
        if (!saved) return

        toast.success({ title: 'تم حفظ تعديلات المادة.' })
        setDialogMaterial(undefined)
      })
    },
    [createMutation, dialogMaterial, materialUpdate, submitFeedback],
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
      setStatus(isMaterialStatus(value) ? value : undefined)
    },
    [setPage],
  )

  /**
   * Activate/deactivate is one command with the other ordinal; ARCHIVE is a
   * separate, terminal direction that only Active or Inactive materials can
   * take. `Archived` is never a target here — there is no route out of it.
   */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: Exclude<MaterialStatus, 'Archived'> =
      statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await statusMutation.mutateAsync({ materialId: statusTarget.id, status: nextStatus })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل المادة مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط المادة من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget])

  const confirmArchive = useCallback(async () => {
    if (archiveTarget === null) return

    try {
      await statusMutation.mutateAsync({
        materialId: archiveTarget.id,
        status: 'Archived',
      })
    } catch {
      return
    }

    toast.success({ title: 'تمت أرشفة المادة نهائياً.' })
    setArchiveTarget(null)
  }, [archiveTarget, statusMutation])

  const familiesById = useMemo(
    () => new Map((familiesQuery.data?.items ?? []).map((family) => [family.id, family])),
    [familiesQuery.data],
  )
  const normalizedSearch = search.trim().toLocaleLowerCase('ar')
  /**
   * `GET /catalog/materials` binds no free-text filter and no `materialKind`,
   * so both of those controls filter the SERVER page the user is looking at.
   * `familyId` and `status` are the only two filters sent to the server, which
   * is why their selects sit in the toolbar unchanged.
   */
  const rows = useMemo(() => {
    const loaded = materialsQuery.data?.items ?? []
    return loaded.filter(
      (material) =>
        (materialKind === undefined || material.materialKind === materialKind) &&
        (normalizedSearch === '' ||
          [material.nameAr, material.code].some((value) =>
            value.toLocaleLowerCase('ar').includes(normalizedSearch),
          )),
    )
  }, [materialKind, materialsQuery.data, normalizedSearch])

  const columns = useMemo(
    () =>
      materialColumnHelper.columns([
        materialColumnHelper.accessor('nameAr', {
          id: 'nameAr',
          header: 'اسم الصنف',
          cell: ({ getValue, row }) => (
            <MaterialDetailLink materialId={row.original.id}>{getValue()}</MaterialDetailLink>
          ),
        }),
        materialColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        materialColumnHelper.accessor('familyId', {
          id: 'family',
          header: 'العائلة',
          cell: ({ getValue }) => familiesById.get(getValue())?.name ?? '—',
        }),
        materialColumnHelper.accessor('baseUnitSymbol', {
          id: 'unit',
          header: 'وحدة القياس',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        materialColumnHelper.accessor('materialKind', {
          id: 'materialKind',
          header: 'نوع الصنف',
          cell: ({ getValue }) => MATERIAL_KIND_LABELS[getValue()],
        }),
        materialColumnHelper.accessor('trackingType', {
          id: 'trackingType',
          header: 'طريقة التتبع',
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
          cell: ({ getValue }) => <MaterialStatusBadge status={getValue()} />,
        }),
        ...(canManage
          ? [
              materialColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => {
                  const material = row.original
                  const isActive = material.status === 'Active'
                  return (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`تعديل ${material.nameAr}`}
                        onClick={() => openEdit(material)}
                      >
                        <IconEdit aria-hidden />
                      </Button>
                      {/* Archived is terminal server-side, so an archived row
                          offers NO way back out — not even a disabled one. */}
                      {material.status === 'Archived' ? null : (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${isActive ? 'تعطيل' : 'تنشيط'} ${material.nameAr}`}
                            onClick={() => setStatusTarget(material)}
                          >
                            {isActive ? <IconUserOff aria-hidden /> : <IconCheck aria-hidden />}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`أرشفة ${material.nameAr}`}
                            onClick={() => setArchiveTarget(material)}
                          >
                            <IconArchive aria-hidden />
                          </Button>
                        </>
                      )}
                    </div>
                  )
                },
              }),
            ]
          : []),
      ]),
    [canManage, familiesById, openEdit],
  )

  const page = materialsQuery.data
  const totalCount = page?.totalItems
  const totalPages = Math.max(page?.totalPages ?? 1, 1)
  const isStatusTargetActive = statusTarget?.status === 'Active'

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="الأصناف"
        subtitle="دليل الأصناف المركزي ضمن نطاق العمل الحالي، للاطلاع على بيانات التتبع المعتمدة والتصفية بالحالة."
        toolbar={
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-3">
            <FilterSelect
              label="العائلة"
              triggerLabel="تصفية حسب العائلة"
              value={familyId ?? 'all'}
              onValueChange={handleFamilyChange}
            >
              <SelectItem value="all">كل العائلات</SelectItem>
              {(familiesQuery.data?.items ?? []).map((family) => (
                <SelectItem key={family.id} value={family.id}>
                  {family.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              label="النوع"
              triggerLabel="تصفية حسب نوع الصنف ضمن الصفحة المعروضة"
              value={materialKind ?? 'all'}
              onValueChange={handleMaterialKindChange}
            >
              <SelectItem value="all">كل الأنواع</SelectItem>
              {MATERIAL_KIND_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
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
              <SelectItem value="Archived">مؤرشف</SelectItem>
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
        description="التصفية بالعائلة والحالة والتنقل بين الصفحات ينفّذها الخادم، أما البحث والتصفية بالنوع فيُطبّقان على الصفحة المعروضة."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(
            materialsQuery.data === undefined ? undefined : { items: rows },
            materialsQuery.isError,
          )}
          isLoading={materialsQuery.isLoading}
          isError={materialsQuery.isError}
          onRetry={() => void materialsQuery.refetch()}
          errorTitle="تعذّر تحميل الأصناف"
          errorMessage="تعذّر جلب قائمة الأصناف. حاول مرة أخرى."
          emptyTitle="لا توجد أصناف"
          emptyDescription="لم يتم العثور على أصناف تطابق معايير التصفية الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث في الصفحة الحالية بالاسم أو الرمز..."
        />
      </ContentCard>
      <MaterialFormDialog
        open={dialogMaterial !== undefined}
        material={dialogMaterial ?? null}
        families={familiesQuery.data?.items ?? []}
        units={unitsQuery.data?.items ?? []}
        isReferencesLoading={familiesQuery.isLoading || unitsQuery.isLoading}
        isReferencesError={familiesQuery.isError || unitsQuery.isError}
        isPending={createMutation.isPending || materialUpdate.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitMaterial}
      />
      {materialUpdate.dialog}
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل مادة' : 'تنشيط مادة'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم المادة ظاهراً في السندات والسجلات السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'ستصبح المادة متاحة مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل المادة' : 'تنشيط المادة'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="أرشفة مادة"
        message="الأرشفة نهائية ولا يمكن التراجع عنها. لن تعود المادة نشطةً أو قابلة للاختيار في أي سند جديد بعد الأرشفة، وتبقى ظاهرة في السجلات السابقة فقط؛ ولا يعرض النظام أي طريقة للخروج من حالة الأرشيف."
        confirmLabel="أرشفة نهائية"
        variant="destructive"
        busy={statusMutation.isPending}
        onConfirm={() => void confirmArchive()}
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
