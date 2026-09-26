import { IconEdit } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { WarehouseMaterialSettingsEditor } from '@/modules/warehouse/components/warehouse-material-settings-editor'
import { useWarehouseMaterialSettingsQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'
import type {
  ListWarehouseMaterialSettingsQuery,
  WarehouseMaterialSetting,
} from '@/modules/warehouse/types/warehouse.api-types'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { ContentCard } from '@/shared/layout/content-card'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Button } from '@/shared/ui/button'
import { pageRows } from '@/shared/utils/table-data'

const settingColumnHelper = createColumnHelper<typeof dataTableFeatures, WarehouseMaterialSetting>()

export interface WarehouseMaterialSettingsOverviewProps {
  warehouseId: string
}

export function WarehouseMaterialSettingsOverview({
  warehouseId,
}: WarehouseMaterialSettingsOverviewProps) {
  const { has } = usePermission()
  const canManage = has('warehouses:manage')
  const pagination = useServerPagination()
  const { page: currentPage, pageSize, setPage, setPageSize } = pagination
  const [search, setSearch] = useState('')
  const [editorSetting, setEditorSetting] = useState<WarehouseMaterialSetting | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  const settingsQueryInput = useMemo<ListWarehouseMaterialSettingsQuery>(
    () => ({
      page: currentPage,
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
  const closeEditor = useCallback((open: boolean) => {
    if (!open) setEditorSetting(null)
  }, [])

  const columns = useMemo(
    () =>
      settingColumnHelper.columns([
        settingColumnHelper.accessor('material.displayName', {
          id: 'material',
          header: 'المادة',
        }),
        settingColumnHelper.accessor((s) => s.material.code ?? '—', {
          id: 'materialCode',
          header: 'الرمز',
          cell: ({ getValue }) => <span dir="ltr">{getValue()}</span>,
        }),
        settingColumnHelper.accessor('minQuantity', {
          id: 'minQuantity',
          header: 'الحد الأدنى',
          cell: ({ getValue }) => <span dir="ltr">{getValue() ?? '—'}</span>,
        }),
        settingColumnHelper.accessor('maxQuantity', {
          id: 'maxQuantity',
          header: 'الحد الأعلى',
          cell: ({ getValue }) => <span dir="ltr">{getValue() ?? '—'}</span>,
        }),
        settingColumnHelper.accessor('status', {
          header: 'الحالة',
          cell: ({ row }) => <StatusBadge entity="record" status={row.original.status} />,
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

  const meta = settingsQuery.data?.meta
  const totalItems = meta?.totalItems ?? 0
  const totalPages =
    meta?.pageSize !== undefined && meta?.pageSize !== 0
      ? Math.max(Math.ceil(totalItems / meta.pageSize), 1)
      : 1

  return (
    <div className="min-w-0">
      <ContentCard
        title="إعدادات المواد"
        description="حدود الحد الأدنى والأعلى لكل مادة في هذا المستودع. تُدار الإضافتات والتعديلات في نافذة منفصلة."
      >
        <DataTableServer
          columns={columns}
          data={pageRows(settingsQuery.data, settingsQuery.isError)}
          isLoading={settingsQuery.isLoading}
          isError={settingsQuery.isError}
          onRetry={() => void settingsQuery.refetch()}
          errorTitle="تعذّر تحميل إعدادات المواد"
          errorMessage="تعذّر جلب إعدادات المواد. حاول مرة أخرى."
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
          totalCount={totalItems}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          searchQuery={search}
          onSearchChange={handleSearchChange}
          searchPlaceholder="ابحث باسم المادة أو كودها..."
        />
      </ContentCard>
      <WarehouseMaterialSettingsEditor
        setting={editorSetting}
        open={isEditorOpen}
        onOpenChange={closeEditor}
      />
    </div>
  )
}
