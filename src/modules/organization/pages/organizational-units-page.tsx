import { IconPlus, IconSitemap } from '@tabler/icons-react'
import { useCallback, useMemo, useState } from 'react'

import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { OrganizationalUnitFormDialog } from '@/modules/organization/components/organizational-unit-form-dialog'
import {
  countDescendantOrganizationalUnits,
  OrganizationalUnitTree,
} from '@/modules/organization/components/organizational-unit-tree'
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
import { ContentCard } from '@/shared/layout/content-card'
import { OrganizationPageShell } from '@/modules/organization/components/organization-page-shell'
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
  const { activeScope } = useActiveScopeContext()
  const canManage = has('organization.manage')
  // A Warehouse-scoped session sees only the ACTIVE part of the structure. This
  // is a DISPLAY rule derived from the server-owned session scope, not a second
  // authorization decision: the backend still decides what the list contains.
  const isWarehouseScope = activeScope?.scopeType === 'Warehouse'
  const [searchInput, setSearchInput] = useState('')
  const [dialogUnit, setDialogUnit] = useState<OrganizationalUnit | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<OrganizationalUnit | null>(null)
  const search = useDebounce(searchInput)
  const queryInput = useMemo(
    () => ({
      // One-based on both sides; `page: 0` here was a 400 on every load.
      page: 1,
      pageSize: ORGANIZATIONAL_UNIT_TREE_PAGE_SIZE,
      // The backend owns the filter too — frontend filtering is never the sole
      // guard. `status` is a string on this read path (see ListOrganizationalUnitsQuery).
      ...(isWarehouseScope ? { status: 'Active' as const } : {}),
      ...(search === '' ? {} : { search }),
    }),
    [isWarehouseScope, search],
  )
  const unitsQuery = useOrganizationalUnitsQuery(queryInput)
  const createMutation = useCreateOrganizationalUnitMutation()
  const updateMutation = useUpdateOrganizationalUnitMutation()
  const statusMutation = useSetOrganizationalUnitStatusMutation()
  const page = unitsQuery.data
  const visibleUnits = useMemo(
    () => (page?.items ?? []).filter((unit) => !isWarehouseScope || unit.status === 'Active'),
    [isWarehouseScope, page],
  )

  const closeDialog = (open: boolean) => {
    if (!open) setDialogUnit(undefined)
  }

  /**
   * Activation is the SAME route as deactivation with the other ordinal, so the
   * one command serves both directions and the copy is chosen from the status the
   * row actually carries. There is no delete in this module: suspending a unit is
   * the only removal mechanism it has, and reactivating is the way back.
   *
   * The mutation hook reports a rejected write as ONE Arabic toast, so this page
   * deliberately does NOT wrap it in `useSubmitFeedback` (that would double the
   * toast). The confirm dialog stays open on failure because the row is unchanged.
   */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus: RecordStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    try {
      await statusMutation.mutateAsync({
        orgUnitId: statusTarget.id,
        status: nextStatus,
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
  }, [statusMutation, statusTarget])

  const isStatusTargetActive = statusTarget?.status === 'Active'
  // The warning is computed from the same forest the tree renders, so it cannot
  // disagree with the rows the operator can see. Reactivation needs no count.
  const descendantCount = useMemo(
    () =>
      statusTarget === null || statusTarget.status !== 'Active'
        ? 0
        : countDescendantOrganizationalUnits(page?.items ?? [], statusTarget),
    [page, statusTarget],
  )

  const submitForm = useCallback(
    async (values: OrganizationalUnitFormValues) => {
      const unit = dialogUnit ?? null
      // The mutations report failures themselves; the rejection is left to
      // propagate so the form dialog can still map server field errors inline.
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
    },
    [createMutation, dialogUnit, updateMutation],
  )

  return (
    <OrganizationPageShell
      titleAr="الوحدات التنظيمية"
      subtitle="استعرض التسلسل الإداري للوحدات ضمن نطاق العمل الحالي."
      actions={
        canManage ? (
          <Button type="button" onClick={() => setDialogUnit(null)}>
            <IconPlus aria-hidden data-icon="inline-start" />
            إضافة وحدة تنظيمية
          </Button>
        ) : undefined
      }
    >
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

        {isWarehouseScope ? (
          <p
            role="note"
            className="mt-3 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground"
          >
            في نطاق المستودع تُعرض الوحدات النشطة فقط. الخادم هو المرجع النهائي لحالة الوحدة وصلاحية
            الاطلاع عليها.
          </p>
        ) : null}

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

        {!unitsQuery.isLoading &&
        !unitsQuery.isError &&
        page !== undefined &&
        visibleUnits.length === 0 ? (
          <EmptyState
            icon={<IconSitemap className="size-12" />}
            title="لا توجد وحدات تنظيمية"
            description={
              search === ''
                ? isWarehouseScope
                  ? 'لا توجد وحدات تنظيمية نشطة ضمن نطاق المستودع.'
                  : 'لا توجد وحدات تنظيمية ضمن نطاق العمل الحالي.'
                : 'لم يتم العثور على وحدات تطابق عبارة البحث.'
            }
          />
        ) : null}

        {!unitsQuery.isLoading &&
        !unitsQuery.isError &&
        page !== undefined &&
        visibleUnits.length > 0 ? (
          <>
            <OrganizationalUnitTree
              units={visibleUnits}
              {...(canManage ? { onEdit: (unit: OrganizationalUnit) => setDialogUnit(unit) } : {})}
              {...(canManage
                ? { onToggleStatus: (unit: OrganizationalUnit) => setStatusTarget(unit) }
                : {})}
            />
            <ReferenceLimitNote
              loadedCount={visibleUnits.length}
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
            ? `سيتم تعطيل هذه الوحدة وجميع الوحدات التابعة لها تلقائياً (عدد الوحدات التابعة: ${descendantCount}). سيبقى اسم الوحدة ظاهراً في الموظفين والمستودعات المرتبطة، لكنها لن تكون متاحة للاختيار في العمليات الجديدة.`
            : 'سيصبح اسم الوحدة متاحاً مرة أخرى للاختيار في العمليات الجديدة. إذا تعذّر التنشيط، فتأكد من أن الوحدة الأم نشطة وأن رمز الوحدة لا يتعارض مع وحدة نشطة أخرى.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل الوحدة' : 'تنشيط الوحدة'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
    </OrganizationPageShell>
  )
}

export default OrganizationalUnitsPage
