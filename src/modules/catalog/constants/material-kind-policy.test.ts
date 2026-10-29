import { describe, expect, it } from 'vitest'

import { assetNumberPolicy, policyDescription, type MaterialKind } from './material-kind-policy'

/**
 * The three sentences are the copy the material detail page has always shown;
 * the form and the operational screens now render the same strings, so a change
 * here changes every surface at once.
 */
const POLICY_SENTENCES: Record<MaterialKind, string> = {
  Consumable: 'لا تنشأ عهدة بعد الصرف؛ وتنتهي مسؤولية المستودع عند ترحيل سند الصرف.',
  Durable: 'يبقى الأصل ضمن عهدة الجهة حتى إعادته أو استبعاده، ويجوز صرفه أكثر من مرة دون استهلاكه.',
  Asset: 'تُنشأ عهدة إلزامية، ويُسجّل كل أصل في سجل الأصول بمعرّف داخلي للمؤسسة.',
}

describe('material kind policy copy', () => {
  it.each(Object.entries(POLICY_SENTENCES) as [MaterialKind, string][])(
    'maps %s to its exact Arabic sentence',
    (materialKind, sentence) => {
      expect(policyDescription(materialKind)).toBe(sentence)
    },
  )

  it('requires an asset number only for Asset', () => {
    expect(assetNumberPolicy('Asset')).toBe('مطلوب (رقم أصل داخلي)')
    expect(assetNumberPolicy('Consumable')).toBe('غير مطلوب')
    expect(assetNumberPolicy('Durable')).toBe('غير مطلوب')
  })
})
