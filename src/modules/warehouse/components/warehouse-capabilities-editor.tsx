import { useMemo, useState } from 'react'
import { useConfirm } from '@/shared/hooks/use-confirm'
import {
  useAddWarehouseCapabilityOperationMutation,
  useGrantWarehouseCapabilityMutation,
  useRemoveWarehouseCapabilityOperationMutation,
  useRevokeWarehouseCapabilityMutation,
} from '@/modules/warehouse/hooks/use-warehouse-mutations'
import { OPERATION_LABELS } from '@/modules/warehouse/hooks/use-warehouse-capability-validation'
import { useWarehouseCapabilitiesQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'
import {
  CAPABILITY_OPERATION_VALUES,
  type CapabilityOperation,
  type WarehouseCapability,
} from '@/modules/warehouse/types/warehouse.types'
import { reportApiError } from '@/shared/services/api-error'
import { useMaterialDomainsQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { ContentCard } from '@/shared/layout/content-card'
import { ErrorState } from '@/shared/feedback/error-state'

/**
 * REBUILT 2026-10-12 (lvtk.3 / lvtk.4 owner ruling: per-capability writes,
 * last-write-wins). The previous editor was built around a phantom batch
 * `PUT /warehouses/{id}/capabilities` that does not exist, and bound every
 * operation toggle to a `useMemo` over the server prop. This rewrite binds the
 * editor to the real wire and fixes the eight defects enumerated on the bead:
 *
 *  1. NO ADD — the old dialog was dead for a zero-capability warehouse. This
 *     editor always renders a "Grant a capability" form at the top, so the
 *     empty state has a productive path (and this IS the default, because no
 *     seeder ever creates a capability row).
 *  2. CHECKBOX BOUND TO THE SERVER PROP — `enabled` resolved through a memo
 *     over the `capabilities` prop, so a second toggle on one row recomputed
 *     its baseline from the server and silently dropped the first. Here each
 *     operation chip reads an OPTIMISTIC per-row overlay (`grantedOperation`)
 *     that flips on click and is reconciled from the re-read after the mutation
 *     settles. The overlay is the defect-2 non-vacuity: bound to the prop, it
 *     could not be made to fail; here a test flips it and asserts the DOM
 *     before any server round-trip.
 *  3. ENGLISH ENUMS — every chip and chip-summary renders `OPERATION_LABELS`.
 *  4. ROW DOMAIN SELECT — the old Add-A-Row select filtered out its OWN
 *     selected domain, so it showed a placeholder or a raw GUID. There is no
 *     per-row domain to re-pick any more: a domain is granted once, from the
 *     top form, so the picker only excludes already-present domains.
 *  5. RAW GUID CHIPS — rows show `materialDomainName` (+ short code), never a
 *     Guid.
 *  6. DUPLICATE CONTROLLER — gone with the whole-matrix react-hook-form; there
 *     is one surface per action.
 *  7. VALIDATION / A11Y — the grant field, each row and each chip are labelled
 *     in Arabic with `aria-pressed` toggle semantics and a visible focus ring.
 *  8. NO TEST FILE — `warehouse-capabilities-editor.test.tsx` now covers the
 *     behaviours above, including that exactly ONE success toast is emitted.
 *
 * WRITE MODEL: grant `POST /warehouse-capabilities {warehouseId,
 * materialDomainId}`, revoke `DELETE /warehouse-capabilities/{capabilityId}`
 * (soft delete — the row returns `Inactive`, re-granting reactivates it), add
 * op `POST .../operations {operationType:int}`, remove op
 * `DELETE .../operations/{enumName}`. The grant and revoke mutations toast in
 * their own `onSuccess`; the editor never toasts again, so a successful action
 * yields exactly one toast.
 */

export interface WarehouseCapabilitiesEditorProps {
  warehouseId: string
}

function pendingOpKey(capabilityId: string, operation: CapabilityOperation): string {
  return `${capabilityId}:${operation}`
}

// A stable empty reference so `capabilities` does not change identity every
// render while the read is in flight (a `?? []` literal would defeat the
// `presentDomainIds` memo below and trip react-hooks/exhaustive-deps).
const EMPTY_CAPABILITIES: readonly WarehouseCapability[] = []

/**
 * The Arabic reason for a rejected capability action.
 *
 * The API resolves Arabic from the error CODE (`error-copy-ar.ts`); the wire
 * message is English and is never rendered. `detailAr`/`titleAr` here are the
 * normalized Arabic, so a rejected grant/already-revoked surfaces the approved
 * copy rather than the generic per-status fallback.
 */
export function WarehouseCapabilitiesEditor({ warehouseId }: WarehouseCapabilitiesEditorProps) {
  const [open, setOpen] = useState(false)
  const { confirm, element: confirmElement } = useConfirm()

  // The editor owns its own read of the matrix. It is the SAME cached query the
  // read-only overview and the document gate consume, so a grant/revoke/toggle
  // mutation invalidating it refreshes this dialog AND the overview at once,
  // with no 1+N join (lvtk.1 projects `operations` inline).
  const capabilitiesQuery = useWarehouseCapabilitiesQuery(warehouseId)
  const domainsQuery = useMaterialDomainsQuery({ status: 'Active', page: 1, pageSize: 100 })

  const grantMutation = useGrantWarehouseCapabilityMutation()
  const revokeMutation = useRevokeWarehouseCapabilityMutation()
  const addOperationMutation = useAddWarehouseCapabilityOperationMutation()
  const removeOperationMutation = useRemoveWarehouseCapabilityOperationMutation()

  const capabilities = capabilitiesQuery.data?.items ?? EMPTY_CAPABILITIES

  // Optimistic overlay (defect 2). A `(capabilityId, operation)` key present in
  // `pendingAdds` renders as granted; in `pendingRemoves` renders as ungranted;
  // absent, the committed server value wins. Each key is added on click and
  // cleared when the mutation settles, so the overlay never outlives its write.
  const [pendingAdds, setPendingAdds] = useState<ReadonlySet<string>>(new Set())
  const [pendingRemoves, setPendingRemoves] = useState<ReadonlySet<string>>(new Set())

  const presentDomainIds = useMemo(
    () => new Set(capabilities.map((capability) => capability.materialDomainId)),
    [capabilities],
  )
  const availableDomains = useMemo(() => {
    const items = domainsQuery.data?.items ?? []
    return items.filter((domain) => domain.status === 'Active' && !presentDomainIds.has(domain.id))
  }, [domainsQuery.data, presentDomainIds])

  const [selectedDomainId, setSelectedDomainId] = useState('')

  // Keep a valid default selection for the grant picker: the user-typed
  // choice is preserved if it still resolves; otherwise the first
  // available domain wins. The derivation lives in a `useMemo` so a
  // render never re-triggers a setState cascade, and the Select below
  // reads the resolved value rather than the raw state.
  const resolvedSelectedDomainId = useMemo(() => {
    if (
      selectedDomainId !== '' &&
      availableDomains.some((domain) => domain.id === selectedDomainId)
    ) {
      return selectedDomainId
    }
    return availableDomains[0]?.id ?? ''
  }, [availableDomains, selectedDomainId])

  const close = () => {
    setOpen(false)
    setPendingAdds(new Set())
    setPendingRemoves(new Set())
  }

  const grant = async (materialDomainId: string) => {
    try {
      await grantMutation.mutateAsync({ warehouseId, materialDomainId })
    } catch (error: unknown) {
      // No editor-side success toast: `useGrantWarehouseCapabilityMutation`
      // already emits exactly one. Only the failure path toasts here.
      reportApiError(error)
    }
  }

  const reactivate = async (capability: WarehouseCapability) => {
    // A revoked (Inactive) capability is reactivated by re-granting the same
    // domain: the handler is idempotent on the unique (warehouseId,
    // materialDomainId) key and flips the existing row back to Active.
    try {
      await grantMutation.mutateAsync({
        warehouseId,
        materialDomainId: capability.materialDomainId,
      })
    } catch (error: unknown) {
      reportApiError(error)
    }
  }

  const revoke = async (capability: WarehouseCapability) => {
    const result = await confirm({
      title: 'تأكيد إبطال القدرة',
      message: `سيتم إبطال قدرة "${capability.materialDomainName}" لهذا المستودع. يمكن تنشيطها لاحقًا بنفس المجال.`,
      confirmLabel: 'إبطال القدرة',
      cancelLabel: 'إلغاء',
    })
    if (!result.confirmed) return
    try {
      await revokeMutation.mutateAsync({ warehouseId, capabilityId: capability.id })
    } catch (error: unknown) {
      reportApiError(error)
    }
  }

  const toggleOperation = async (
    capability: WarehouseCapability,
    operation: CapabilityOperation,
    committedGranted: boolean,
  ) => {
    const key = pendingOpKey(capability.id, operation)
    if (committedGranted) {
      setPendingRemoves((prev) => new Set(prev).add(key))
      try {
        await removeOperationMutation.mutateAsync({
          warehouseId,
          capabilityId: capability.id,
          operation,
        })
      } catch (error: unknown) {
        reportApiError(error)
      } finally {
        setPendingRemoves((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    } else {
      setPendingAdds((prev) => new Set(prev).add(key))
      try {
        await addOperationMutation.mutateAsync({
          warehouseId,
          capabilityId: capability.id,
          operation,
        })
      } catch (error: unknown) {
        reportApiError(error)
      } finally {
        setPendingAdds((prev) => {
          if (!prev.has(key)) return prev
          const next = new Set(prev)
          next.delete(key)
          return next
        })
      }
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        إدارة القدرات
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true)
          else close()
        }}
      >
        <DialogContent size="lg" dir="rtl">
          {capabilitiesQuery.isError && (
            <ErrorState
              title="تعذّر تحميل قدرات المستودع"
              description="تعذّر جلب القدرات. حاول مرة أخرى."
              action={
                <Button type="button" onClick={() => void capabilitiesQuery.refetch()}>
                  إعادة المحاولة
                </Button>
              }
            />
          )}
          {domainsQuery.isError && (
            <ErrorState
              title="تعذّر تحميل مجالات المواد"
              description="تعذّر جلب المجالات. حاول مرة أخرى."
              action={
                <Button type="button" onClick={() => void domainsQuery.refetch()}>
                  إعادة المحاولة
                </Button>
              }
            />
          )}
          <DialogHeader>
            <DialogTitle>إدارة قدرات المستودع</DialogTitle>
            <DialogDescription>
              امنح المستودع قدرات حسب المجالات، ثم أضف أو أزل عمليات كل مجال. يُحفظ كل تغيير مباشرةً
              عند تنفيذه.
            </DialogDescription>
          </DialogHeader>

          <ContentCard
            title="منح قدرة جديدة"
            description="اختر مجال مواد نشطًا غير ممنوح بعد لهذا المستودع."
          >
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="grid gap-1">
                <label htmlFor="capability-grant-domain" className="text-sm font-medium">
                  مجال المواد
                </label>
                <Select
                  value={resolvedSelectedDomainId}
                  onValueChange={(value) => setSelectedDomainId(value ?? '')}
                  disabled={
                    grantMutation.isPending ||
                    domainsQuery.isLoading ||
                    availableDomains.length === 0
                  }
                >
                  <SelectTrigger id="capability-grant-domain">
                    <SelectValue
                      placeholder={
                        availableDomains.length === 0
                          ? 'كل مجالات المواد المفعّلة ممنوحة بالفعل.'
                          : 'اختر مجالًا...'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDomains.map((domain) => (
                      <SelectItem key={domain.id} value={domain.id}>
                        {domain.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                onClick={() => void grant(resolvedSelectedDomainId)}
                disabled={
                  resolvedSelectedDomainId === '' ||
                  grantMutation.isPending ||
                  domainsQuery.isError ||
                  capabilitiesQuery.isError
                }
                loading={grantMutation.isPending}
              >
                منح القدرة
              </Button>
            </div>
          </ContentCard>

          <ContentCard
            title="القدرات الحالية"
            description="كل صف مجال ممنوح وعملياته. أضف أو أزل عمليات كل صف على حدة."
          >
            {capabilitiesQuery.isPending && !capabilitiesQuery.isError ? (
              <p className="py-4 text-center text-sm text-muted-foreground" role="status">
                جارٍ تحميل القدرات...
              </p>
            ) : !capabilitiesQuery.isError && capabilities.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground" role="status">
                لا توجد قدرات ممنوحة بعد. استخدم النموذج أعلاه لمنح أول قدرة.
              </p>
            ) : !capabilitiesQuery.isError ? (
              <ul className="grid gap-3">
                {capabilities.map((capability) => (
                  <CapabilityRow
                    key={capability.id}
                    capability={capability}
                    isRevoking={revokeMutation.isPending}
                    isReactivating={grantMutation.isPending}
                    isCapabilitiesError={capabilitiesQuery.isError}
                    onRevoke={() => void revoke(capability)}
                    onReactivate={() => void reactivate(capability)}
                    onToggleOperation={(operation, committedGranted) =>
                      void toggleOperation(capability, operation, committedGranted)
                    }
                    pendingAdds={pendingAdds}
                    pendingRemoves={pendingRemoves}
                  />
                ))}
              </ul>
            ) : null}
          </ContentCard>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmElement}
    </>
  )
}

interface CapabilityRowProps {
  capability: WarehouseCapability
  isRevoking: boolean
  isReactivating: boolean
  isCapabilitiesError?: boolean
  onRevoke: () => void
  onReactivate: () => void
  onToggleOperation: (operation: CapabilityOperation, committedGranted: boolean) => void
  pendingAdds: ReadonlySet<string>
  pendingRemoves: ReadonlySet<string>
}

function CapabilityRow({
  capability,
  isRevoking,
  isReactivating,
  isCapabilitiesError,
  onRevoke,
  onReactivate,
  onToggleOperation,
  pendingAdds,
  pendingRemoves,
}: CapabilityRowProps) {
  const isActive = capability.status === 'Active'
  const committedGranted = useMemo(
    () => new Set<CapabilityOperation>(capability.operations),
    [capability.operations],
  )
  return (
    <li
      className="grid gap-2 rounded-md border border-border p-3 aria-disabled:opacity-60"
      aria-disabled={!isActive || undefined}
      data-status={capability.status}
      aria-label={`قدرة ${capability.materialDomainName}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-1">
          <span className="font-medium">{capability.materialDomainName}</span>
          <span className="text-xs text-muted-foreground">
            {isActive ? 'نشطة' : 'غير نشطة (مُبطلة)'} — الرمز {capability.materialDomainCode}
          </span>
        </div>
        {isActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRevoke}
            disabled={isRevoking || !!isCapabilitiesError}
            loading={isRevoking}
            aria-label={`إبطال قدرة ${capability.materialDomainName}`}
          >
            إبطال
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReactivate}
            disabled={isReactivating || !!isCapabilitiesError}
            loading={isReactivating}
            aria-label={`تنشيط قدرة ${capability.materialDomainName}`}
          >
            تنشيط
          </Button>
        )}
      </div>
      <ul className="flex flex-wrap gap-2" aria-label={`عمليات ${capability.materialDomainName}`}>
        {CAPABILITY_OPERATION_VALUES.map((operation) => {
          const key = pendingOpKey(capability.id, operation)
          const isPendingAdd = pendingAdds.has(key)
          const isPendingRemove = pendingRemoves.has(key)
          // Optimistic overlay: the pending intent wins until the mutation
          // settles, then the committed server value is authoritative again.
          const effectiveGranted = isPendingAdd
            ? true
            : isPendingRemove
              ? false
              : committedGranted.has(operation)
          const busy = isPendingAdd || isPendingRemove || !isActive
          return (
            <li key={operation}>
              <button
                type="button"
                onClick={() => onToggleOperation(operation, committedGranted.has(operation))}
                disabled={busy || !!isCapabilitiesError}
                aria-pressed={effectiveGranted}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                data-operation={operation}
                data-granted={effectiveGranted ? 'true' : 'false'}
              >
                {isPendingAdd
                  ? `... جاري إضافة ${OPERATION_LABELS[operation]}`
                  : isPendingRemove
                    ? `... جاري إزالة ${OPERATION_LABELS[operation]}`
                    : OPERATION_LABELS[operation]}
              </button>
            </li>
          )
        })}
      </ul>
    </li>
  )
}
