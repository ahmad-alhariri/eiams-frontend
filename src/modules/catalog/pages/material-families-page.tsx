import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialFamilyFormDialog } from '@/modules/catalog/components/material-family-form-dialog'
import {
  useCreateMaterialFamilyMutation,
  useUpdateMaterialFamilyMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialCategoriesQuery,
  useMaterialFamiliesQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toMaterialFamilyRequest,
  type MaterialFamilyFormValues,
} from '@/modules/catalog/schemas/material-family.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useDebounce } from '@/shared/hooks/use-debounce'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { Input } from '@/shared/ui/input'
import { toast } from '@/shared/ui/toast-manager'
import { listRows } from '@/shared/utils/table-data'
import type { MaterialFamily } from '@/shared/types/generated/eiams-v1'

const familyColumnHelper = createColumnHelper<typeof dataTableFeatures, MaterialFamily>()

/** Contract-backed material family directory, with domains derived by the server. */
function MaterialFamiliesPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const [searchInput, setSearchInput] = useState('')
  const [dialogFamily, setDialogFamily] = useState<MaterialFamily | null | undefined>(undefined)
  const search = useDebounce(searchInput)
  const familiesQuery = useMaterialFamiliesQuery(search === '' ? {} : { search })
  const categoriesQuery = useMaterialCategoriesQuery()
  const createMutation = useCreateMaterialFamilyMutation()
  const updateMutation = useUpdateMaterialFamilyMutation()

  const openCreate = useCallback(() => setDialogFamily(null), [])
  const openEdit = useCallback((family: MaterialFamily) => setDialogFamily(family), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogFamily(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: MaterialFamilyFormValues) => {
      const family = dialogFamily ?? null
      try {
        const request = toMaterialFamilyRequest(values, family)
        if (family === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة عائلة المادة.' })
        } else {
          await updateMutation.mutateAsync({ familyId: family.familyId, request })
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

  const columns = useMemo(
    () =>
      familyColumnHelper.columns([
        familyColumnHelper.accessor('nameAr', {
          id: 'nameAr',
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
        familyColumnHelper.accessor((family) => family.domain.displayName, {
          id: 'domain',
          header: 'المجال',
        }),
        familyColumnHelper.accessor((family) => family.category.displayName, {
          id: 'category',
          header: 'التصنيف',
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
        description="يعرض الدليل العائلة وتصنيفها ومجالها كما يعيدها خادم النظام."
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
          data={listRows(familiesQuery.data, familiesQuery.isError)}
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
        categories={categoriesQuery.data ?? []}
        isCategoriesLoading={categoriesQuery.isLoading}
        isCategoriesError={categoriesQuery.isError}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default MaterialFamiliesPage
