import type { Material } from '@/modules/catalog/types/catalog.types'

export type MaterialKind = Material['materialKind']

/**
 * D-MAT-01 custody consequence of each `MaterialKind`. The wording is the copy
 * the material detail page has always shipped; the form and the operational
 * screens reuse it verbatim rather than paraphrasing the same policy.
 */
export function policyDescription(materialKind: MaterialKind): string {
  switch (materialKind) {
    case 'Consumable':
      return 'لا تنشأ عهدة بعد الصرف؛ وتنتهي مسؤولية المستودع عند ترحيل سند الصرف.'
    case 'Durable':
      return 'يبقى الأصل ضمن عهدة الجهة حتى إعادته أو استبعاده، ويجوز صرفه أكثر من مرة دون استهلاكه.'
    case 'Asset':
      return 'تُنشأ عهدة إلزامية، ويُسجّل كل أصل في سجل الأصول بمعرّف داخلي للمؤسسة.'
  }
}

export function assetNumberPolicy(materialKind: MaterialKind): string {
  return materialKind === 'Asset' ? 'مطلوب (رقم أصل داخلي)' : 'غير مطلوب'
}

/**
 * Wire payloads type `materialKind` as a plain string (custody rows and
 * quantity-line state), so a display-only helper narrows before indexing the
 * Arabic label map.
 */
export function isMaterialKind(value: string | null | undefined): value is MaterialKind {
  return value === 'Consumable' || value === 'Durable' || value === 'Asset'
}
