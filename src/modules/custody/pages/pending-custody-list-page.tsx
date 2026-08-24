import { useCallback, useMemo, useState } from 'react'
import { createColumnHelper } from '@tanstack/react-table'
import { Link } from 'react-router'

import { useCustodiesQuery } from '@/modules/custody/hooks/use-custody-queries'
import { AssignCustodyDialog } from '@/modules/custody/components/assign-custody-dialog'
import type { ListCustodiesQuery } from '@/modules/custody/types/custody.types'
import { ROUTE_METADATA, ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import type { AssetCustody } from '@/shared/types/generated/eiams-v1'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { Button } from '@/shared/ui/button'

/**
 * Pending-assignment rows are always Asset-subject custody rows (PRD §12.8);
 * the union's Material/TrackedUnit members never appear in this list.
 */
/**
 * Pending-assignment rows are always Asset-subject custody rows (PRD 12.8);
 * the server only returns those for this filter, and Material/TrackedUnit
 * custody never participates in personal assignment. Field view mirrors the
 * AssetCustody members the pending list renders.
 */
interface PendingCustodyRow {
  readonly assetId: string
  readonly assetNumber: string
  readonly custodyId: string
  readonly custodyKind: 'Operational' | 'Personal'
  readonly fromTs: string
  readonly holder: { readonly displayName: string }
  readonly issueDocumentId: string
  readonly rowVersion: number
  readonly status: 'Active' | 'Closed'
}

function toPendingRows(
  page: Readonly<{ items: readonly unknown[] }> | undefined,
): PendingCustodyRow[] {
  if (page === undefined) return []
  return page.items as PendingCustodyRow[]
}

const columnHelper = createColumnHelper<typeof dataTableFeatures, PendingCustodyRow>()

/**
 * Pending custody list (e19-t02, PRD §12.8 step 1): assets under
 * `Operational` + `Active` custody awaiting personal assignment. Each row
 * opens the assignment dialog (the t03 flow) that creates a Personal custody
 * row for the chosen employee and closes the operational row.
 */
export default function PendingCustodyListPage() {
  const { page, pageSize, setPage, setPageSize } = useServerPagination()
  const [search, setSearch] = useState('')
  const [assigningRow, setAssigningRow] = useState<AssetCustody | null>(null)
  const { has } = usePermission()

  const filters = useMemo<ListCustodiesQuery>(
    () => ({
      pageIndex: page - 1,
      pageSize,
      status: 'Active',
      custodyKind: 'Operational',
      ...(search.trim() === '' ? {} : { search: search.trim() }),
    }),
    [page, pageSize, search],
  )

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(event.target.value)
      setPage(1)
    },
    [setPage],
  )

  const custodiesQuery = useCustodiesQuery(filters)
  const canAssign = has('custody.assign')

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('assetNumber', {
          id: 'assetNumber',
          header: 'رقم الأصل',
          cell: ({ getValue, row }) => (
            <Link
              className="font-mono text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              to={ROUTE_PATHS.assetDetail.replace(':assetId', row.original.assetId)}
            >
              <span dir="ltr">{getValue()}</span>
            </Link>
          ),
        }),
        columnHelper.accessor((row) => row.holder.displayName, {
          id: 'holder',
          header: 'الجهة الحائزة (تشغيلي)',
        }),
        columnHelper.accessor('fromTs', {
          id: 'fromTs',
          header: 'قيد العهدة منذ',
          cell: ({ getValue }) => (
            <span dir="ltr" className="text-sm">
              {getValue()}
            </span>
          ),
        }),
        columnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: ({ getValue }) => <StatusBadge entity="custody" status={getValue()} />,
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          cell: ({ row }) =>
            canAssign ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setAssigningRow(row.original as AssetCustody)}
              >
                تكليف موظف
              </Button>
            ) : null,
        }),
      ]),
    [canAssign],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={ROUTE_METADATA.custodyPending.labelAr}
        subtitle="أصول صُرفت إلى جهة تشغيلية وتنتظر تكلفتها الشخصية لموظف، وفق تدفق ما بعد الصرف (PRD 12.8)."
      />

      <ContentCard
        title="الأصول بانتظار التكليف"
        description="ابحث باسم الجهة الحائزة أو رقم الأصل. التكليف ينشئ سطر حفظ شخصياً ويغلق السطر التشغيلي الحالي."
      >
        <input
          className="mb-3 h-9 w-full max-w-80 rounded-md border border-input bg-background px-3 text-sm"
          placeholder="ابحث عن جهة حائزة أو رقم أصل..."
          aria-label="بحث في قائمة الانتظار"
          value={search}
          onChange={handleSearchChange}
        />
        <DataTableServer
          columns={columns}
          data={toPendingRows(custodiesQuery.data)}
          isLoading={custodiesQuery.isLoading}
          isError={custodiesQuery.isError}
          onRetry={() => void custodiesQuery.refetch()}
          errorTitle="تعذّر تحميل قائمة الانتظار"
          errorMessage="تعذّر جلب الأصول بانتظار التكليف. حاول مرة أخرى."
          emptyTitle="لا توجد أصول بانتظار التكليف"
          emptyDescription="جميع الأصول المصروفة مكلفة شخصياً بالفعل."
          page={page}
          pageSize={pageSize}
          totalCount={custodiesQuery.data?.meta.totalItems}
          totalPages={Math.max(custodiesQuery.data?.meta.totalPages ?? 1, 1)}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </ContentCard>

      {assigningRow !== null ? (
        <AssignCustodyDialog custody={assigningRow} onClose={() => setAssigningRow(null)} />
      ) : null}
    </div>
  )
}
