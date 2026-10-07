import { zodResolver } from '@hookform/resolvers/zod'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import {
  CountLineDifferenceField,
  CountLineQuantityField,
  CountLineReasonField,
} from '@/modules/inventory-count/components/count-line-entry-fields'
import { useCountLineDrafts } from '@/modules/inventory-count/components/count-line-drafts'
import { countLinePageStats } from '@/modules/inventory-count/components/count-quantity-workspace.model'
import { useCountConflictRecovery } from '@/modules/inventory-count/hooks/use-count-conflict-recovery'
import {
  useCountLinesQuery,
  useInventoryCountQuery,
  useUpdateCountLinesMutation,
} from '@/modules/inventory-count/hooks/use-count-queries'
import {
  countDirtyLineIndexes,
  countLineEntrySchema,
  planCountLineSaves,
  toCountLineEntryFormValues,
  type CountLineEntryFormValues,
  type CountLineSaveBlock,
} from '@/modules/inventory-count/schemas/count-line-entry.schemas'
import { isAssetCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { Form } from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { normalizeApiError } from '@/shared/services/api-error'
import { isConflictError } from '@/shared/services/mutation-safety'
import { Button } from '@/shared/ui/button'
import { ConflictRecoveryDialog } from '@/shared/ui/conflict-recovery-dialog'
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
 * Why a changed row cannot travel in the current save. The wording states only
 * what is observable — nothing was sent for this row, and here is the
 * condition — and never guesses at a cause the server did not report.
 */
const SAVE_BLOCK_REASON_AR: Readonly<Record<CountLineSaveBlock['kind'], string>> = {
  'no-quantity': 'لا تُرسل كمية غير مُدخلة أو غير صالحة.',
  'missing-row-version': 'لا يمكن إرسالها: الخادم لم يوفّر إصداراً لهذا البند.',
}

const CONFLICT_TITLE_AR = 'تعارض على بنود الجرد'
const CONFLICT_DESCRIPTION_AR =
  'رفض الخادم الحفظ لأن نسخته الآن تختلف عن ما أرسلته. الرد لا يوضّح أي البنود حُفظت، لذا راجع القيم المعروضة قبل إعادة المحاولة.'
const CONFLICT_RECOVER_AR = 'تحميل النسخة الأحدث'
const CONFLICT_RECOVERING_AR = 'جارٍ التحميل...'
const CONFLICT_STAY_AR = 'البقاء على القيم الحالية'

/** One Arabic clause per distinct block kind, de-duplicated and in row order. */
function blockedSummaryAr(blocked: readonly CountLineSaveBlock[]): string {
  const seen: CountLineSaveBlock['kind'][] = []
  for (const block of blocked) {
    if (!seen.includes(block.kind)) {
      seen.push(block.kind)
    }
  }
  return seen.map((kind) => SAVE_BLOCK_REASON_AR[kind]).join(' ')
}

/**
 * Quantity-entry workspace (e20-t06, hbfu, eiams-frontend-3wv1).
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
    // The `values` prop is deliberately NOT used. react-hook-form treats any
    // deep-unequal `values` change as a FULL reset, and that cannot tell the
    // cases apart: a background refetch, the reseed after a successful save,
    // and a page change all look identical to it. A full reset on the first two
    // erases entries the operator typed, and on the third it would have to be a
    // full reset even though `resetOptions.keepDirtyValues` cannot be used
    // globally — drafts are keyed by row INDEX, so keeping dirty values across
    // a page change would carry page 1's quantities onto page 2's rows.
    //
    // Reseeding is therefore explicit below: an effect keeps the operator's
    // entries when the page content changes, and page navigation clears the
    // form first so nothing leaks across pages.
  })
  const drafts = useCountLineDrafts(form.control)

  /**
   * Reseed the form when the server page changes.
   *
   * `keepDirtyValues` protects anything the operator has typed but not yet
   * saved. A row whose entry travelled in the last save now matches the server,
   * so it goes clean; a row that could not be sent stays dirty, is still
   * reported, and is still offered in the next save.
   */
  useEffect(() => {
    form.reset(currentPageValues, { keepDirtyValues: true })
  }, [currentPageValues, form])

  const updateMutation = useUpdateCountLinesMutation(countId)
  const { confirm: openConfirm, element: confirmDialog } = useConfirm()

  // A second observer on the same key as the parent page, so the recovery path
  // can reload the session `rowVersion` without threading a callback down.
  const countQuery = useInventoryCountQuery(countId)
  const recovery = useCountConflictRecovery({
    enabled: canEnter,
    refetchCount: async () => countQuery.refetch(),
    refetchLines: async () => linesQuery.refetch(),
  })

  const dirtyCount = useMemo(() => countDirtyLineIndexes(items, drafts).length, [drafts, items])
  const pageStats = useMemo(() => countLinePageStats(items, drafts), [drafts, items])
  const isEditorDisabled = !canEnter || updateMutation.isPending

  /**
   * What the current save would carry, and which changed rows it cannot carry.
   *
   * Derived from the live drafts so the button label, the blocked-row warning
   * and the batch the save handler builds are all the same computation. A
   * changed row with a blank or unparseable quantity used to be dropped from
   * the payload while still counting toward `dirtyCount`, so a save could report
   * success and the page would go on claiming unsaved changes.
   */
  const savePlan = useMemo(
    () => planCountLineSaves(countRowVersion, items, { lines: drafts }),
    [countRowVersion, drafts, items],
  )
  const sendableCount = savePlan.request.lines.length
  const blockedCount = savePlan.blocked.length

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
        // Clear before navigating. The reseed effect keeps dirty values, and
        // drafts are index-keyed, so leaving the old page's entries in place
        // would apply them to the new page's rows.
        form.reset(toCountLineEntryFormValues(EMPTY_LINES))
        navigate()
      }
    },
    [dirtyCount, form, openConfirm],
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
      // The plan is the single source of truth for "what is in this save" and
      // "which of the operator's changes are not", so the batch and the warning
      // beside the save button can never disagree.
      const plan = planCountLineSaves(countRowVersion, items, values)
      if (plan.request.lines.length === 0) {
        return
      }
      // Handled here rather than through `submitFeedback`, because a conflict
      // must not raise the generic status fallback: `api-error.ts` answers a
      // contract-shaped 409 is missing with "refresh the page and try again",
      // and a refresh is the one action that discards these entries with no
      // guard. The recovery dialog is the only surface that can be honest about
      // a 409, and it does not say what happened to the batch.
      try {
        await updateMutation.mutateAsync(plan.request)
      } catch (error: unknown) {
        if (isConflictError(error)) {
          recovery.reportConflict()
        } else {
          const apiError = normalizeApiError(error)
          toast.error({
            title: apiError.titleAr,
            ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
          })
        }
        // Nothing is refetched on any failure: a reload would reset the form
        // through the `values` prop and destroy the entries being saved.
        return
      }

      toast.success({ title: 'حُفظت الكميات الفعلية.' })

      // The mutation invalidated every page of this session, so refetch the page
      // on screen and reseed the form from it. Without this the typed drafts
      // would keep comparing against the pre-save baseline and the page would
      // keep claiming unsaved changes.
      //
      // `keepDirtyValues` is required, and is the OPPOSITE case from the warning
      // on the `useForm` call above. This reset is an explicit call at a point
      // where we know which rows travelled: a row in the batch now matches the
      // server, and a row that was BLOCKED did not travel, so adopting the
      // server's unchanged value for it would erase the operator's entry and
      // then report the page as having no unsaved changes - the exact
      // silent-drop this bead exists to remove. Keeping the dirty values leaves
      // such a row dirty, so it stays reported and stays in the next save. The
      // `values` prop cannot make this distinction; it has no knowledge of the
      // batch.
      const refreshed = await linesQuery.refetch()
      form.reset(toCountLineEntryFormValues(refreshed.data?.items ?? EMPTY_LINES), {
        keepDirtyValues: true,
      })
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
              disabled={updateMutation.isPending || sendableCount === 0}
            >
              {updateMutation.isPending
                ? 'جارٍ الحفظ...'
                : `حفظ (${toArabicDigits(sendableCount)})`}
            </Button>
            {dirtyCount === 0 ? (
              <span className="text-sm text-muted-foreground">لا تغييرات غير محفوظة.</span>
            ) : (
              <span className="text-sm text-muted-foreground">
                تغييرات غير محفوظة في هذه الصفحة: {toArabicDigits(dirtyCount)}
              </span>
            )}
            {blockedCount > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                {toArabicDigits(blockedCount)} تغيير في هذه الصفحة لن يُرسل مع الحفظ:{' '}
                {blockedSummaryAr(savePlan.blocked)}
              </p>
            ) : null}
            {updateMutation.error !== null && !recovery.conflict.active ? (
              <p role="alert" className="text-sm text-destructive">
                تعذّر حفظ بنود الجرد. لم تُضِع ما أدخلته، ويمكنك إعادة المحاولة.
              </p>
            ) : null}
          </div>
        ) : null}
      </Form>
      {confirmDialog}
      {recovery.conflict.active ? (
        <ConflictRecoveryDialog
          descriptionAr={CONFLICT_DESCRIPTION_AR}
          isRefreshing={recovery.conflict.isRefreshing}
          onDismiss={recovery.dismiss}
          onRecover={() => void recovery.recover()}
          recoveringLabelAr={CONFLICT_RECOVERING_AR}
          recoverLabelAr={CONFLICT_RECOVER_AR}
          slot="count-conflict-dialog"
          stayLabelAr={CONFLICT_STAY_AR}
          titleAr={CONFLICT_TITLE_AR}
        />
      ) : null}
    </div>
  )
}
