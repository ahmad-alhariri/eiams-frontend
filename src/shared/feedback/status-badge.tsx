import { IconCheck, type Icon } from '@tabler/icons-react'

import { Badge, type BadgeProps } from '@/shared/ui/badge'

type DocumentStatusValue = 'Draft' | 'Submitted' | 'Posted' | 'Reversed' | 'Cancelled' | 'Rejected'
type AdjustmentStatusValue = 'Draft' | 'Posted' | 'Reversed'
type AssetStatusValue = 'InStock' | 'Issued' | 'InCustody' | 'Disposed'
type CustodyStatusValue = 'Active' | 'Closed'
type InventoryCountStatusValue = 'Planned' | 'InProgress' | 'Completed' | 'Closed'
type RecordStatusValue = 'Active' | 'Inactive'
type UserAccountStatusValue = 'Active' | 'Suspended'

type StatusEntity =
  'document' | 'adjustment' | 'asset' | 'custody' | 'inventory-count' | 'record' | 'user'

type StatusValue =
  | DocumentStatusValue
  | AdjustmentStatusValue
  | AssetStatusValue
  | CustodyStatusValue
  | InventoryCountStatusValue
  | RecordStatusValue
  | UserAccountStatusValue

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
  } satisfies Record<AdjustmentStatusValue, StatusMeta>,
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
  } satisfies Record<InventoryCountStatusValue, StatusMeta>,
  record: {
    Active: { label: 'نشط', variant: 'success' },
    Inactive: { label: 'غير نشط', variant: 'outline' },
  } satisfies Record<RecordStatusValue, StatusMeta>,
  user: {
    Active: { label: 'نشط', variant: 'success' },
    Suspended: { label: 'موقوف', variant: 'critical' },
  } satisfies Record<UserAccountStatusValue, StatusMeta>,
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
