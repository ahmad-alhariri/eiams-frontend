import { useMemo } from 'react'
import { useWatch, type Control } from 'react-hook-form'

import {
  countLineDraftField,
  type CountLineDraftFieldName,
} from '@/modules/inventory-count/components/count-quantity-workspace.model'
import type {
  CountLineDraftValues,
  CountLineEntryFormValues,
} from '@/modules/inventory-count/schemas/count-line-entry.schemas'

/**
 * Draft-state readers for the count quantity-entry page (hbfu).
 *
 * React Hook Form's `useWatch` yields a deep-partial value, so both readers
 * normalize it back into the complete draft shape the page and its cells
 * expect. They live outside the cell components so the cell module exports
 * components only (react-refresh) and so the owning workspace can read its own
 * form without a context round-trip.
 */

/** The whole page's drafts; missing rows read as empty drafts. */
export function useCountLineDrafts(
  control: Control<CountLineEntryFormValues>,
): CountLineDraftValues[] {
  const watched = useWatch({ control })
  const rows = watched.lines
  return useMemo(
    () =>
      (rows ?? []).map((draft) => ({
        actualQuantity: draft?.actualQuantity ?? '',
        reason: draft?.reason ?? '',
      })),
    [rows],
  )
}

/** One row's field value as a plain string. */
export function useCountLineDraftValue(
  control: Control<CountLineEntryFormValues>,
  index: number,
  field: CountLineDraftFieldName,
): string {
  const watched = useWatch({ control, name: countLineDraftField(field, index) })
  return typeof watched === 'string' ? watched : ''
}
