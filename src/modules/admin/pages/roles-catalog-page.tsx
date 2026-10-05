import { IconShieldCheck } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'
import { Link, generatePath } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { RolePermissionDialog } from '@/modules/admin/components/role-permission-dialog'
import { usePermissionsQuery, useRolesQuery } from '@/modules/admin/hooks/use-admin-queries'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { listRows } from '@/shared/utils/table-data'
import type { PermissionCatalogEntry, RoleProjection } from '@/modules/admin/types/role.types'

const roleColumnHelper = createColumnHelper<typeof dataTableFeatures, RoleProjection>()
const permissionColumnHelper = createColumnHelper<
  typeof dataTableFeatures,
  PermissionCatalogEntry
>()

const SCOPE_TYPE_LABELS_AR: Readonly<Record<string, string>> = {
  Enterprise: 'مستوى المؤسسة',
  Site: 'موقع',
  Warehouse: 'مستودع',
}

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
  const [dialogRole, setDialogRole] = useState<RoleProjection | null>(null)

  const openMatrix = useCallback((role: RoleProjection) => setDialogRole(role), [])
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
              to={generatePath(ROUTE_PATHS.adminRoleDetail, { roleId: info.row.original.id })}
              className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
            >
              {info.getValue()}
            </Link>
          ),
        }),
        roleColumnHelper.accessor('name', {
          id: 'name',
          header: 'الرمز',
          cell: (info) => <span dir="ltr">{info.getValue()}</span>,
        }),
        roleColumnHelper.accessor('permissionCodes', {
          id: 'permissionCount',
          header: 'الصلاحيات',
          cell: (info) => `${info.getValue().length} صلاحية`,
        }),
        // The role projection carries no status field; the server has no role
        // status concept. Assignment scope is what actually constrains a role,
        // so that is what the table reports.
        roleColumnHelper.accessor('allowedScopeTypes', {
          id: 'allowedScopeTypes',
          header: 'نطاقات الإسناد',
          cell: (info) =>
            info.getValue().length === 0
              ? '—'
              : info
                  .getValue()
                  .map((scopeType) => SCOPE_TYPE_LABELS_AR[scopeType] ?? scopeType)
                  .join('، '),
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
