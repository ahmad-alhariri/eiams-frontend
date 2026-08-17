import { IconPlus, IconSitemap } from '@tabler/icons-react'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { OrganizationalUnitFormDialog } from '@/modules/organization/components/organizational-unit-form-dialog'
import { OrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree'
import {
  useCreateOrganizationalUnitMutation,
  useUpdateOrganizationalUnitMutation,
} from '@/modules/organization/hooks/use-organizational-unit-mutations'
import { useOrganizationalUnitsQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  toOrganizationalUnitRequest,
  type OrganizationalUnitFormValues,
} from '@/modules/organization/schemas/organizational-unit.schemas'
import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { useDebounce } from '@/shared/hooks/use-debounce'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { toast } from '@/shared/ui/toast-manager'
import type { OrganizationalUnit } from '@/shared/types/generated/eiams-v1'

const ORGANIZATIONAL_UNIT_TREE_PAGE_SIZE = 200

/**
 * Read-only organizational structure. The v1 contract supplies a paginated
 * flat list with optional parent references, so this page requests its maximum
 * contract page size and derives the visible hierarchy locally.
 */
function OrganizationalUnitsPage() {
  const { has } = usePermission()
  const canManage = has('organization.manage')
  const [searchInput, setSearchInput] = useState('')
  const [dialogUnit, setDialogUnit] = useState<OrganizationalUnit | null | undefined>(undefined)
  const search = useDebounce(searchInput)
  const queryInput = useMemo(
    () => ({
      pageIndex: 0,
      pageSize: ORGANIZATIONAL_UNIT_TREE_PAGE_SIZE,
      ...(search === '' ? {} : { search }),
    }),
    [search],
  )
  const unitsQuery = useOrganizationalUnitsQuery(queryInput)
  const createMutation = useCreateOrganizationalUnitMutation()
  const updateMutation = useUpdateOrganizationalUnitMutation()
  const submitFeedback = useSubmitFeedback()
  const page = unitsQuery.data

  const closeDialog = (open: boolean) => {
    if (!open) setDialogUnit(undefined)
  }

  const submitForm = useCallback(
    async (values: OrganizationalUnitFormValues) => {
      const unit = dialogUnit ?? null
      await submitFeedback(async () => {
        const request = toOrganizationalUnitRequest(values, unit)
        if (unit === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة الوحدة التنظيمية.' })
        } else {
          await updateMutation.mutateAsync({ orgUnitId: unit.orgUnitId, request })
          toast.success({ title: 'تم حفظ تعديلات الوحدة التنظيمية.' })
        }
        setDialogUnit(undefined)
      })
    },
    [createMutation, dialogUnit, submitFeedback, updateMutation],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="الوحدات التنظيمية"
        subtitle="استعرض التسلسل الإداري للوحدات ضمن نطاق العمل الحالي."
        toolbar={
          canManage ? (
            <Button type="button" onClick={() => setDialogUnit(null)}>
              <IconPlus aria-hidden data-icon="inline-start" />
              إضافة وحدة تنظيمية
            </Button>
          ) : undefined
        }
      />

      <ContentCard
        title="الهيكل التنظيمي"
        description="تُعرض الوحدات بحسب العلاقة الإدارية المعتمدة في النظام."
      >
        <div className="max-w-80">
          <label
            htmlFor="org-unit-tree-search"
            className="mb-2 block text-sm font-medium text-foreground"
          >
            البحث في الوحدات
          </label>
          <Input
            id="org-unit-tree-search"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.currentTarget.value)}
            placeholder="ابحث بالاسم أو الرمز..."
          />
        </div>

        {unitsQuery.isLoading ? (
          <div className="flex min-h-64 items-center justify-center">
            <LoadingSpinner label="جارٍ تحميل الهيكل التنظيمي..." />
          </div>
        ) : null}

        {unitsQuery.isError ? (
          <ErrorState
            title="تعذّر تحميل الوحدات التنظيمية"
            description="تعذّر جلب الهيكل التنظيمي. حاول مرة أخرى."
            action={
              <Button type="button" onClick={() => void unitsQuery.refetch()}>
                إعادة المحاولة
              </Button>
            }
          />
        ) : null}

        {!unitsQuery.isLoading && !unitsQuery.isError && page?.items.length === 0 ? (
          <EmptyState
            icon={<IconSitemap className="size-12" />}
            title="لا توجد وحدات تنظيمية"
            description={
              search === ''
                ? 'لا توجد وحدات تنظيمية ضمن نطاق العمل الحالي.'
                : 'لم يتم العثور على وحدات تطابق عبارة البحث.'
            }
          />
        ) : null}

        {!unitsQuery.isLoading &&
        !unitsQuery.isError &&
        page !== undefined &&
        page.items.length > 0 ? (
          <>
            <OrganizationalUnitTree
              units={page.items}
              {...(canManage ? { onEdit: (unit: OrganizationalUnit) => setDialogUnit(unit) } : {})}
            />
            {page.meta.totalPages > 1 ? (
              <p className="text-sm text-muted-foreground" role="status">
                يعرض الهيكل أول {ORGANIZATIONAL_UNIT_TREE_PAGE_SIZE} وحدة. استخدم البحث لتضييق
                النتائج.
              </p>
            ) : null}
          </>
        ) : null}
      </ContentCard>
      <OrganizationalUnitFormDialog
        open={dialogUnit !== undefined}
        unit={dialogUnit ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default OrganizationalUnitsPage
