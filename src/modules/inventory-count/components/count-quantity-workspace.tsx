import { reportApiError } from '@/shared/services/api-error'
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
import { CountMaterialName } from '@/modules/inventory-count/components/count-name-fields'
import { countLinePageStats } from '@/modules/inventory-count/components/count-quantity-workspace.model'
import { useCountConflictRecovery } from '@/modules/inventory-count/hooks/use-count-conflict-recovery'
import {
  useCountLinesQuery,
  useInventoryCountQuery,
  useSetLineVarianceReasonMutation,
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
import type { InventoryCountLine } from '@/modules/inventory-count/types/inventory-count.types'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { Form } from '@/shared/forms/form'
import { useConfirm } from '@/shared/hooks/use-confirm'
import { useServerPagination } from '@/shared/hooks/use-server-pagination'
import { isConflictError } from '@/shared/services/mutation-safety'
import { Button } from '@/shared/ui/button'
import { ConflictRecoveryDialog } from '@/shared/ui/conflict-recovery-dialog'
import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'
import { toast } from '@/shared/ui/toast-manager'
import { toArabicDigits } from '@/shared/utils/format'
import { pageRows } from '@/shared/utils/table-data'

/** Rows requested on first render; the shared bar offers 10/25/50/100. */
const INITIAL_PAGE_SIZE = 25

const countLineColumnHelper = createColumnHelper<typeof dataTableFeatures, InventoryCountLine>()

const EMPTY_LINES: readonly InventoryCountLine[] = []

/**
 * Why a changed row cannot travel in the current save. The wording states only
 * what is observable — nothing was sent for this row, and here is the
 * condition — and never guesses at a cause the server did not report. The line
 * DTO carries no rowVersion, so there is no version-based block left (F2).
 */
const SAVE_BLOCK_REASON_AR: Readonly<Record<CountLineSaveBlock['kind'], string>> = {
  'no-quantity': 'لا تُرسل كمية غير مُدخلة أو غير صالحة.',
}

const CONFLICT_TITLE_AR = 'تعارض على بنود الجرد'
const CONFLICT_DESCRIPTION_AR =
  'رفض الخادم الحفظ لأن نسخته الآن تختلف عن ما أرسلته. راجع القيم المعروضة قبل إعادة المحاولة.'
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
 * pagination bar (1-based `page` + `pageSize`), and the draft form is scoped to
 * the page on screen.
 *
 * Saves carry the COUNT's `expectedRowVersion` (never a per-line version — the
 * line DTO has none, F2): quantities travel as one all-or-nothing batch
 * (`PUT /actuals`, one version bump), and a variance reason the operator typed
 * travels through `PUT /{countId}/lines/{lineId}/variance-reason` (F3) with the
 * freshly refetched count version, so Close is never blocked by an
 * unsent reason. The page is re-seeded from the server after the batch.
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

  // 1-based end to end: the shared bar, the query key and the wire agree.
  const linesQueryInput = useMemo(() => ({ page, pageSize }), [page, pageSize])
  const linesQuery = useCountLinesQuery(countId, linesQueryInput)
  const serverPage = linesQuery.data
  const items: readonly InventoryCountLine[] = serverPage?.items ?? EMPTY_LINES

  const currentPageValues = useMemo(() => toCountLineEntryFormValues(items), [items])

  const form = useForm<CountLineEntryFormValues>({
    resolver: zodResolver(countLineEntrySchema),
    defaultValues: currentPageValues,
    // The `values` prop is deliberately NOT used; reseeding is explicit below
    // (a keyed reset would erase entries or leak drafts across pages).
  })
  const drafts = useCountLineDrafts(form.control)

  /**
   * Reseed the form when the server page changes. `keepDirtyValues` protects
   * anything the operator typed but has not yet saved.
   */
  useEffect(() => {
    form.reset(currentPageValues, { keepDirtyValues: true })
  }, [currentPageValues, form])

  const updateMutation = useUpdateCountLinesMutation(countId)
  const reasonMutation = useSetLineVarianceReasonMutation(countId)
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
  const isEditorDisabled = !canEnter || updateMutation.isPending || reasonMutation.isPending

  /**
   * What the current save would carry, and which changed rows it cannot carry.
   * Derived from the live drafts so the button, the blocked-row warning and the
   * batch the save handler builds are all the same computation.
   */
  const savePlan = useMemo(
    () => planCountLineSaves(countRowVersion, items, { lines: drafts }),
    [countRowVersion, drafts, items],
  )
  const sendableCount = savePlan.request.actuals.length + savePlan.reasons.length
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
        message: 'لديك كميات أو أسباب غير محفوظة في هذه الصفحة. الانتقال إلى صفحة أخرى سيفقدها.',
        confirmLabel: 'الانتقال وفقدان التغييرات',
        cancelLabel: 'البقاء في هذه الصفحة',
      })
      if (confirmed) {
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
        countLineColumnHelper.accessor('materialId', {
          id: 'material',
          header: 'المادة',
          cell: ({ row }) => (
            <div className="flex flex-col gap-0.5">
              <CountMaterialName materialId={row.original.materialId} />
              {isAssetCountLine(row.original) ? (
                <span className="inline-flex w-fit items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  أصل مسسلسيل · {row.original.assetId}
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
      // "which of the operator's changes are not". It emits BOTH wires: the
      // quantity batch (all-or-nothing, expectedRowVersion = count today) and
      // the per-line variance reasons (F3), each with the freshly refetched
      // count version.
      const plan = planCountLineSaves(countRowVersion, items, values)
      if (plan.request.actuals.length === 0 && plan.reasons.length === 0) {
        return
      }
      try {
        if (plan.request.actuals.length > 0) {
          await updateMutation.mutateAsync(plan.request)
          toast.success({ title: 'حُفظت الكميات الفعلية.' })
          // The batch moved the count version; re-seed from the server so no
          // saved row keeps comparing against its pre-save baseline. Reasons
          // stay dirty (the server baseline for one that was NOT yet sent).
          const refreshed = await linesQuery.refetch()
          form.reset(toCountLineEntryFormValues(refreshed.data?.items ?? EMPTY_LINES), {
            keepDirtyValues: true,
          })
        }
        for (const entry of plan.reasons) {
          // The authoritative count version at THIS instant — refetch, don't
          // guess the bump. Every reason save is one version-bump apart.
          const { data: fresh } = await countQuery.refetch()
          const version = fresh?.rowVersion
          if (version === undefined) {
            throw new Error('count version unavailable')
          }
          await reasonMutation.mutateAsync({
            lineId: entry.lineId,
            reason: entry.reason,
            expectedRowVersion: version,
          })
        }
        if (plan.reasons.length > 0) {
          toast.success({ title: 'حُفظت أسباب الفروقات.' })
        }
      } catch (error: unknown) {
        if (isConflictError(error)) {
          recovery.reportConflict()
        } else {
          reportApiError(error)
        }
        // Nothing is refetched on failure: a reload would reset the form and
        // destroy the entries being saved.
        return
      }

      if (plan.request.actuals.length > 0 && plan.reasons.length > 0) {
        // Reason round-trips already refetched the count; refresh the lines
        // once more so the saved reasons show in the table immediately.
        const refreshed = await linesQuery.refetch()
        form.reset(toCountLineEntryFormValues(refreshed.data?.items ?? EMPTY_LINES), {
          keepDirtyValues: false,
        })
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
          <strong className="text-foreground">{toArabicDigits(serverPage?.totalItems ?? 0)}</strong>
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
          totalCount={serverPage?.totalItems}
          totalPages={Math.max(serverPage?.totalPages ?? 1, 1)}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />

        {canEnter ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={updateMutation.isPending || reasonMutation.isPending || sendableCount === 0}
            >
              {updateMutation.isPending || reasonMutation.isPending
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
