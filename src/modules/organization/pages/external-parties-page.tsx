import { IconCheck, IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import {
  useCreateExternalPartyMutation,
  useSetExternalPartyStatusMutation,
  useUpdateExternalPartyMutation,
} from '@/modules/organization/hooks/use-external-party-mutations'
import { useExternalPartiesQuery } from '@/modules/organization/hooks/use-organization-queries'
import { ExternalPartyFormDialog } from '@/modules/organization/components/external-party-form-dialog'
import {
  toCreateExternalPartyRequest,
  toUpdateExternalPartyRequest,
  type ExternalPartyFormValues,
} from '@/modules/organization/schemas/external-party.schemas'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { isConflictError } from '@/shared/services/mutation-safety'
import { normalizeApiError } from '@/shared/services/api-error'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { ConflictRecoveryDialog } from '@/shared/ui/conflict-recovery-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { ExternalParty } from '@/modules/organization/types/organization.api-types'

const columnHelper = createColumnHelper<typeof dataTableFeatures, ExternalParty>()

/**
 * Arabic copy for the shared conflict dialog. It names neither outcome: a 409
 * from `EXTERNAL_PARTIES_ROW_VERSION_MISMATCH` carries
 * `{ external_party_id, expected_row_version, current_row_version }` and no
 * statement about whether the write landed, so "لم يتم الحفظ" would be a
 * fabricated fact. The dialog offers exactly the two honest moves — load the
 * server's version, or keep what is on screen.
 */
const CONFLICT_COPY = {
  titleAr: 'تغيّرت البيانات لدى خادم',
  descriptionAr:
    'رفض الخادم العملية لأن هذا السجل تغيّر منذ تحميله. لم يحدّد الخادم ما إذا كانت العملية قد نُفّذت، لذا لا يزعم النظام ذلك أيضاً. يمكنك تحميل النسخة الحالية من الخادم، أو البقاء على ما هو معروض الآن.',
  recoverLabelAr: 'تحميل النسخة الحالية',
  recoveringLabelAr: 'جارٍ التحميل...',
  stayLabelAr: 'البقاء على المعروض',
} as const

/** One Arabic error toast for a non-conflict failure, as `useSubmitFeedback` does. */
function reportApiError(error: unknown): void {
  const apiError = normalizeApiError(error)
  toast.error({
    title: apiError.titleAr,
    ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
  })
}

function ExternalPartiesPage() {
  const { has } = usePermission()
  const canManage = has('organization.manage')
  const pagination = useServerPagination()
  const [search, setSearch] = useState('')
  const [dialogParty, setDialogParty] = useState<ExternalParty | null | undefined>(undefined)
  const [statusTarget, setStatusTarget] = useState<ExternalParty | null>(null)
  const [conflictActive, setConflictActive] = useState(false)
  const [isRecovering, setIsRecovering] = useState(false)

  const partiesQuery = useExternalPartiesQuery({
    // One-based controls, one-based wire: no conversion, and none is needed.
    page: pagination.page,
    pageSize: pagination.pageSize,
    ...(search === '' ? {} : { search }),
  })
  const createMutation = useCreateExternalPartyMutation()
  const updateMutation = useUpdateExternalPartyMutation()
  const statusMutation = useSetExternalPartyStatusMutation()
  const submitFeedback = useSubmitFeedback()

  const openCreate = useCallback(() => setDialogParty(null), [])
  const openEdit = useCallback((party: ExternalParty) => setDialogParty(party), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogParty(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: ExternalPartyFormValues) => {
      const party = dialogParty ?? null
      if (party === null) {
        // Create is unguarded: there is no prior row version to reject against.
        await submitFeedback(async () => {
          await createMutation.mutateAsync(toCreateExternalPartyRequest(values))
          toast.success({ title: 'تمت إضافة الجهة الخارجية.' })
          setDialogParty(undefined)
        })
        return
      }

      try {
        await updateMutation.mutateAsync({
          externalPartyId: party.id,
          request: toUpdateExternalPartyRequest(values, party),
        })
      } catch (error: unknown) {
        // Not routed through `submitFeedback`, because that helper prints the
        // generic 409 guidance ("refresh the page") before the caller can see
        // the error — and a refresh is precisely what discards the row version
        // this dialog is holding. `EXTERNAL_PARTIES_ROW_VERSION_MISMATCH` is
        // the one failure here the screen can act on, so it gets the recovery
        // dialog instead.
        if (isConflictError(error)) {
          setConflictActive(true)
          return
        }
        // Everything else keeps the existing contract: one Arabic toast, then
        // re-thrown so the dialog maps `fieldErrors` onto the fields inline.
        reportApiError(error)
        throw error
      }

      toast.success({ title: 'تم حفظ تعديلات الجهة الخارجية.' })
      setDialogParty(undefined)
    },
    [createMutation, dialogParty, submitFeedback, updateMutation],
  )

  /**
   * One status command, TWO directions.
   *
   * Deactivation and reactivation are the same route with the other ordinal, so
   * the choice comes from the status the row actually carries — which is what
   * keeps an inactive party from becoming a dead end. There is no delete here:
   * deactivation is the only removal mechanism, and reactivation is the way
   * back.
   *
   * `expectedRowVersion` is the version the ROW was read with. A status write
   * bumps it, so the `invalidate` in the hook is load-bearing: without the
   * refetch it triggers, a deactivate-then-reactivate would replay the version
   * the server has already left behind and answer 409.
   */
  const confirmStatusChange = useCallback(async () => {
    if (statusTarget === null) return
    const nextStatus = statusTarget.status === 'Active' ? 'Inactive' : 'Active'

    // The status command carries the same version guard as the update, so it
    // can 409 for the same reason and is handled the same way.
    try {
      await submitFeedback(async () => {
        await statusMutation.mutateAsync({
          externalPartyId: statusTarget.id,
          expectedRowVersion: statusTarget.rowVersion,
          status: nextStatus,
        })
      })
    } catch (error: unknown) {
      if (isConflictError(error)) {
        // Close the confirm first: two stacked modals is one too many, and the
        // conflict dialog supersedes it.
        setStatusTarget(null)
        setConflictActive(true)
        return
      }
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل الجهة الخارجية مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط الجهة الخارجية من جديد.',
    })
    setStatusTarget(null)
  }, [statusMutation, statusTarget, submitFeedback])

  /**
   * Load the server's version and start over from it.
   *
   * Both dialogs close rather than being re-seeded. The row version the server
   * just rejected is the only thing the dialog could have been holding, so
   * leaving the form open would offer a retry that is guaranteed to 409 again.
   * Reopening the edit dialog then reads the refetched row, so the next attempt
   * carries a version the server actually has.
   */
  const recoverFromConflict = useCallback(async () => {
    setIsRecovering(true)
    try {
      // `allSettled`-equivalent semantics through try/finally: a failed refetch
      // must not strand the dialog in a permanent busy state.
      await partiesQuery.refetch()
    } finally {
      setIsRecovering(false)
      setConflictActive(false)
      setDialogParty(undefined)
      setStatusTarget(null)
    }
  }, [partiesQuery])

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('nameAr', { header: 'الجهة الخارجية' }),
        columnHelper.accessor('code', {
          header: 'الرمز',
          cell: ({ getValue }) => getValue() ?? '—',
        }),
        columnHelper.accessor('contactInfo', {
          header: 'معلومات الاتصال',
          cell: ({ getValue }) => getValue() ?? '—',
        }),
        columnHelper.accessor('status', {
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        // The column is OMITTED for a reader, exactly as the sites and
        // organizations screens do. Declaring it unconditionally left a header
        // over an empty cell in every row — a control that says an action exists
        // and never provides one.
        ...(canManage
          ? [
              columnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => {
                  const isActive = row.original.status === 'Active'
                  return (
                    <div className="flex items-center gap-1">
                      {isActive ? (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`تعديل ${row.original.nameAr}`}
                            onClick={() => openEdit(row.original)}
                          >
                            <IconEdit aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`تعطيل ${row.original.nameAr}`}
                            onClick={() => setStatusTarget(row.original)}
                          >
                            <IconUserOff aria-hidden />
                          </Button>
                        </>
                      ) : (
                        // The only action an inactive party needs is the way
                        // back. Rendering nothing here is what stranded a
                        // deactivated record with no route to reactivation.
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`تنشيط ${row.original.nameAr}`}
                          onClick={() => setStatusTarget(row.original)}
                        >
                          <IconCheck aria-hidden />
                        </Button>
                      )}
                    </div>
                  )
                },
              }),
            ]
          : []),
      ]),
    [canManage, openEdit],
  )

  const isStatusTargetActive = statusTarget?.status === 'Active'

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="الجهات الخارجية"
        subtitle="سجل موحّد للجهات المستلمة والحافظة للعهد؛ التعطيل يمنع اختيار الجهة لاحقاً ولا يزيل أي مرجع تاريخي."
        toolbar={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <IconPlus aria-hidden data-icon="inline-start" />
              إضافة جهة خارجية
            </Button>
          ) : undefined
        }
      />
      <ContentCard
        title="قائمة الجهات الخارجية"
        description="ابحث بالاسم أو الرمز، وتنقّل بين صفحات الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(partiesQuery.data, partiesQuery.isError)}
          isLoading={partiesQuery.isLoading}
          isError={partiesQuery.isError}
          onRetry={() => void partiesQuery.refetch()}
          emptyTitle="لا توجد جهات خارجية"
          emptyDescription="لم يتم العثور على جهات تطابق البحث الحالي."
          emptyAction={
            canManage ? (
              <Button type="button" onClick={openCreate}>
                إضافة جهة خارجية
              </Button>
            ) : undefined
          }
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={partiesQuery.data?.totalItems}
          totalPages={partiesQuery.data?.totalPages ?? 1}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
          searchQuery={search}
          onSearchChange={(nextSearch) => {
            pagination.setPage(1)
            setSearch(nextSearch)
          }}
          searchPlaceholder="ابحث بالاسم أو الرمز..."
        />
      </ContentCard>
      <ExternalPartyFormDialog
        open={dialogParty !== undefined}
        party={dialogParty ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
      <ConfirmDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        title={isStatusTargetActive ? 'تعطيل جهة خارجية' : 'تنشيط جهة خارجية'}
        message={
          isStatusTargetActive
            ? 'سيبقى اسم الجهة ظاهراً في السندات والعهد السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'سيصبح اسم الجهة متاحاً مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isStatusTargetActive ? 'تعطيل الجهة' : 'تنشيط الجهة'}
        variant={isStatusTargetActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
      {conflictActive ? (
        <ConflictRecoveryDialog
          descriptionAr={CONFLICT_COPY.descriptionAr}
          isRefreshing={isRecovering}
          onDismiss={() => setConflictActive(false)}
          onRecover={() => void recoverFromConflict()}
          recoveringLabelAr={CONFLICT_COPY.recoveringLabelAr}
          recoverLabelAr={CONFLICT_COPY.recoverLabelAr}
          slot="external-party-conflict-dialog"
          stayLabelAr={CONFLICT_COPY.stayLabelAr}
          titleAr={CONFLICT_COPY.titleAr}
        />
      ) : null}
    </div>
  )
}

export default ExternalPartiesPage
