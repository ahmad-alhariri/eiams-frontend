/* eslint-disable react-refresh/only-export-components -- the pure parse helpers are exported for the model suite */
import { useId } from 'react'

import { Button } from '@/shared/ui/button'
import { Textarea } from '@/shared/ui/textarea'
import { toArabicDigits } from '@/shared/utils/format'

/**
 * Bulk serial capture for an asset line (o098.3): a pasted or scanned LIST of
 * manufacturer serial numbers becomes one asset unit per serial. The parsing
 * and the rejection rules live in {@link parseSerialList} so they are testable
 * without rendering; this component only renders the capture text it is given
 * and hands the accepted serials back to the owning row.
 *
 * shortcut: durable lines (Durable kind + Serial tracking) still carry ONE
 * `batchNumber` on the wire and the backend mints the per-unit
 * `TrackedMaterialUnit` identity at issue time, so per-unit serials for a
 * durable cannot be expressed in v1; upgrade by adding a per-unit
 * `batchNumber` array to the line contract.
 */

/** `assetInputSchema.serialNumber` max length — VARCHAR(200) in the contract. */
export const SERIAL_MAX_LENGTH = 200

const REASON_TOO_LONG = 'أطول من الحد المسموح (200 حرف)'
const REASON_DUPLICATE = 'مكرر داخل القائمة'
const REASON_DUPLICATE_ON_LINE = 'مكرر في هذا البند'
const REASON_USED_ELSEWHERE = 'مستخدم في بند آخر'

/** Newlines, commas and semicolons separate entries; spaces are part of a serial. */
const SERIAL_SEPARATOR_PATTERN = /[\n,;]+/

export interface SerialCaptureRejection {
  value: string
  reasonAr: string
}

export interface SerialCaptureResult {
  /** Accepted serials in input order, trimmed, no duplicates (case-insensitive). */
  serials: string[]
  rejected: SerialCaptureRejection[]
}

function serialKey(serial: string): string {
  return serial.toLowerCase()
}

/** Non-empty serials carried by a line's units, trimmed, in unit order. */
export function serialsOfUnits(units: readonly { serialNumber?: string | undefined }[]): string[] {
  return units.flatMap((unit) => {
    const serial = (unit.serialNumber ?? '').trim()
    return serial === '' ? [] : [serial]
  })
}

/**
 * Splits a pasted/scanned capture text into asset serial numbers and reports
 * every rejected entry with an Arabic reason. A serial is rejected when it is
 * longer than the contract limit, repeats an earlier entry of the same list,
 * already sits on the SAME row (a second unit would duplicate the manufacturer
 * serial — the backend has no unique index for it), or is used by another line
 * of the document.
 */
export function parseSerialList(
  raw: string,
  alreadyUsed: readonly string[] = [],
  usedOnThisLine: readonly string[] = [],
): SerialCaptureResult {
  const usedElsewhere = new Set(alreadyUsed.map(serialKey))
  const usedHere = new Set(usedOnThisLine.map(serialKey))
  const seen = new Set<string>()
  const serials: string[] = []
  const rejected: SerialCaptureRejection[] = []

  for (const entry of raw.split(SERIAL_SEPARATOR_PATTERN)) {
    const value = entry.trim()
    if (value === '') {
      continue
    }
    const key = serialKey(value)
    if (value.length > SERIAL_MAX_LENGTH) {
      rejected.push({ value, reasonAr: REASON_TOO_LONG })
    } else if (seen.has(key)) {
      rejected.push({ value, reasonAr: REASON_DUPLICATE })
    } else if (usedHere.has(key)) {
      rejected.push({ value, reasonAr: REASON_DUPLICATE_ON_LINE })
    } else if (usedElsewhere.has(key)) {
      rejected.push({ value, reasonAr: REASON_USED_ELSEWHERE })
    } else {
      seen.add(key)
      serials.push(value)
    }
  }

  return { serials, rejected }
}

/**
 * Serials captured by every line except `lineIndex`: a serial already used by
 * another line of the same document cannot be captured again.
 */
export function serialsOfOtherLines(
  serialsByLine: readonly (readonly string[])[],
  lineIndex: number,
): string[] {
  return serialsByLine.flatMap((serials, index) => (index === lineIndex ? [] : serials))
}

export interface SerialCaptureFieldProps {
  /** Raw capture text, owned by the parent row. */
  value: string
  /** Serials already captured by the other lines of the same document. */
  alreadyUsed: readonly string[]
  /** Serials already on the units of THIS row — capturing one again is refused. */
  usedOnThisLine: readonly string[]
  disabled?: boolean
  onValueChange: (value: string) => void
  /**
   * Hands the whole parse result to the parent: the accepted serials become one
   * unit each and the refused ones stay in the capture text with their reasons.
   */
  onApply: (result: SerialCaptureResult) => void
}

/**
 * Presentational bulk serial capture: a capture textarea, a live summary, the
 * per-serial rejected list with its Arabic reasons, and the apply action. It
 * never touches the form; the row owns the text and the units.
 */
export function SerialCaptureField({
  value,
  alreadyUsed,
  usedOnThisLine,
  disabled = false,
  onValueChange,
  onApply,
}: SerialCaptureFieldProps) {
  const fieldId = useId()
  const hintId = `${fieldId}-hint`
  const { serials, rejected } = parseSerialList(value, alreadyUsed, usedOnThisLine)

  return (
    <div
      data-slot="serial-capture-field"
      className="grid gap-2 rounded-md border border-dashed border-border p-3"
    >
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        التقاط الأرقام التسلسلية
      </label>
      <p id={hintId} className="text-sm text-muted-foreground">
        سطر واحد لكل رقم تسلسلي، أو افصل بينها بفاصلة
      </p>
      <Textarea
        id={fieldId}
        dir="ltr"
        className="text-start"
        placeholder={`SN-1001\nSN-1002`}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {/* One live region for the count AND the refused serials: announcing the
          count alone tells a screen reader that entries were refused but not
          which ones or why. A plain aria-live keeps a single role="status" page
          (the capability gate) unchanged. */}
      <div data-slot="serial-capture-status" aria-live="polite" className="grid gap-1">
        <p className="text-sm text-muted-foreground">
          {/* Numeral policy (design-tokens.md §11): the counts are Arabic copy,
              so they read in Arabic-Indic digits like every other count. */}
          {`تم التقاط ${toArabicDigits(serials.length)} رقماً تسلسلياً، ورُفض ${toArabicDigits(rejected.length)}`}
        </p>
        {rejected.length > 0 ? (
          <ul className="grid gap-1 text-sm text-destructive">
            {rejected.map((entry, entryIndex) => (
              <li key={`${entryIndex}-${entry.value}`}>{`${entry.value}: ${entry.reasonAr}`}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={disabled || serials.length === 0}
        onClick={() => onApply({ serials, rejected })}
      >
        تطبيق على الوحدات
      </Button>
    </div>
  )
}
