import { zodResolver } from '@hookform/resolvers/zod'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import {
  CountLineDifferenceField,
  CountLineQuantityField,
  CountLineReasonField,
} from '@/modules/inventory-count/components/count-line-entry-fields'
import { useCountLineDrafts } from '@/modules/inventory-count/components/count-line-drafts'
import { countLinePageStats } from '@/modules/inventory-count/components/count-quantity-workspace.model'
import {
  useCountLinesQuery,
  useUpdateCountLinesMutation,
} from '@/modules/inventory-count/hooks/use-count-queries'
import {
  countDirtyLineIndexes,
  countLineEntrySchema,
  toCountLineEntryFormValues,
  toCountLineUpdateRequest,
  type CountLineEntryFormValues,
} from '@/modules/inventory-count/schemas/count-line-entry.schemas'
import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { Form } from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toast } from '@/shared/ui/toast-manager'
import { toArabicDigits } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'
import type { InventoryCountLine } from '@/shared/types/generated/eiams-v1'

/** Rows requested on first render; the shared bar offers 10/25/50/100. */
const INITIAL_PAGE_SIZE = 25

const countLineColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryCountLine>()

const EMPTY_LINES: readonly InventoryCountLine[] = []

/**
 * Quantity-entry workspace (e20-t06, hbfu).
 *
 * The server owns paging: every count line is reachable through the shared RTL
 * pagination bar, and the draft form is scoped to the page on screen. Because
 * drafts are per page, navigating away from a page with unsaved entry is
 * explicitly guarded by a discard confirmation instead of silently dropping
 * operator work.
 *
 * Saves are batched through `updateInventoryCountLines` and carry only the
 * rows that actually changed and hold a usable counted quantity, so a
 * partially counted page stays savable and resumable. The page is re-seeded
 * from the server after every successful save, and by `values` on navigation,
 * so a row never keeps comparing against a stale baseline.
 */
