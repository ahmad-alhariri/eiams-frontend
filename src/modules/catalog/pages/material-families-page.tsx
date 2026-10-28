import { reportApiError } from '@/shared/services/api-error'
import { IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialFamilyFormDialog } from '@/modules/catalog/components/material-family-form-dialog'
import {
  useCreateMaterialFamilyMutation,
  useSetMaterialFamilyStatusMutation,
  useUpdateMaterialFamilyMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialCategoriesQuery,
  useMaterialFamiliesQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toCreateMaterialFamilyRequest,
  toUpdateMaterialFamilyRequest,
  type MaterialFamilyFormValues,
} from '@/modules/catalog/schemas/material-family.schemas'
import { MAX_WIRE_PAGE_SIZE } from '@/shared/api/pagination'
import { ReferenceLimitNote } from '@/shared/feedback/reference-limit-note'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { ListMaterialFamiliesQuery } from '@/modules/catalog/types/catalog.api-types'
import type { MaterialFamily, RecordStatus } from '@/modules/catalog/types/catalog.types'

const familyColumnHelper = createColumnHelper<typeof dataTableFeatures, MaterialFamily>()

/**
 * The category list behind the directory's `التصنيف` column is a REFERENCE
 * join, not a paged screen: it is loaded at the backend's maximum page size so a
 * family outside the first 20 categories renders its real name instead of `—`,
 * and `ReferenceLimitNote` says so when even that page is not the whole set.
 */
const CATEGORY_REFERENCE_PAGE = { page: 1, pageSize: MAX_WIRE_PAGE_SIZE } as const

/**
 * Contract-backed material family directory, with domains derived by the server.
 *
 * Pagination and search, deliberately unlike `/catalog/materials`: the family
 * list binds `categoryId` and `status` and NOTHING else — no free-text filter —
 * so the search box narrows the rows the server just returned and its label and
 * placeholder say "الصفحة الحالية". Server-side pagination and page-local
 * search are the same split the materials directory documents, applied to the
 * filter the route actually binds.
 */
function MaterialFamiliesPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const { page: currentPage, pageSize, setPage, setPageSize } = useServerPagination()
  const [searchInput, setSearchInput] = useState('')
  const [dialogFamily, setDialogFamily] = useState<MaterialFamily | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<MaterialFamily | null>(null)
  const search = searchInput.trim().toLocaleLowerCase('ar')
  const familiesQueryInput = useMemo<ListMaterialFamiliesQuery>(
    () => ({ page: currentPage, pageSize }),
    [currentPage, pageSize],
  )
  const familiesQuery = useMaterialFamiliesQuery(familiesQueryInput)
  const categoriesQuery = useMaterialCategoriesQuery(CATEGORY_REFERENCE_PAGE)
  const createMutation = useCreateMaterialFamilyMutation()
  const updateMutation = useUpdateMaterialFamilyMutation()
  const statusMutation = useSetMaterialFamilyStatusMutation()

  /**
   * The family carries a flat `categoryId` — no nested category reference — so
   * the directory's category column is a join against the category list.
   */
  const categoriesById = useMemo(
    () => new Map((categoriesQuery.data?.items ?? []).map((category) => [category.id, category])),
    [categoriesQuery.data],
  )
  /**
   * `GET /catalog/families` binds `categoryId` and `status` — NO free-text
   * filter. The old `search` parameter was fiction the server silently ignored,
   * so the search box narrows the rows the server just returned instead of
   * pretending the server did it: the scope is the CURRENT PAGE, which is why
   * changing the query also returns to the first page (a match can only ever be
   * found on page 1 while the user is looking at page 3).
   */
  const families = useMemo(() => {
    const all = familiesQuery.data?.items ?? []
    if (search === '') return all
    return all.filter((family) =>
      [family.name, family.code].some((value) => value.toLocaleLowerCase('ar').includes(search)),
    )
  }, [familiesQuery.data, search])

  const handleSearchChange = useCallback(
    (nextSearch: string) => {
      setPage(1)
      setSearchInput(nextSearch)
    },
    [setPage],
  )

  const openCreate = useCallback(() => setDialogFamily(null), [])
  const openEdit = useCallback((family: MaterialFamily) => setDialogFamily(family), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogFamily(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: MaterialFamilyFormValues) => {
      const family = dialogFamily ?? null
      try {
        if (family === null) {
          // Create binds `categoryId`; the update route binds `name`/`code`
          // only, so re-categorising a family is not expressible and the
          // mapper drops the field rather than sending it.
          await createMutation.mutateAsync(toCreateMaterialFamilyRequest(values))
          toast.success({ title: 'تمت إضافة عائلة المادة.' })
        } else {
          await updateMutation.mutateAsync({
            familyId: family.id,
            request: toUpdateMaterialFamilyRequest(values),
          })
          toast.success({ title: 'تم حفظ تعديلات عائلة المادة.' })
        }
        setDialogFamily(undefined)
      } catch (error: unknown) {
        reportApiError(error)
        throw error
      }
    },
    [createMutation, dialogFamily, updateMutation],
  )

  /** One command, two directions; the ordinal is derived by the hook. */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: RecordStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await statusMutation.mutateAsync({ familyId: statusTarget.id, status: nextStatus })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل العائلة مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط العائلة من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget])

  const columns = useMemo(
    () =>
      familyColumnHelper.columns([
        familyColumnHelper.accessor('name', {
          id: 'name',
          header: 'اسم العائلة',
          cell: ({ getValue }) => (
            <span className="font-semibold text-foreground">{getValue()}</span>
          ),
        }),
        familyColumnHelper.accessor('code', {
          id: 'code',
          header: 'الرمز',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        familyColumnHelper.accessor('categoryId', {
          id: 'category',
          header: 'التصنيف',
          cell: ({ getValue }) => categoriesById.get(getValue())?.name ?? '—',
        }),
        familyColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        ...(canManage
          ? [
              familyColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => {
                  const isActive = row.original.status === 'Active'
                  return (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`تعديل ${row.original.name}`}
                        onClick={() => openEdit(row.original)}
                      >
                        <IconEdit aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`${isActive ? 'تعطيل' : 'تنشيط'} ${row.original.name}`}
                        onClick={() => setStatusTarget(row.original)}
                      >
                        {isActive ? <IconUserOff aria-hidden /> : <IconCheck aria-hidden />}
                      </Button>
                    </div>
                  )
                },
              }),
            ]
          : []),
      ]),
    [canManage, categoriesById, openEdit],
  )

  const isStatusTargetActive = statusTarget?.status === 'Active'
  const familiesPage = familiesQuery.data
  const totalCount = familiesPage?.totalItems
  const totalPages = Math.max(familiesPage?.totalPages ?? 1, 1)
  // `undefined` keeps the table's loading skeleton while the reference list is
  // in flight; a loaded page is filtered client-side before it reaches it.
  const familyRows = familiesPage === undefined ? undefined : families
  const categoriesReference = categoriesQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="عائلات المواد"
        subtitle="العائلات تربط المواد بتصنيفاتها المعتمدة ضمن نطاق العمل الحالي."
        toolbar={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <IconPlus aria-hidden data-icon="inline-start" />
              إضافة عائلة
            </Button>
          ) : undefined
        }
      />
      <ContentCard
        title="دليل عائلات المواد"
        description="يعرض الدليل العائلة وتصنيفها كما يعيدها خادم النظام، وينفّذ الخادم التنقل بين الصفحات، بينما يبقى البحث محلياً ويشمل الصفحة المعروضة فقط."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(
            familiesPage === undefined ? undefined : { items: familyRows ?? [] },
            familiesQuery.isError,
          )}
          isLoading={familiesQuery.isLoading}
          isError={familiesQuery.isError}
          onRetry={() => void familiesQuery.refetch()}
          errorTitle="تعذّر تحميل عائلات المواد"
          errorMessage="تعذّر جلب قائمة عائلات المواد. حاول مرة أخرى."
          emptyTitle="لا توجد عائلات مواد"
          emptyDescription={
            search === ''
              ? 'أضف أول عائلة مادة بعد إعداد التصنيفات.'
              : 'لم يتم العثور على عائلات تطابق عبارة البحث ضمن هذه الصفحة.'
          }
          emptyAction={canManage ? <Button onClick={openCreate}>إضافة عائلة</Button> : undefined}
          page={currentPage}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={searchInput}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث في الصفحة الحالية بالاسم أو الرمز..."
        />
        <ReferenceLimitNote
          loadedCount={categoriesReference?.items.length}
          totalCount={categoriesReference?.totalItems}
          hint="تُعرض أسماء التصنيفات من أول مئة تصنيف فقط."
        />
      </ContentCard>
      <MaterialFamilyFormDialog
        open={dialogFamily !== undefined}
        family={dialogFamily ?? null}
        categories={categoriesQuery.data?.items ?? []}
        isCategoriesLoading={categoriesQuery.isLoading}
        isCategoriesError={categoriesQuery.isError}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل عائلة مادة' : 'تنشيط عائلة مادة'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم العائلة ظاهراً في المواد والسجلات السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'سيصبح اسم العائلة متاحاً مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل العائلة' : 'تنشيط العائلة'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  )
}

export default MaterialFamiliesPage
