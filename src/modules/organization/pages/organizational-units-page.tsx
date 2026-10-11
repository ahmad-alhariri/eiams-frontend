import { IconPlus, IconSitemap } from '@tabler/icons-react'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { OrganizationalUnitFormDialog } from '@/modules/organization/components/organizational-unit-form-dialog'
import { OrganizationalUnitTree } from '@/modules/organization/components/organizational-unit-tree'
import {
  useCreateOrganizationalUnitMutation,
  useSetOrganizationalUnitStatusMutation,
  useUpdateOrganizationalUnitMutation,
} from '@/modules/organization/hooks/use-organizational-unit-mutations'
import { useOrganizationalUnitsQuery } from '@/modules/organization/hooks/use-organization-queries'
import {
  toCreateOrganizationalUnitRequest,
  toUpdateOrganizationalUnitRequest,
  type OrganizationalUnitFormValues,
} from '@/modules/organization/schemas/organizational-unit.schemas'
import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ReferenceLimitNote } from '@/shared/feedback/reference-limit-note'
import { MAX_WIRE_PAGE_SIZE } from '@/shared/api/pagination'
import { useDebounce } from '@/shared/hooks/use-debounce'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { Input } from '@/shared/ui/input'
import { toast } from '@/shared/ui/toast-manager'
import type {
  OrganizationalUnit,
  RecordStatus,
} from '@/modules/organization/types/organization.types'

/**
 * Read-only organizational structure. The v1 contract supplies a paginated
 * flat list with optional parent references, so this page requests the maximum
 * page size the backend accepts — `pageSize` is `[Range(1, 100)]`, so the
 * previous constant of 200 could only ever be rejected or silently truncated —
 * and derives the visible hierarchy locally from what comes back. A directory
 * longer than that one page says so, because a truncated tree looks exactly
 * like a small organization.
 */
const ORGANIZATIONAL_UNIT_TREE_PAGE_SIZE = MAX_WIRE_PAGE_SIZE

/**
 * Read-only organizational structure. The v1 contract supplies a paginated
 * flat list with optional parent references, so this page requests its maximum
 * contract page size and derives the visible hierarchy locally.
 *
 * "Read-only" refers to the tree's own shape: the contract cannot re-site or
 * re-parent a unit, so neither is offered. Writes that DO exist — name/type
 * edits and the status command — run through the row actions, gated on
 * `organization.manage`.
 */
function OrganizationalUnitsPage() {
  const { has } = usePermission()
  const canManage = has('organization.manage')
  const [searchInput, setSearchInput] = useState('')
  const [dialogUnit, setDialogUnit] = useState<OrganizationalUnit | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<OrganizationalUnit | null>(null)
  const search = useDebounce(searchInput)
  const queryInput = useMemo(
    () => ({
      // One-based on both sides; `page: 0` here was a 400 on every load.
      page: 1,
      pageSize: ORGANIZATIONAL_UNIT_TREE_PAGE_SIZE,
      ...(search === '' ? {} : { search }),
    }),
    [search],
  )
  const unitsQuery = useOrganizationalUnitsQuery(queryInput)
  const createMutation = useCreateOrganizationalUnitMutation()
  const updateMutation = useUpdateOrganizationalUnitMutation()
  const statusMutation = useSetOrganizationalUnitStatusMutation()
  const submitFeedback = useSubmitFeedback()
  const page = unitsQuery.data

  const closeDialog = (open: boolean) => {
    if (!open) setDialogUnit(undefined)
  }

  /**
   * Activation is the SAME route as deactivation with the other ordinal, so the
   * one command serves both directions and the copy is chosen from the status the
   * row actually carries. There is no delete in this module: suspending a unit is
   * the only removal mechanism it has, and reactivating is the way back.
   *
   * `submitFeedback` is what turns a rejected write into one Arabic toast — the
   * confirm dialog stays open, because nothing about the row is known to have
   * changed.
   */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: RecordStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await submitFeedback(async () => {
        await statusMutation.mutateAsync({
          orgUnitId: statusTarget.id,
          status: nextStatus,
        })
      })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل الوحدة التنظيمية مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط الوحدة التنظيمية من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget, submitFeedback])

  const isStatusTargetActive = statusTarget?.status === 'Active'

  const submitForm = useCallback(
    async (values: OrganizationalUnitFormValues) => {
      const unit = dialogUnit ?? null
      await submitFeedback(async () => {
        if (unit === null) {
          // `createOrganizationalUnit` answers `{ id }`.
          await createMutation.mutateAsync(toCreateOrganizationalUnitRequest(values))
          toast.success({ title: 'تمت إضافة الوحدة التنظيمية.' })
        } else {
          // `updateOrganizationalUnit` answers with an EMPTY body, and its body
          // binds only `name` and `unitType` — the unit cannot be re-sited or
          // re-parented through this API.
          await updateMutation.mutateAsync({
            orgUnitId: unit.id,
            request: toUpdateOrganizationalUnitRequest(values),
          })
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
            placeholder="ابحث بالاسم أو نوع الوحدة..."
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
              {...(canManage
                ? { onToggleStatus: (unit: OrganizationalUnit) => setStatusTarget(unit) }
                : {})}
            />
            <ReferenceLimitNote
              loadedCount={page.items.length}
              totalCount={page.totalItems}
              hint="استخدم البحث لتضييق النتائج."
            />
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
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل وحدة تنظيمية' : 'تنشيط وحدة تنظيمية'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم الوحدة ظاهراً في الموظفين والمستودعات المرتبطة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'سيصبح اسم الوحدة متاحاً مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل الوحدة' : 'تنشيط الوحدة'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </div>
  )
}

export default OrganizationalUnitsPage
