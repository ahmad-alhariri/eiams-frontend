import { createColumnHelper } from '@tanstack/react-table'
import { useEffect, useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { useDebounce } from '@/shared/hooks/use-debounce'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { Badge } from '@/shared/ui/badge'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

type WarehouseRow = {
  id: number
  name: string
  location: string
  category: 'stocks' | 'assets'
  status: 'active' | 'closed'
}

const warehouseRows: WarehouseRow[] = [
  { id: 1, name: 'المستودع المركزي', location: 'دمشق', category: 'stocks', status: 'active' },
  { id: 2, name: 'مستودع حلب الرئيسي', location: 'حلب', category: 'stocks', status: 'active' },
  { id: 3, name: 'مستودع حمص', location: 'حمص', category: 'stocks', status: 'active' },
  { id: 4, name: 'مستودع طرطوس', location: 'طرطوس', category: 'assets', status: 'active' },
  { id: 5, name: 'مستودع اللاذقية', location: 'اللاذقية', category: 'stocks', status: 'closed' },
  { id: 6, name: 'مستودع درعا', location: 'درعا', category: 'assets', status: 'active' },
  { id: 7, name: 'مستودع السويداء', location: 'السويداء', category: 'stocks', status: 'closed' },
  { id: 8, name: 'مستودع دير الزور', location: 'دير الزور', category: 'stocks', status: 'active' },
  { id: 9, name: 'مستودع الرقة', location: 'الرقة', category: 'assets', status: 'closed' },
  { id: 10, name: 'مستودع الحسكة', location: 'الحسكة', category: 'stocks', status: 'active' },
  { id: 11, name: 'مستودع إدلب', location: 'إدلب', category: 'stocks', status: 'closed' },
  { id: 12, name: 'مستودع القنيطرة', location: 'القنيطرة', category: 'assets', status: 'active' },
  { id: 13, name: 'المستودع الصناعي', location: 'دمشق', category: 'assets', status: 'active' },
  { id: 14, name: 'مستودع ريف دمشق', location: 'ريف دمشق', category: 'stocks', status: 'active' },
  { id: 15, name: 'مستودع الزبداني', location: 'ريف دمشق', category: 'stocks', status: 'closed' },
  { id: 16, name: 'مستودع التل', location: 'ريف دمشق', category: 'assets', status: 'active' },
  { id: 17, name: 'مستودع دوما', location: 'ريف دمشق', category: 'stocks', status: 'active' },
  { id: 18, name: 'مستودع عدرا', location: 'ريف دمشق', category: 'assets', status: 'active' },
  { id: 19, name: 'مستودع صحنايا', location: 'ريف دمشق', category: 'stocks', status: 'closed' },
  { id: 20, name: 'مستودع المزة', location: 'دمشق', category: 'stocks', status: 'active' },
  { id: 21, name: 'مستودع برزة', location: 'دمشق', category: 'assets', status: 'closed' },
  {
    id: 22,
    name: 'مستودع عدرا الصناعي',
    location: 'ريف دمشق',
    category: 'stocks',
    status: 'active',
  },
  { id: 23, name: 'مستودع الشهباء', location: 'حلب', category: 'assets', status: 'active' },
  { id: 24, name: 'مستودع حندرات', location: 'حلب', category: 'stocks', status: 'closed' },
  { id: 25, name: 'مستودع منبج', location: 'حلب', category: 'stocks', status: 'active' },
  { id: 26, name: 'مستودع الباب', location: 'حلب', category: 'assets', status: 'active' },
  { id: 27, name: 'مستودع عفرين', location: 'حلب', category: 'stocks', status: 'closed' },
  { id: 28, name: 'مستودع جبلة', location: 'اللاذقية', category: 'stocks', status: 'active' },
  { id: 29, name: 'مستودع مصياف', location: 'حماة', category: 'assets', status: 'closed' },
  { id: 30, name: 'مستودع حماة', location: 'حماة', category: 'stocks', status: 'active' },
  { id: 31, name: 'مستودع السلمية', location: 'حماة', category: 'stocks', status: 'active' },
  { id: 32, name: 'مستودع تدمر', location: 'حمص', category: 'assets', status: 'closed' },
  { id: 33, name: 'مستودع القصير', location: 'حمص', category: 'stocks', status: 'active' },
  { id: 34, name: 'مستودع بانياس', location: 'طرطوس', category: 'stocks', status: 'active' },
  { id: 35, name: 'مستودع صافيتا', location: 'طرطوس', category: 'assets', status: 'closed' },
  { id: 36, name: 'مستودع الميادين', location: 'دير الزور', category: 'stocks', status: 'active' },
  { id: 37, name: 'مستودع البوكمال', location: 'دير الزور', category: 'assets', status: 'closed' },
]

const MOCK_LATENCY_MS = 250

type WarehouseQueryResult = {
  rows: WarehouseRow[]
  totalCount: number
}

/**
 * In-memory stand-in for the real list endpoint: filters by query, then
 * slices the page window, resolving after a simulated network latency.
 */
function queryMockServer(
  query: string,
  page: number,
  pageSize: number,
): Promise<WarehouseQueryResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      const trimmed = query.trim()
      const filtered = trimmed
        ? warehouseRows.filter(
            (row) => row.name.includes(trimmed) || row.location.includes(trimmed),
          )
        : warehouseRows
      const start = (page - 1) * pageSize
      resolve({
        rows: filtered.slice(start, start + pageSize),
        totalCount: filtered.length,
      })
    }, MOCK_LATENCY_MS)
  })
}

