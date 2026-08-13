import { useState } from 'react'

import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'

interface WarehousePayload {
  code: string
  region: string
}

const demoWarehouses: AsyncSelectOption<WarehousePayload>[] = [
  { value: 'wh-damascus', label: 'مستودع دمشق الرئيسي', payload: { code: 'W-01', region: 'دمشق' } },
  { value: 'wh-aleppo', label: 'مستودع حلب', payload: { code: 'W-02', region: 'حلب' } },
  { value: 'wh-homs', label: 'مستودع حمص', payload: { code: 'W-03', region: 'حمص' } },
  { value: 'wh-lattakia', label: 'مستودع اللاذقية', payload: { code: 'W-04', region: 'اللاذقية' } },
  { value: 'wh-tartus', label: 'مستودع طرطوس', payload: { code: 'W-05', region: 'طرطوس' } },
  { value: 'wh-hama', label: 'مستودع حماة', payload: { code: 'W-06', region: 'حماة' } },
  { value: 'wh-raqqa', label: 'مستودع الرقة', payload: { code: 'W-07', region: 'الرقة' } },
  { value: 'wh-hasakah', label: 'مستودع الحسكة', payload: { code: 'W-08', region: 'الحسكة' } },
  {
    value: 'wh-deirzzor',
    label: 'مستودع دير الزور',
    payload: { code: 'W-09', region: 'دير الزور' },
  },
  { value: 'wh-daraa', label: 'مستودع درعا', payload: { code: 'W-10', region: 'درعا' } },
  { value: 'wh-quneitra', label: 'مستودع القنيطرة', payload: { code: 'W-11', region: 'القنيطرة' } },
  { value: 'wh-sweida', label: 'مستودع السويداء', payload: { code: 'W-12', region: 'السويداء' } },
]

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function loadWarehouses(query: string): Promise<AsyncSelectOption<WarehousePayload>[]> {
  await delay(400)
  const normalized = query.trim().toLocaleLowerCase()
  return demoWarehouses.filter(
    (option) =>
      option.label.toLocaleLowerCase().includes(normalized) ||
      option.payload?.code.toLocaleLowerCase().includes(normalized),
  )
}

export function AsyncSelectDemo() {
  const [selected, setSelected] = useState<{
    value: string | null
    label: string
  }>({ value: null, label: 'لا شيء' })
  const [createdQueries, setCreatedQueries] = useState<string[]>([])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          يبدأ البحث بعد حرفين مع مهلة ٣٠٠ مللي ثانية، ويعرض حتى ١٠ نتائج مع تمييز المطابقة والتنقل
          بلوحة المفاتيح (↑ ↓) وزر «إضافة جديد» عند الحاجة.
        </p>
        <AsyncSelect<WarehousePayload>
          value={selected.value}
          onValueChange={(value, option) =>
            setSelected({ value, label: option?.label ?? 'لا شيء' })
          }
          loadOptions={loadWarehouses}
          onCreate={(query) => setCreatedQueries((queries) => [...queries, query])}
          placeholder="اكتب اسم المستودع للبحث..."
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          المحدد حالياً: {selected.label} — طلبات إنشاء جديدة: {createdQueries.length || 'لا شيء'}
        </p>
      </div>
    </div>
  )
}
