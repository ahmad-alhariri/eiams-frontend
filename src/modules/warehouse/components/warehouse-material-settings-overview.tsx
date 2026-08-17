import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { WarehouseMaterialSettingsEditor } from '@/modules/warehouse/components/warehouse-material-settings-editor'
import { useWarehouseMaterialSettingsQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'
import type { ListWarehouseMaterialSettingsQuery } from '@/modules/warehouse/types/warehouse.types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Button } from '@/shared/ui/button'
import { pageRows } from '@/shared/utils/table-data'
import type { WarehouseMaterialSetting } from '@/shared/types/generated/eiams-v1'

const settingColumnHelper = createColumnHelper<typeof dataTableFeatures, WarehouseMaterialSetting>()

export interface WarehouseMaterialSettingsOverviewProps {
  warehouseId: string
}

/**
 * Server-paginated view of one warehouse's material settings, with a
 * create/edit dialog gated by the `warehouse.manage` permission.
 */
export function WarehouseMaterialSettingsOverview({
  warehouseId,
}: WarehouseMaterialSettingsOverviewProps) {
  const { has } = usePermission()
  const canManage = has('warehouse.manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [editorSetting, setEditorSetting] = useState<WarehouseMaterialSetting | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const settingsQueryInput = useMemo<ListWarehouseMaterialSettingsQuery>(
    () => ({
      // DataTable controls are 1-based; EIAMS v1 list endpoints are 0-based.
      pageIndex: currentPage - 1,
      pageSize,
      ...(search === '' ? {} : { search }),
    }),
    [currentPage, pageSize, search],
  )
  const settingsQuery = useWarehouseMaterialSettingsQuery(warehouseId, settingsQueryInput)

  const handleSearchChange = useCallback(
    (nextSearch: string) => {
      setPage(1)
      setSearch(nextSearch)
    },
    [setPage],
  )

  const openCreate = useCallback(() => {
    setEditorSetting(null)
    setIsEditorOpen(true)
  }, [])

  const openEdit = useCallback((setting: WarehouseMaterialSetting) => {
    setEditorSetting(setting)
    setIsEditorOpen(true)
  }, [])

  const columns = useMemo(
    () =>
      settingColumnHelper.columns([
        settingColumnHelper.accessor('material', {
          id: 'material',
          header: 'المادة',
          cell: ({ getValue }) => (
            <div className="flex items-center gap-2">
              <span className="font-medium">{getValue().displayName}</span>
              <span dir="ltr" className="text-xs text-muted-foreground">
                {getValue().code}
              </span>
            </div>
          ),
        }),
        settingColumnHelper.accessor('minQuantity', {
          id: 'minQuantity',
          header: 'الحد الأدنى',
          cell: ({ getValue }) =>
            getValue() === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span dir="ltr">{getValue()}</span>
            ),
        }),
        settingColumnHelper.accessor('maxQuantity', {
          id: 'maxQuantity',
          header: 'الحد الأعلى',
          cell: ({ getValue }) =>
            getValue() === null ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span dir="ltr">{getValue()}</span>
            ),
        }),
        settingColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="record" status={getValue()} />,
        }),
        ...(canManage
          ? [
              settingColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`تعديل إعداد ${row.original.material.displayName}`}
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

  const page = settingsQuery.data

  return (
    <>
      <ContentCard
        title="إعدادات المواد"
        description="حدود الأدنى والأعلى لكل مادة في هذا المستودع، مع إمكانية البحث والترقيم الخادمي."
      >
        <div className="flex flex-col gap-4">
          {canManage ? (
            <div className="flex justify-end">
              <Button type="button" onClick={openCreate}>
                <IconPlus aria-hidden data-icon="inline-start" />
                إضافة إعداد
              </Button>
            </div>
          ) : null}
          <DataTableServer
            columns={columns}
            data={pageRows(page, settingsQuery.isError)}
            isLoading={settingsQuery.isLoading}
            isError={settingsQuery.isError}
            onRetry={() => void settingsQuery.refetch()}
            errorTitle="تعذّر تحميل إعدادات المواد"
            errorMessage="تعذّر جلب قائمة إعدادات المواد. حاول مرة أخرى."
            emptyTitle="لا توجد إعدادات مواد"
            emptyDescription="لم يتم العثور على إعدادات مواد تطابق معايير البحث الحالية."
            emptyAction={
              canManage ? (
                <Button type="button" onClick={openCreate}>
                  إضافة إعداد
                </Button>
              ) : undefined
            }
            page={currentPage}
            pageSize={pageSize}
            totalCount={page?.meta.totalItems}
            totalPages={Math.max(page?.meta.totalPages ?? 1, 1)}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            searchQuery={search}
            onSearchChange={handleSearchChange}
            searchPlaceholder="ابحث باسم المادة أو كودها..."
          />
        </div>
      </ContentCard>
      <WarehouseMaterialSettingsEditor
        warehouseId={warehouseId}
        settings={page?.items ?? []}
        setting={editorSetting}
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
      />
    </>
  )
}

export default WarehouseMaterialSettingsOverview