export function CountQuantityWorkspace({
  countId,
  countRowVersion,
}: {
  countId: string
  countRowVersion: number
}) {
  const { has } = usePermission()
  const canEnter = has('count.enter')
  const pagination = useServerPagination({ initialPageSize: INITIAL_PAGE_SIZE })
  const { page, pageSize, setPage, setPageSize } = pagination

  // DataTableServer controls are 1-based; the count-lines read is 0-based.
  const linesQueryInput = useMemo(() => ({ pageIndex: page - 1, pageSize }), [page, pageSize])
  const linesQuery = useCountLinesQuery(countId, linesQueryInput)
  const serverPage = linesQuery.data
  const items: readonly InventoryCountLine[] = serverPage?.items ?? EMPTY_LINES

  const currentPageValues = useMemo(() => toCountLineEntryFormValues(items), [items])

  const form = useForm<CountLineEntryFormValues>({
    resolver: zodResolver(countLineEntrySchema),
    defaultValues: currentPageValues,
    values: currentPageValues,
  })
  const drafts = useCountLineDrafts(form.control)

  const updateMutation = useUpdateCountLinesMutation(countId)
  const submitFeedback = useSubmitFeedback()
  const { confirm: openConfirm, element: confirmDialog } = useConfirm()

  const dirtyCount = useMemo(() => countDirtyLineIndexes(items, drafts).length, [drafts, items])
  const pageStats = useMemo(() => countLinePageStats(items, drafts), [drafts, items])
  const isEditorDisabled = !canEnter || updateMutation.isPending

  /**
   * hbfu: a page's drafts are scoped to that page, so leaving it with unsaved
   * entry is an explicit decision, never an implicit discard.
   */
  const navigateWithDraftGuard = useCallback(
    async (navigate: () => void) => {
      if (dirtyCount === 0) {
        navigate()
        return
      }
      const { confirmed } = await openConfirm({
        title: 'تغييرات غير محفوظة',
        message: 'لديك كميات غير محفوظة في هذه الصفحة. الانتقال إلى صفحة أخرى سيفقدها.',
        confirmLabel: 'الانتقال وفقدان التغييرات',
        cancelLabel: 'البقاء في هذه الصفحة',
      })
      if (confirmed) {
        navigate()
      }
    },
    [dirtyCount, openConfirm],
  )

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage !== page) {
        void navigateWithDraftGuard(() => setPage(nextPage))
      }
    },
    [navigateWithDraftGuard, page, setPage],
  )

  const handlePageSizeChange = useCallback(
    (nextPageSize: number) => {
      if (nextPageSize !== pageSize) {
        void navigateWithDraftGuard(() => setPageSize(nextPageSize))
      }
    },
    [navigateWithDraftGuard, pageSize, setPageSize],
  )

  const columns = useMemo(
    () =>
      countLineColumnHelper.columns([
        countLineColumnHelper.accessor((line) => line.material.displayName, {
          id: 'material',
          header: 'المادة',
          cell: ({ row }) => (
            <div className="flex flex-col gap-0.5">
              <span>{row.original.material.displayName}</span>
              {isAssetCountLine(row.original) ? (
                <span className="inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  أصل مسلسل
                  {row.original.assetNumber != null ? ` · ${row.original.assetNumber}` : ''}
                </span>
              ) : null}
            </div>
          ),
        }),
        countLineColumnHelper.accessor('snapshotQuantity', {
          id: 'snapshotQuantity',
          header: 'الكمية الدفترية',
          cell: ({ getValue }) => <span className="ltr">{getValue()}</span>,
        }),
        countLineColumnHelper.display({
          id: 'actualQuantity',
          header: 'الكمية الفعلية',
          cell: ({ row }) => (
            <CountLineQuantityField
              index={row.index}
              line={row.original}
              disabled={isEditorDisabled}
            />
          ),
        }),
        countLineColumnHelper.display({
          id: 'difference',
          header: 'الفرق',
          cell: ({ row }) => <CountLineDifferenceField index={row.index} line={row.original} />,
        }),
        countLineColumnHelper.display({
          id: 'reason',
          header: 'سبب الفرق',
          cell: ({ row }) => (
            <CountLineReasonField
              index={row.index}
              line={row.original}
              disabled={isEditorDisabled}
            />
          ),
        }),
      ]),
    [isEditorDisabled],
  )

  const handleSave = form.handleSubmit(
    async (values) => {
      const request = toCountLineUpdateRequest(countRowVersion, items, values)
      if (request.lines.length === 0) {
        return
      }
      try {
        await submitFeedback(async () => {
          await updateMutation.mutateAsync(request)
          toast.success({ title: 'حُفظت الكميات الفعلية.' })
        })
        // The mutation invalidated every page of this session, so refetch the
        // page on screen and reseed the form from it. Without this the typed
        // drafts would keep comparing against the pre-save baseline and the
        // page would keep claiming unsaved changes.
        const refreshed = await linesQuery.refetch()
        form.reset(toCountLineEntryFormValues(refreshed.data?.items ?? EMPTY_LINES))
      } catch {
        // submitFeedback already surfaced the failure in Arabic; the inline
        // alert beside the save action carries the retry guidance.
      }
    },
    () => {
      // Arabic validation messages render inline on the offending field.
    },
  )

  return (
    <div dir="rtl" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-popover px-4 py-3 text-sm">
        <span>
          إجمالي البنود:{' '}
          <strong className="text-foreground">
            {toArabicDigits(serverPage?.meta.totalItems ?? 0)}
          </strong>
        </span>
        <span>
          في هذه الصفحة — أُدخلت:{' '}
          <strong className="text-foreground">{toArabicDigits(pageStats.countedCount)}</strong>
        </span>
        <span>
          في هذه الصفحة — ذات فرق:{' '}
          <strong className="text-foreground">{toArabicDigits(pageStats.varianceCount)}</strong>
        </span>
        <span>
          في هذه الصفحة — إجمالي الفرق:{' '}
          <strong className="text-foreground">{toArabicDigits(pageStats.totalVariance)}</strong>
        </span>
      </div>

      <Form {...form}>
        <DataTableServer
          columns={columns}
          data={pageRows(serverPage, linesQuery.isError)}
          isLoading={linesQuery.isLoading}
          isError={linesQuery.isError}
          onRetry={() => void linesQuery.refetch()}
          errorTitle="تعذّر تحميل بنود الجرد"
          errorMessage="تعذّر جلب بنود هذه الجلسة. حاول مرة أخرى."
          emptyTitle="لا توجد بنود في هذه الجلسة"
          emptyDescription="لم يُلتقط أي بند ضمن نطاق هذه الجلسة. راجع نطاق الجرد ثم أعد تحميل الصفحة."
          page={page}
          pageSize={pageSize}
          totalCount={serverPage?.meta.totalItems}
          totalPages={Math.max(serverPage?.meta.totalPages ?? 1, 1)}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />

        {canEnter ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={updateMutation.isPending || dirtyCount === 0}
            >
              {updateMutation.isPending ? 'جارٍ الحفظ...' : `حفظ (${toArabicDigits(dirtyCount)})`}
            </Button>
            {dirtyCount === 0 ? (
              <span className="text-sm text-muted-foreground">لا تغييرات غير محفوظة.</span>
            ) : (
              <span className="text-sm text-muted-foreground">
                تغييرات غير محفوظة في هذه الصفحة: {toArabicDigits(dirtyCount)}
              </span>
            )}
            {updateMutation.error !== null ? (
              <p role="alert" className="text-sm text-destructive">
                تعذّر حفظ بنود الجرد. تحقق من عدم وجود جلسة أخرى أو حدّث الصفحة.
              </p>
            ) : null}
          </div>
        ) : null}
      </Form>
      {confirmDialog}
    </div>
  )
}
