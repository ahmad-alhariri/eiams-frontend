import { IconShieldCheck } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link, generatePath } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { RolePermissionDialog } from '@/modules/admin/components/role-permission-dialog'
import { usePermissionsQuery, useRolesQuery } from '@/modules/admin/hooks/use-admin-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { listRows } from '@/shared/utils/table-data'
import type { Permission, Role } from '@/shared/types/generated/eiams-v1'

const roleColumnHelper = createColumnHelper<typeof dataTableFeatures, Role>()
const permissionColumnHelper = createColumnHelper<typeof dataTableFeatures, Permission>()

const permissionColumns = permissionColumnHelper.columns([
  permissionColumnHelper.accessor('nameAr', {
    id: 'nameAr',
    header: 'اسم الصلاحية',
    cell: (info) => <span className="font-semibold text-foreground">{info.getValue()}</span>,
  }),
  permissionColumnHelper.accessor('code', { id: 'code', header: 'الرمز' }),
  permissionColumnHelper.accessor('descriptionAr', {
    id: 'descriptionAr',
    header: 'الوصف',
    cell: (info) => info.getValue() ?? '—',
  }),
])

/**
 * Enterprise-scoped role and permission catalog. Reading stays available to
 * every scoped viewer; permission assignment is an `admin.role.manage` action
 * delegated to the role permission matrix dialog.
 */
function RolesCatalogPage() {
  const rolesQuery = useRolesQuery()
  const permissionsQuery = usePermissionsQuery()
  const { has } = usePermission()
  const canManage = has('admin.role.manage')
  const [dialogRole, setDialogRole] = useState<Role | null>(null)

  const openMatrix = useCallback((role: Role) => setDialogRole(role), [])
  const closeMatrix = useCallback((open: boolean) => {
    if (!open) setDialogRole(null)
  }, [])

  const roleColumns = useMemo(
    () =>
      roleColumnHelper.columns([
        roleColumnHelper.accessor('nameAr', {
          id: 'nameAr',
          header: 'اسم الدور',
          cell: (info) => (
            <Link
              to={generatePath(ROUTE_PATHS.adminRoleDetail, { roleId: info.row.original.roleId })}
              className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              {info.getValue()}
            </Link>
          ),
        }),
        roleColumnHelper.accessor('code', { id: 'code', header: 'الرمز' }),
        roleColumnHelper.accessor('permissionCodes', {
          id: 'permissionCount',
          header: 'الصلاحيات',
          cell: (info) => `${info.getValue().length} صلاحية`,
        }),
        roleColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: (info) => <StatusBadge entity="record" status={info.getValue()} />,
        }),
        ...(canManage
          ? [
              roleColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`تعديل صلاحيات ${row.original.nameAr}`}
                    onClick={() => openMatrix(row.original)}
                  >
                    <IconShieldCheck aria-hidden data-icon="inline-start" />
                    تعديل الصلاحيات
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canManage, openMatrix],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="الأدوار والصلاحيات"
        subtitle="دليل مرجعي للأدوار وصلاحيات النظام المتاحة ضمن نطاق العمل الحالي."
      />

      <ContentCard
        title="الأدوار"
        description="تعرض القائمة حالة كل دور وعدد الصلاحيات المسندة إليه."
      >
        <DataTable
          columns={roleColumns}
          data={listRows(rolesQuery.data, rolesQuery.isError)}
          isLoading={rolesQuery.isLoading}
          isError={rolesQuery.isError}
          onRetry={() => void rolesQuery.refetch()}
          errorTitle="تعذّر تحميل الأدوار"
          errorMessage="تعذّر جلب قائمة الأدوار. حاول مرة أخرى."
          emptyTitle="لا توجد أدوار"
          emptyDescription="لا توجد أدوار متاحة ضمن نطاق العمل الحالي."
        />
      </ContentCard>

      <ContentCard
        title="كتالوج الصلاحيات"
        description="الصلاحيات مرجعية ويحدد الخادم فعاليتها حسب نطاق العمل المحدد."
      >
        <DataTable
          columns={permissionColumns}
          data={listRows(permissionsQuery.data, permissionsQuery.isError)}
          isLoading={permissionsQuery.isLoading}
          isError={permissionsQuery.isError}
          onRetry={() => void permissionsQuery.refetch()}
          errorTitle="تعذّر تحميل الصلاحيات"
          errorMessage="تعذّر جلب كتالوج الصلاحيات. حاول مرة أخرى."
          emptyTitle="لا توجد صلاحيات"
          emptyDescription="لا توجد صلاحيات متاحة ضمن نطاق العمل الحالي."
        />
      </ContentCard>

      <RolePermissionDialog
        role={dialogRole}
        open={dialogRole !== null}
        onOpenChange={closeMatrix}
      />
    </div>
  )
}

export default RolesCatalogPage
