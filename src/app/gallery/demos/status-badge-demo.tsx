/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo */
import {
  StatusBadge,
  type StatusBadgeProps,
  type StatusEntity,
  type StatusValue,
} from '@/shared/feedback/status-badge'
import type { GallerySection } from '@/app/gallery/gallery-sections'

const ENTITY_SAMPLES: { entity: StatusEntity; label: string; statuses: StatusValue[] }[] = [
  {
    entity: 'document',
    label: 'وثيقة مخزنية',
    statuses: ['Draft', 'Submitted', 'Posted', 'Reversed', 'Cancelled', 'Rejected'],
  },
  { entity: 'adjustment', label: 'تسوية', statuses: ['Draft', 'Posted', 'Reversed'] },
  { entity: 'asset', label: 'أصل', statuses: ['InStock', 'Issued', 'InCustody', 'Disposed'] },
  { entity: 'custody', label: 'عهدة', statuses: ['Active', 'Closed'] },
  {
    entity: 'inventory-count',
    label: 'جرد',
    statuses: ['Planned', 'InProgress', 'Completed', 'Closed'],
  },
  { entity: 'record', label: 'سجل', statuses: ['Active', 'Inactive'] },
  { entity: 'user', label: 'مستخدم', statuses: ['Active', 'Suspended'] },
]

function StatusBadgeDemo() {
  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {ENTITY_SAMPLES.map((sample) => (
        <div key={sample.entity} className="flex flex-wrap items-center gap-2">
          <span className="w-40 shrink-0 text-sm font-semibold text-charcoal">{sample.label}</span>
          {sample.statuses.map((status) => (
            <StatusBadge key={status} entity={sample.entity} status={status} />
          ))}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 border-t border-row-divider pt-4">
        <span className="w-40 shrink-0 text-sm font-semibold text-charcoal">قيمة غير معروفة</span>
        <StatusBadge entity="document" status={'MysteryStatus' as StatusBadgeProps['status']} />
        <StatusBadge entity="document" status="Posted" icon={false} />
      </div>
    </div>
  )
}

export const statusBadgeGallerySections: GallerySection[] = [
  {
    id: 'status-badge',
    titleAr: 'شارة الحالة (StatusBadge)',
    descriptionAr:
      'شارة موحّدة لكيانات النظام السبعة (وثيقة، تسوية، أصل، عهدة، جرد، سجل، مستخدم) بتسميات وألوان عربية؛ الحالات غير المعروفة تظهر «غير معروف» بإطار خارجي.',
    render: () => <StatusBadgeDemo />,
  },
]
