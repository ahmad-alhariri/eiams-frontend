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
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { Input } from '@/shared/ui/input'
import { toast } from '@/shared/ui/toast-manager'
import { listRows } from '@/shared/utils/table-data'
import type { MaterialFamily, RecordStatus } from '@/modules/catalog/types/catalog.types'

const familyColumnHelper = createColumnHelper<typeof dataTableFeatures, MaterialFamily>()

/** Contract-backed material family directory, with domains derived by the server. */
function MaterialFamiliesPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const [searchInput, setSearchInput] = useState('')
  const [dialogFamily, setDialogFamily] = useState<MaterialFamily | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<MaterialFamily | null>(null)
  const search = searchInput.trim().toLocaleLowerCase('ar')
  const familiesQuery = useMaterialFamiliesQuery()
  const categoriesQuery = useMaterialCategoriesQuery()
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
   * so the search box filters the loaded reference list client-side instead of
   * pretending the server did it.
   */
  const families = useMemo(() => {
    const all = familiesQuery.data?.items ?? []
    if (search === '') return all
    return all.filter((family) =>
      [family.name, family.code].some((value) => value.toLocaleLowerCase('ar').includes(search)),
    )
  }, [familiesQuery.data, search])

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
        const apiError = normalizeApiError(error)
        toast.error({
          title: apiError.titleAr,
          ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
        })
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
  // `undefined` keeps the table's loading skeleton while the reference list is
  // in flight; a loaded list is filtered client-side before it reaches it.
  const familyRows = familiesQuery.data === undefined ? undefined : families

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
        description="يعرض الدليل العائلة وتصنيفها كما يعيدها خادم النظام، والبحث يصفّي القائمة المعروضة."
      >
        <div className="mb-5 max-w-80">
          <label
            htmlFor="material-family-search"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            البحث في العائلات
          </label>
          <Input
            id="material-family-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.currentTarget.value)}
            placeholder="ابحث بالاسم أو الرمز..."
          />
        </div>
        <DataTable
          columns={columns}
          data={listRows(familyRows, familiesQuery.isError)}
          isLoading={familiesQuery.isLoading}
          isError={familiesQuery.isError}
          onRetry={() => void familiesQuery.refetch()}
          errorTitle="تعذّر تحميل عائلات المواد"
          errorMessage="تعذّر جلب قائمة عائلات المواد. حاول مرة أخرى."
          emptyTitle="لا توجد عائلات مواد"
          emptyDescription={
            search === ''
              ? 'أضف أول عائلة مادة بعد إعداد التصنيفات.'
              : 'لم يتم العثور على عائلات تطابق عبارة البحث.'
          }
          emptyAction={canManage ? <Button onClick={openCreate}>إضافة عائلة</Button> : undefined}
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
