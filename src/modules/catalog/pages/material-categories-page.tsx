import { IconFolders, IconPlus } from '@tabler/icons-react'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialCategoryFormDialog } from '@/modules/catalog/components/material-category-form-dialog'
import { MaterialCategoryTree } from '@/modules/catalog/components/material-category-tree'
import { filterMaterialCategories } from '@/modules/catalog/components/material-category-tree.model'
import {
  useCreateMaterialCategoryMutation,
  useUpdateMaterialCategoryMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialCategoriesQuery,
  useMaterialDomainsQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toMaterialCategoryRequest,
  type MaterialCategoryFormValues,
} from '@/modules/catalog/schemas/material-category.schemas'
import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { useDebounce } from '@/shared/hooks/use-debounce'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { toast } from '@/shared/ui/toast-manager'
import type { MaterialCategory } from '@/shared/types/generated/eiams-v1'

/** Contract-backed hierarchy with guarded create/edit actions for catalog managers. */
function MaterialCategoriesPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const [searchInput, setSearchInput] = useState('')
  const [dialogCategory, setDialogCategory] = useState<MaterialCategory | null | undefined>(
    undefined,
  )
  const search = useDebounce(searchInput)
  const categoriesQuery = useMaterialCategoriesQuery()
  const domainsQuery = useMaterialDomainsQuery()
  const createMutation = useCreateMaterialCategoryMutation()
  const updateMutation = useUpdateMaterialCategoryMutation()
  const categories = useMemo(
    () => filterMaterialCategories(categoriesQuery.data ?? [], search),
    [categoriesQuery.data, search],
  )

  const openCreate = useCallback(() => setDialogCategory(null), [])
  const openEdit = useCallback((category: MaterialCategory) => setDialogCategory(category), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogCategory(undefined)
  }, [])
  const submitForm = useCallback(
    async (values: MaterialCategoryFormValues) => {
      const category = dialogCategory ?? null
      try {
        const request = toMaterialCategoryRequest(values, category)
        if (category === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة تصنيف المادة.' })
        } else {
          await updateMutation.mutateAsync({ categoryId: category.categoryId, request })
          toast.success({ title: 'تم حفظ تعديلات تصنيف المادة.' })
        }
        setDialogCategory(undefined)
      } catch (error: unknown) {
        const apiError = normalizeApiError(error)
        toast.error({
          title: apiError.titleAr,
          ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
        })
        throw error
      }
    },
    [createMutation, dialogCategory, updateMutation],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="تصنيفات المواد"
        subtitle="استعرض التسلسل الهرمي للتصنيفات ضمن مجال كل مادة في نطاق العمل الحالي."
        toolbar={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <IconPlus aria-hidden data-icon="inline-start" />
              إضافة تصنيف
            </Button>
          ) : undefined
        }
      />

      <ContentCard
        title="شجرة تصنيفات المواد"
        description="تُستمد علاقة الأب والابن من قائمة التصنيفات المعتمدة في النظام."
      >
        <div className="max-w-80">
          <label
            htmlFor="material-category-tree-search"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            البحث في التصنيفات
          </label>
          <Input
            id="material-category-tree-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.currentTarget.value)}
            placeholder="ابحث بالاسم أو الرمز..."
          />
        </div>

        {categoriesQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center">
            <LoadingSpinner label="جارٍ تحميل شجرة تصنيفات المواد..." />
          </div>
        ) : null}

        {categoriesQuery.isError ? (
          <ErrorState
            title="تعذّر تحميل تصنيفات المواد"
            description="تعذّر جلب شجرة التصنيفات. حاول مرة أخرى."
            action={
              <Button type="button" onClick={() => void categoriesQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : null}

        {!categoriesQuery.isLoading && !categoriesQuery.isError && categories.length === 0 ? (
          <EmptyState
            icon={<IconFolders className="size-12" />}
            title={search === '' ? 'لا توجد تصنيفات مواد' : 'لا توجد تصنيفات مطابقة'}
            description={
              search === ''
                ? 'لا توجد تصنيفات مواد ضمن نطاق العمل الحالي.'
                : 'لم يتم العثور على تصنيفات تطابق عبارة البحث.'
            }
            action={
              canManage && search === '' ? (
                <Button onClick={openCreate}>إضافة تصنيف</Button>
              ) : undefined
            }
          />
        ) : null}

        {!categoriesQuery.isLoading && !categoriesQuery.isError && categories.length > 0 ? (
          <MaterialCategoryTree
            categories={categories}
            {...(canManage ? { onEdit: openEdit } : {})}
          />
        ) : null}
      </ContentCard>
      <MaterialCategoryFormDialog
        open={dialogCategory !== undefined}
        category={dialogCategory ?? null}
        categories={categoriesQuery.data ?? []}
        domains={domainsQuery.data ?? []}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default MaterialCategoriesPage
