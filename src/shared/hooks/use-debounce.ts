import { useEffect, useState } from 'react'

/** Application-wide debounce window for remote search inputs (see AGENTS.md). */
export const DEFAULT_DEBOUNCE_MS = 300

/**
 * Returns `value` after it has been stable for `delayMs`. Used at the input
 * boundary so remote searches and filter changes are not fired per keystroke.
 */
export function useDebounce<Value>(value: Value, delayMs: number = DEFAULT_DEBOUNCE_MS): Value {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(handle)
  }, [value, delayMs])

  return debouncedValue
}
