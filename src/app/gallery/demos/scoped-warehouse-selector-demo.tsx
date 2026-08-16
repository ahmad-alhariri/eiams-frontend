import { useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import type { AsyncSelectOption } from '@/shared/ui/async-select'
import { AsyncSelect } from '@/shared/ui/async-select'
import type { Warehouse } from '@/shared/types/generated/eiams-v1'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value}</dd>
    </div>
  )
}

function SelectedWarehouseDetails({ option }: { option: AsyncSelectOption<Warehouse> | null }) {
  if (option === null || option.payload === undefined) {
    return <p className="text-xs text-muted-foreground">لم يتم اختيار مستودع بعد.</p>
  }
  const warehouse = option.payload
  return (
    <dl className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <DetailRow label="الكود" value={warehouse.code} />
      <DetailRow label="الموقع التفصيلي" value={warehouse.locationAr ?? '—'} />
      <DetailRow label="المبنى التابع" value={warehouse.site.displayName} />
      <DetailRow label="الحالة" value={warehouse.status === 'Active' ? 'نشط' : 'غير نشط'} />
    </dl>
  )
}

/**
 * Dev-only surface for the scope-bound warehouse selector: the loader is the
 * production hook (active scope + contract search), served by the dev mock
 * API, so QA can verify scope readiness, server-side search, and the
 * inactive-option state without a real backend.
 */
function ScopedWarehouseSelectorDemo() {
  const [warehouse, setWarehouse] = useState<AsyncSelectOption<Warehouse> | null>(null)
  const selector = useScopedWarehouseSelector()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        محدد مستودع مرتبط بنطاق العمل النشط: البحث يجري في الخادم عبر واجهة /warehouses، والمستودعات
        غير النشطة تظهر معطّلة، ويبقى المحدد معطّلاً بالكامل حتى يُختار نطاق.
      </p>
      <div className="flex flex-col gap-3">
        <AsyncSelect<Warehouse>
          value={warehouse?.value ?? null}
          onValueChange={(_value, option) => setWarehouse(option ?? null)}
          loadOptions={selector.loadOptions}
          disabled={!selector.scopeReady}
          placeholder={
            selector.scopeReady ? 'اكتب اسم المستودع للبحث...' : 'بانتظار اختيار النطاق...'
          }
          renderOption={(option) => (
            <span className="flex w-full items-center justify-between gap-2">
              <span className="truncate">{option.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {option.payload?.code ?? '—'}
              </span>
            </span>
          )}
          className="max-w-md"
        />
        <SelectedWarehouseDetails option={warehouse} />
      </div>
    </div>
  )
}

export const scopedWarehouseSelectorGallerySections: GallerySection[] = [
  {
    id: 'scoped-warehouse-selector',
    titleAr: 'محدد المستودع المرتبط بالنطاق (useScopedWarehouseSelector)',
    descriptionAr:
      'الربط الإنتاجي لمحوّل المستودع بنطاق العمل النشط: بحث خادمي، تعطيل الخيارات غير النشطة، وتعطيل المحدد قبل اختيار النطاق.',
    render: () => <ScopedWarehouseSelectorDemo />,
  },
]
