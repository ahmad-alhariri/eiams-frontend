import { IconBan, IconCircleCheck, IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { UserFormDialog } from '@/modules/admin/components/user-form-dialog'
import {
  useCreateUserMutation,
  useSetUserStatusMutation,
  useUpdateUserMutation,
} from '@/modules/admin/hooks/use-admin-mutations'
import {
  toCreateUserRequest,
  toUpdateUserRequest,
  type UserFormValues,
} from '@/modules/admin/schemas/user.schemas'
import { useRolesQuery, useUsersQuery } from '@/modules/admin/hooks/use-admin-queries'
import type { ListUsersQuery } from '@/modules/admin/types/admin.types'
import { userDisplayName, type UserDirectoryRow } from '@/modules/admin/types/user.types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toast } from '@/shared/ui/toast-manager'
import { pageRows } from '@/shared/utils/table-data'

const userColumnHelper = createColumnHelper<typeof dataTableFeatures, UserDirectoryRow>()

/**
 * Scoped directory of application accounts. The v1 API owns the pagination and
 * text search. Account creation, editing, and status changes are available to
 * users holding `admin.user.manage`; everyone else sees a read-only directory.
 */
function UsersListPage() {
  const { has } = usePermission()
  const canManage = has('admin.user.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [dialogUser, setDialogUser] = useState<UserDirectoryRow | null | undefined>(undefined)

  const usersQueryInput = useMemo<ListUsersQuery>(
    () => ({
      // The backend binds a 1-based `page`. The generated operations map advertised
      // `pageIndex`, which the server does not read: it was silently ignored and
      // every "page 2" request returned page 1.
      page: currentPage,
      pageSize,
      ...(search === '' ? {} : { search }),
    }),
    [currentPage, pageSize, search],
  )
  const usersQuery = useUsersQuery(usersQueryInput)
  const canSelectRoles = canManage && has('admin.role.view')
  const rolesQuery = useRolesQuery(canSelectRoles)
  const createMutation = useCreateUserMutation()
  const updateMutation = useUpdateUserMutation()
  const statusMutation = useSetUserStatusMutation()
  const submitFeedback = useSubmitFeedback()
  const { confirm, element: confirmElement } = useConfirm()

  const handleSearchChange = useCallback(
    (nextSearch: string) => {
      setPage(1)
      setSearch(nextSearch)
    },
    [setPage],
  )

  const openCreate = useCallback(() => setDialogUser(null), [])
  const openEdit = useCallback((user: UserDirectoryRow) => setDialogUser(user), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogUser(undefined)
  }, [])
  const submitForm = useCallback(
    async (values: UserFormValues) => {
      const user = dialogUser ?? null
      await submitFeedback(async () => {
        if (user === null) {
          await createMutation.mutateAsync(toCreateUserRequest(values))
          toast.success({ title: 'تمت إضافة المستخدم.' })
        } else {
          await updateMutation.mutateAsync({
            userId: user.id,
            request: toUpdateUserRequest(values, user.rowVersion),
          })
          toast.success({ title: 'تم حفظ تعديلات المستخدم.' })
        }
        setDialogUser(undefined)
      })
    },
    [createMutation, dialogUser, submitFeedback, updateMutation],
  )

  const handleToggleStatus = useCallback(
    async (user: UserDirectoryRow) => {
      const nextStatus = user.status === 'Active' ? 'Suspended' : 'Active'
      const isSuspending = nextStatus === 'Suspended'
      const name = userDisplayName(user)
      const result = await confirm({
        title: isSuspending ? 'تأكيد إيقاف المستخدم' : 'تأكيد تنشيط المستخدم',
        message: isSuspending
          ? `هل تريد إيقاف حساب "${name}"؟ يفقد المستخدم الوصول حتى إعادة التنشيط.`
          : `هل تريد تنشيط حساب "${name}"؟ يعود المستخدم للوصول حسب صلاحياته المعتمدة.`,
        confirmLabel: isSuspending ? 'إيقاف' : 'تنشيط',
        variant: isSuspending ? 'destructive' : 'confirm',
      })
      if (!result.confirmed) return
      await submitFeedback(async () => {
        // Suspension is its own operation: it carries the security guards and revokes
        // refresh tokens, and it no longer needs fields the caller cannot read.
        await statusMutation.mutateAsync({
          userId: user.id,
          request: { status: nextStatus, expectedRowVersion: user.rowVersion },
        })
        toast.success({ title: isSuspending ? 'تم إيقاف المستخدم.' : 'تم تنشيط المستخدم.' })
      })
    },
    [confirm, statusMutation, submitFeedback],
  )

  const columns = useMemo(
    () =>
      userColumnHelper.columns([
        userColumnHelper.accessor('firstName', {
          id: 'displayName',
          header: 'اسم المستخدم',
          // The backend stores the name as two fields and never composes one, so
          // the table does the same rather than reading a `displayName` that does
          // not exist on the wire.
          cell: ({ row }) => (
            <span className="font-semibold text-foreground">{userDisplayName(row.original)}</span>
          ),
        }),
        userColumnHelper.accessor('email', {
          id: 'email',
          header: 'البريد الإلكتروني',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        userColumnHelper.accessor('roleName', {
          id: 'roleName',
          header: 'الدور',
          // Carried on the directory row only; the single-user read omits it.
          cell: ({ getValue }) => getValue() ?? <span className="text-muted-foreground">—</span>,
        }),
        userColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="user" status={getValue()} />,
        }),
        ...(canManage
          ? [
              userColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => {
                  const user = row.original
                  const name = userDisplayName(user)
                  const isSuspending = user.status === 'Active'
                  return (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`تعديل ${name}`}
                        onClick={() => openEdit(user)}
                      >
                        <IconEdit aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={isSuspending ? `إيقاف ${name}` : `تنشيط ${name}`}
                        onClick={() => void handleToggleStatus(user)}
                      >
                        {isSuspending ? <IconBan aria-hidden /> : <IconCircleCheck aria-hidden />}
                      </Button>
                    </div>
                  )
                },
              }),
            ]
          : []),
      ]),
    [canManage, openEdit, handleToggleStatus],
  )

  const page = usersQuery.data

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="المستخدمون"
        subtitle="دليل حسابات المستخدمين ضمن نطاق العمل الحالي."
        toolbar={
          canManage ? (
            <Button type="button" onClick={openCreate}>
              <IconPlus aria-hidden data-icon="inline-start" />
              مستخدم جديد
            </Button>
          ) : null
        }
      />

      <ContentCard
        title="قائمة المستخدمين"
        description="ابحث باسم المستخدم أو اسم الدخول، ثم تنقّل بين صفحات الخادم."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(page, usersQuery.isError)}
          isLoading={usersQuery.isLoading}
          isError={usersQuery.isError}
          onRetry={() => void usersQuery.refetch()}
          errorTitle="تعذّر تحميل المستخدمين"
          errorMessage="تعذّر جلب قائمة المستخدمين. حاول مرة أخرى."
          emptyTitle="لا يوجد مستخدمون"
          emptyDescription="لم يتم العثور على مستخدمين يطابقون معايير البحث الحالية."
          page={currentPage}
          pageSize={pageSize}
          totalCount={page?.meta.totalItems}
          totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث باسم المستخدم أو اسم الدخول..."
        />
      </ContentCard>

      <UserFormDialog
        user={dialogUser ?? null}
        open={dialogUser !== undefined}
        isPending={createMutation.isPending || updateMutation.isPending || statusMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
        roles={rolesQuery.data ?? []}
      />
      {confirmElement}
    </div>
  )
}

export default UsersListPage
