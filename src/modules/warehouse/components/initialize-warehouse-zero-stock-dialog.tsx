import { IconCheck } from '@tabler/icons-react'
import { useState } from 'react'

import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { useActiveScopeContext } from '@/modules/auth/hooks/use-active-scope-context'
import { useInitializeWarehouseZeroStockMutation } from '@/modules/warehouse/hooks/use-warehouse-mutations'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

/**
 * D-OPEN-02 (PRD §6.10) — confirmation dialog for the explicit
 * zero-stock initialization. The mutation produces NO document, NO
 * stock movements, and NO Asset records; the only effect is the
 * canonical `WarehouseInitializationState` row with `IsZeroStock = true`.
 *
 * Why a dedicated dialog and not a one-click button:
 *  - The cut-off date is the only piece of business data the
 *    warehouse keeper must own (it represents the date the (empty)
 *    physical inventory was measured, not the posting instant).
 *  - The action is irreversible in the same way a posted Opening
 *    document is: a duplicate initialization returns a 409 from the
 *    backend and the warehouse keeps its zero-stock state. Confirming
 *    up front makes the action visible to the user.
 *
 * Why the scope check happens at mount:
 *  - The mutation is gated by `document.create` at Warehouse scope
 *    (D-RBAC-02). A Site- or Enterprise-scoped Manager will hit a
 *    404 from the backend even if they reach this dialog; hiding the
 *    trigger on the warehouse detail page is the honest answer.
 */
export interface InitializeWarehouseZeroStockDialogProps {
  warehouseId: string
  warehouseName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Called after a successful initialization so the parent can
   * re-navigate or refresh other surfaces (e.g. the warehouse
   * detail page is already doing this via query invalidation, but
   * callers can also close related panels here).
   */
  onInitialized?: () => void
}

export function InitializeWarehouseZeroStockDialog({
  warehouseId,
  warehouseName,
  open,
  onOpenChange,
  onInitialized,
}: InitializeWarehouseZeroStockDialogProps): React.ReactElement {
  const { activeScope } = useActiveScopeContext()
  const isWarehouseScope = activeScope?.scopeType === 'Warehouse'
  const mutation = useInitializeWarehouseZeroStockMutation()
  const submitFeedback = useSubmitFeedback()
  // Default the cut-off date to today. The component is intentionally
  // mounted fresh on every open (`key={open ? 'open' : 'closed'}`) so
  // a previously-failed submission's typed value never bleeds into the
  // next attempt; this avoids the `setState`-in-effect lint without
  // losing the per-open reset.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <ZeroStockDialogBody
          warehouseId={warehouseId}
          warehouseName={warehouseName}
          isWarehouseScope={isWarehouseScope}
          isPending={mutation.isPending}
          mutate={mutation.mutateAsync}
          submitFeedback={submitFeedback}
          onOpenChange={onOpenChange}
          onInitialized={onInitialized}
        />
      ) : null}
    </Dialog>
  )
}

interface ZeroStockDialogBodyProps {
  warehouseId: string
  warehouseName: string
  isWarehouseScope: boolean
  isPending: boolean
  mutate: ReturnType<typeof useInitializeWarehouseZeroStockMutation>['mutateAsync']
  submitFeedback: ReturnType<typeof useSubmitFeedback>
  onOpenChange: (open: boolean) => void
  onInitialized: (() => void) | undefined
}

function ZeroStockDialogBody({
  warehouseId,
  warehouseName,
  isWarehouseScope,
  isPending,
  mutate,
  submitFeedback,
  onOpenChange,
  onInitialized,
}: ZeroStockDialogBodyProps): React.ReactElement {
  const [asOfDate, setAsOfDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const isDateValid = ISO_DATE_PATTERN.test(asOfDate)

  const handleSubmit = async (): Promise<void> => {
    if (!isDateValid) return
    await submitFeedback(async () => {
      await mutate({ warehouseId, request: { asOfDate } })
      onOpenChange(false)
      onInitialized?.()
    })
  }

  return (
    <DialogContent dir="rtl" className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>تهيئة المستودع برصيد صفري</DialogTitle>
        <DialogDescription>
          هذه العملية تسجّل المستودع «{warehouseName}» كمهيّأ ابتداءً من تاريخ
          القطع المُدخل، دون إنشاء مستند أو حركات مخزون. لا يمكن التراجع عنها
          عبر هذا الحوار؛ إن أردت تهيئة بحركة فعلية، استخدم نموذج الرصيد
          الافتتاحي داخل المستودع.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <label
          htmlFor="warehouse-zero-stock-as-of-date"
          className="block text-sm font-medium text-foreground"
        >
          تاريخ القطع
        </label>
        <Input
          id="warehouse-zero-stock-as-of-date"
          type="date"
          dir="ltr"
          value={asOfDate}
          disabled={isPending}
          onChange={(event) => setAsOfDate(event.target.value)}
          aria-invalid={!isDateValid}
        />
        {!isDateValid ? (
          <p className="text-xs text-rose-700" role="alert">
            أدخل تاريخ القطع بصيغة YYYY-MM-DD.
          </p>
        ) : null}
        {!isWarehouseScope ? (
          <p className="text-xs text-amber-700" role="alert">
            هذا الإجراء متاح فقط لنطاق المستودع. سترفض الواجهة الخلفية الطلب
            حتى لو أُرسل يدوياً.
          </p>
        ) : null}
      </div>
      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          إلغاء
        </Button>
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!isDateValid || isPending || !isWarehouseScope}
          data-testid="warehouse-zero-stock-confirm"
        >
          <IconCheck aria-hidden data-icon="inline-start" />
          تأكيد التهيئة برصيد صفري
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
