import { createColumnHelper, type RowSelectionState } from '@tanstack/react-table'
import { useState } from 'react'

import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'
import { DataTable, dataTableFeatures, type DataTableSortState } from '@/shared/ui/data-table'
import { formatDate } from '@/shared/utils/format'

type WarehouseRow = {
  id: number
  name: string
  location: string
  category: 'stocks' | 'assets'
  lastUpdated: string
  status: 'active' | 'closed'
}

const warehouseRows: WarehouseRow[] = [
  {
    id: 1,
    name: 'المستودع المركزي',
    location: 'دمشق',
    category: 'stocks',
    lastUpdated: '2026-08-10',
    status: 'active',
  },
  {
    id: 2,
    name: 'مستودع الأصول',
    location: 'حلب',
    category: 'assets',
    lastUpdated: '2026-08-08',
    status: 'active',
  },
  {
    id: 3,
    name: 'مستودع المواد الاستهلاكية',
    location: 'حمص',
    category: 'stocks',
    lastUpdated: '2026-07-30',
    status: 'closed',
  },
  {
    id: 4,
    name: 'مستودع الآليات',
    location: 'دمشق',
    category: 'assets',
    lastUpdated: '2026-08-09',
    status: 'active',
  },
  {
    id: 5,
    name: 'مستودع التجهيزات المكتبية',
    location: 'درعا',
    category: 'stocks',
    lastUpdated: '2026-07-22',
    status: 'closed',
  },
  {
    id: 6,
    name: 'مستودع قطع التبديل',
    location: 'طرطوس',
    category: 'assets',
    lastUpdated: '2026-08-05',
    status: 'active',
  },
  {
    id: 7,
    name: 'مستودع الأغذية',
    location: 'اللاذقية',
    category: 'stocks',
    lastUpdated: '2026-08-11',
    status: 'active',
  },
  {
    id: 8,
    name: 'المستودع الجمركي',
    location: 'دمشق',
    category: 'assets',
    lastUpdated: '2026-06-18',
    status: 'closed',
  },
]

const helper = createColumnHelper<typeof dataTableFeatures, WarehouseRow>()

const columns = helper.columns([
  helper.accessor('name', {
    id: 'name',
    header: 'الاسم',
    cell: (info) => <span className="font-medium text-charcoal">{String(info.getValue())}</span>,
  }),
  helper.accessor('location', { id: 'location', header: 'الموقع', enableSorting: false }),
  helper.accessor('category', {
    id: 'category',
    header: 'النوع',
    enableSorting: false,
    cell: (info) =>
      info.getValue() === 'assets' ? (
        <Badge variant="outline">أصول</Badge>
      ) : (
        <Badge variant="outline">مخزون عام</Badge>
      ),
  }),
  helper.accessor('lastUpdated', {
    id: 'lastUpdated',
    header: 'آخر تحديث',
    enableSorting: false,
    cell: (info) => formatDate(String(info.getValue())),
  }),
  helper.accessor('status', {
    id: 'status',
    header: 'الحالة',
    enableSorting: false,
    cell: (info) =>
      info.getValue() === 'active' ? (
        <Badge variant="success">نشط</Badge>
      ) : (
        <Badge variant="critical">مغلق</Badge>
      ),
  }),
])

export function DataTableDemo() {
  const [showEmpty, setShowEmpty] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [showError, setShowError] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sortState, setSortState] = useState<DataTableSortState | null>(null)
  const [lastClicked, setLastClicked] = useState<string>('—')

  const selectedCount = Object.keys(rowSelection).length

  return (
    <div dir="rtl" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={showEmpty ? 'default' : 'outline'}
          onClick={() => setShowEmpty((current) => !current)}
        >
          {showEmpty ? 'إظهار البيانات' : 'إظهار الحالة الفارغة'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={showLoading ? 'default' : 'outline'}
          onClick={() => setShowLoading((current) => !current)}
        >
          {showLoading ? 'إيقاف التحميل' : 'عرض التحميل'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={showError ? 'default' : 'outline'}
          onClick={() => setShowError(true)}
        >
          عرض الخطأ
        </Button>
        <span className="ms-auto text-sm text-muted-foreground">
          الصفوف المحددة: {selectedCount} — آخر صف تم النقر عليه: {lastClicked}
        </span>
      </div>
      <DataTable
        columns={columns}
        data={showEmpty ? [] : warehouseRows}
        isLoading={showLoading}
        isError={showError}
        onRetry={() => setShowError(false)}
        emptyTitle="لا توجد مستودعات"
        emptyDescription="لم يتم العثور على أي مستودع مطابق للبحث."
        emptyAction={<Button onClick={() => setShowEmpty(false)}>إظهار المستودعات</Button>}
        selection={{
          rowSelection,
          onRowSelectionChange: setRowSelection,
          getRowId: (row) => `warehouse-${row.id}`,
        }}
        sort={{ sortState, onSortChange: setSortState }}
        onRowClick={(row) => setLastClicked(row.name)}
      />
    </div>
  )
}
