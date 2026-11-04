import { formatNumber } from '@/shared/utils/arabic-numbers'

/**
 * Synthetic control for the RTL copy fence.
 *
 * Every case here is intentional. The file lives outside the scanned
 * production set (src/test/** is out of scope) but inside the TypeScript
 * program, so the numeric detector can type-check it exactly like production
 * code. Each detector must report exactly the offenders marked below.
 */
export function RtlCopyAuditControl({ quantity }: { quantity: number }) {
  return (
    <div>
      {/* OFFENDER: a number interpolated into prose. */}
      <p>الكمية {quantity}</p>
      {/* Clean: the house formatter renders Arabic-Indic digits. */}
      <p>الكمية {formatNumber(quantity)}</p>
      {/* Clean: an explicit left-to-right run. */}
      <p dir="ltr">{quantity}</p>
      {/* OFFENDER: untranslated English copy in a user-visible attribute. */}
      <input placeholder="Save the document" />
      {/* Clean: Arabic copy, and a technical example. */}
      <input placeholder="حفظ المستند" />
      <input placeholder="user@eiams.local" />
    </div>
  )
}
