import { IconCheck, type Icon } from '@tabler/icons-react'

import type { AdjustmentStatus } from '@/modules/adjustment/types/adjustment.types'
import { Badge, type BadgeProps } from '@/shared/ui/badge'

type DocumentStatusValue = 'Draft' | 'Submitted' | 'Posted' | 'Reversed' | 'Cancelled' | 'Rejected'
type AssetStatusValue = 'InStock' | 'Issued' | 'InCustody' | 'Disposed'
type CustodyStatusValue = 'Active' | 'Closed'
/**
 * The count lifecycle, INCLUDING `Aborted`: the LIVE backend serves it
 * (`GET /api/v1/inventory-counts` answers a row with `status:"Aborted"`), and
 * the count module's own `CountStatus` carries it too.
 */
type InventoryCountStatusValue = 'Planned' | 'InProgress' | 'Completed' | 'Closed' | 'Aborted'
type RecordStatusValue = 'Active' | 'Inactive'
type UserAccountStatusValue = 'Active' | 'Suspended'
type WarehouseInitializationStatusValue =
  'NotInitialized' | 'Initialized' | 'ZeroStock' | 'Reversed'

type StatusEntity =
  | 'document'
  | 'adjustment'
  | 'asset'
  | 'custody'
  | 'inventory-count'
  | 'record'
  | 'user'
  | 'warehouse-initialization'

type StatusValue =
  | DocumentStatusValue
  | AdjustmentStatus
  | AssetStatusValue
  | CustodyStatusValue
  | InventoryCountStatusValue
  | RecordStatusValue
  | UserAccountStatusValue
  | WarehouseInitializationStatusValue

type StatusMeta = {
  label: string
  variant: Exclude<BadgeProps['variant'], null | undefined>
  icon?: Icon
}

const DRAFT_ENTRY: StatusMeta = { label: 'مسودة', variant: 'warning' }
const POSTED_ENTRY: StatusMeta = { label: 'مرحّل', variant: 'default', icon: IconCheck }
const REVERSED_ENTRY: StatusMeta = { label: 'معكوس', variant: 'outline' }

const STATUS_REGISTRY: Record<StatusEntity, Record<string, StatusMeta>> = {
  document: {
    Draft: DRAFT_ENTRY,
    Submitted: { label: 'بانتظار الترحيل', variant: 'success' },
    Posted: POSTED_ENTRY,
    Reversed: REVERSED_ENTRY,
    Cancelled: { label: 'ملغي', variant: 'destructive' },
    Rejected: { label: 'مرفوض', variant: 'critical' },
  } satisfies Record<DocumentStatusValue, StatusMeta>,
  adjustment: {
    Draft: DRAFT_ENTRY,
    Posted: POSTED_ENTRY,
    Reversed: REVERSED_ENTRY,
  } satisfies Record<AdjustmentStatus, StatusMeta>,
  asset: {
    InStock: { label: 'في المخزن', variant: 'success' },
    Issued: { label: 'مصروف', variant: 'default' },
    InCustody: { label: 'قيد العهدة', variant: 'success' },
    Disposed: { label: 'مستبعد', variant: 'destructive' },
  } satisfies Record<AssetStatusValue, StatusMeta>,
  custody: {
    Active: { label: 'نشطة', variant: 'success' },
    Closed: { label: 'مغلقة', variant: 'outline' },
  } satisfies Record<CustodyStatusValue, StatusMeta>,
  'inventory-count': {
    Planned: { label: 'مخطط', variant: 'warning' },
    InProgress: { label: 'جارٍ', variant: 'success' },
    Completed: { label: 'مكتمل', variant: 'default', icon: IconCheck },
    Closed: { label: 'مغلق', variant: 'outline' },
    Aborted: { label: 'ملغي', variant: 'destructive' },
  } satisfies Record<InventoryCountStatusValue, StatusMeta>,
  record: {
    Active: { label: 'نشط', variant: 'success' },
    Inactive: { label: 'غير نشط', variant: 'outline' },
  } satisfies Record<RecordStatusValue, StatusMeta>,
  user: {
    Active: { label: 'نشط', variant: 'success' },
    Suspended: { label: 'موقوف', variant: 'critical' },
  } satisfies Record<UserAccountStatusValue, StatusMeta>,
  // D-OPEN-02 warehouse initialization state (PRD §6.2, §6.4, §6.10, §6.12).
  // Lives here rather than in the warehouse module because
  // `docs/design-tokens.md` forbids a feature component owning its own
  // status-color switch; the module badge delegates instead.
  'warehouse-initialization': {
    NotInitialized: { label: 'غير مهيأ', variant: 'warning' },
    Initialized: { label: 'مهيأ (بحركة)', variant: 'success' },
    ZeroStock: { label: 'مهيأ (بدون حركة)', variant: 'default' },
    Reversed: REVERSED_ENTRY,
  } satisfies Record<WarehouseInitializationStatusValue, StatusMeta>,
}

const UNKNOWN_LABEL = 'غير معروف'

type StatusBadgeProps = {
  entity: StatusEntity
  icon?: boolean
  label?: string
  status: StatusValue
  variant?: BadgeProps['variant']
}

function StatusBadge({ entity, icon = true, label, status, variant }: StatusBadgeProps) {
  const meta = STATUS_REGISTRY[entity][status]
  const resolvedVariant = variant ?? meta?.variant ?? 'outline'
  const resolvedLabel = label ?? meta?.label ?? UNKNOWN_LABEL
  const StatusIcon = icon ? meta?.icon : undefined

  return (
    <Badge variant={resolvedVariant} data-status={status}>
      {StatusIcon ? <StatusIcon data-slot="status-badge-icon" aria-hidden /> : null}
      {resolvedLabel}
    </Badge>
  )
}

export { StatusBadge, type StatusBadgeProps, type StatusEntity, type StatusValue }
