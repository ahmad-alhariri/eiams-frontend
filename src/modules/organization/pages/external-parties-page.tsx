import { IconEdit, IconPlus, IconUserOff } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import {
  useCreateExternalPartyMutation,
  useDeactivateExternalPartyMutation,
  useUpdateExternalPartyMutation,
} from '@/modules/organization/hooks/use-external-party-mutations'
import { useExternalPartiesQuery } from '@/modules/organization/hooks/use-organization-queries'
import { ExternalPartyFormDialog } from '@/modules/organization/components/external-party-form-dialog'
import {
  toExternalPartyRequest,
  type ExternalPartyFormValues,
} from '@/modules/organization/schemas/external-party.schemas'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'
import type { ExternalParty } from '@/shared/types/generated/eiams-v1'

const columnHelper = createColumnHelper<typeof dataTableFeatures, ExternalParty>()

function ExternalPartiesPage() {
  const { has } = usePermission()
  const canManage = has('organization.manage')
  const pagination = useServerPagination()
  const [search, setSearch] = useState('')
  const [dialogParty, setDialogParty] = useState<ExternalParty | null | undefined>(undefined)
  const [deactivationTarget, setDeactivationTarget] = useState<ExternalParty | null>(null)

  const partiesQuery = useExternalPartiesQuery({
    // Table controls are 1-based; EIAMS v1 list endpoints are 0-based.
    pageIndex: pagination.page - 1,
    pageSize: pagination.pageSize,
    ...(search === '' ? {} : { search }),
  })
  const createMutation = useCreateExternalPartyMutation()
  const updateMutation = useUpdateExternalPartyMutation()
  const deactivateMutation = useDeactivateExternalPartyMutation()
  const submitFeedback = useSubmitFeedback()

  const openCreate = useCallback(() => setDialogParty(null), [])
  const openEdit = useCallback((party: ExternalParty) => setDialogParty(party), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogParty(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: ExternalPartyFormValues) => {
      const party = dialogParty ?? null
      await submitFeedback(async () => {
        const request = toExternalPartyRequest(values, party)
        if (party === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة الجهة الخارجية.' })
        } else {
          await updateMutation.mutateAsync({ externalPartyId: party.externalPartyId, request })
          toast.success({ title: 'تم حفظ تعديلات الجهة الخارجية.' })
        }
        setDialogParty(undefined)
      })
    },
    [createMutation, dialogParty, submitFeedback, updateMutation],
  )

  const confirmDeactivation = useCallback(async () => {
    if (deactivationTarget === null) return
    await submitFeedback(async () => {
      await deactivateMutation.mutateAsync(deactivationTarget.externalPartyId)
      toast.success({ title: 'تم تعطيل الجهة الخارجية مع الاحتفاظ بالمراجع السابقة.' })
      setDeactivationTarget(null)
    })
  }, [deactivateMutation, deactivationTarget, submitFeedback])

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
        columnHelper.display({
          id: 'actions',
          header: 'إجراءات',
          cell: ({ row }) =>
            canManage && row.original.status === 'Active' ? (
              <div className="flex items-center gap-1">
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
                  onClick={() => setDeactivationTarget(row.original)}
                >
                  <IconUserOff aria-hidden />
                </Button>
              </div>
            ) : null,
        }),
      ]),
    [canManage, openEdit],
  )

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
          totalCount={partiesQuery.data?.meta.totalItems}
          totalPages={partiesQuery.data?.meta.totalPages ?? 1}
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
        open={deactivationTarget !== null}
        onOpenChange={(open) => !open && setDeactivationTarget(null)}
        title="تعطيل جهة خارجية"
        message="سيبقى اسم الجهة ظاهراً في السندات والعهد السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة."
        confirmLabel="تعطيل الجهة"
        variant="destructive"
        busy={deactivateMutation.isPending}
        onConfirm={() => void confirmDeactivation()}
      />
    </div>
  )
}

export default ExternalPartiesPage