type WarehouseQueryKey = {
  query: string
  page: number
  pageSize: number
}

function useMockWarehouseQuery(query: string, page: number, pageSize: number) {
  const [fetchState, setFetchState] = useState<{
    rows: WarehouseRow[] | null
    totalCount: number
    settledFor: WarehouseQueryKey | null
  }>({ rows: null, totalCount: 0, settledFor: null })

  useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(() => {
      void queryMockServer(query, page, pageSize).then((next) => {
        if (!cancelled) {
          setFetchState({
            rows: next.rows,
            totalCount: next.totalCount,
            settledFor: { query, page, pageSize },
          })
        }
      })
    }, MOCK_LATENCY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [query, page, pageSize])

  const key = { query, page, pageSize }
  const settled = fetchState.settledFor
  const isLoading =
    settled === null ||
    settled.query !== key.query ||
    settled.page !== key.page ||
    settled.pageSize !== key.pageSize

  return { rows: fetchState.rows, totalCount: fetchState.totalCount, isLoading }
}

const helper = createColumnHelper<typeof dataTableFeatures, WarehouseRow>()

const columns = helper.columns([
  helper.accessor('name', {
    id: 'name',
    header: 'الاسم',
    cell: (info) => <span className="font-medium text-charcoal">{String(info.getValue())}</span>,
  }),
  helper.accessor('location', { id: 'location', header: 'الموقع' }),
  helper.accessor('category', {
    id: 'category',
    header: 'النوع',
    cell: (info) =>
      info.getValue() === 'assets' ? (
        <Badge variant="outline">أصول</Badge>
      ) : (
        <Badge variant="outline">مخزون عام</Badge>
      ),
  }),
  helper.accessor('status', {
    id: 'status',
    header: 'الحالة',
    cell: (info) =>
      info.getValue() === 'active' ? (
        <Badge variant="success">نشط</Badge>
      ) : (
        <Badge variant="critical">مغلق</Badge>
      ),
  }),
])

function DataTableServerDemo() {
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounce(searchQuery)
  const pagination = useServerPagination()
  const { setPage } = pagination
  const { rows, totalCount, isLoading } = useMockWarehouseQuery(
    debouncedQuery,
    pagination.page,
    pagination.pageSize,
  )

  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, setPage])

  return (
    <div dir="rtl" className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        محاكاة خادم: تأخير ٢٥٠ مللي ثانية مع بحث مؤجّل ٣٠٠ مللي ثانية — جرّب البحث عن «دمشق» أو غيّر
        حجم الصفحة.
      </p>
      <DataTableServer
        columns={columns}
        data={rows}
        isLoading={isLoading}
        page={pagination.page}
        pageSize={pagination.pageSize}
        totalCount={totalCount}
        totalPages={pagination.pageCount(totalCount)}
        onPageChange={pagination.setPage}
        onPageSizeChange={pagination.setPageSize}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="ابحث عن مستودع أو موقع..."
        emptyTitle="لا توجد مستودعات"
        emptyDescription="لم يتم العثور على أي مستودع مطابق للبحث."
      />
    </div>
  )
}

export const dataTableServerGallerySections: GallerySection[] = [
  {
    id: 'data-table-server',
    titleAr: 'جدول الخادم مع أدوات التنقل (DataTableServer)',
    descriptionAr:
      'جدول يعمل مع خادم فعلي: بحث مؤجّل، ترقيم صفحات من الخادم مع تأخير محاكى، ومحدد حجم الصفحة ونص «عرض ١–١٠ من ٣٧» بالأرقام العربية.',
    render: () => <DataTableServerDemo />,
  },
]
