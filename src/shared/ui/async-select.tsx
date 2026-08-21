import { Combobox } from '@base-ui/react/combobox'
import { IconPlus } from '@tabler/icons-react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

import { DEFAULT_DEBOUNCE_MS, useDebounce } from '@/shared/hooks/use-debounce'
import { cn } from '@/shared/utils/class-names'

export type AsyncSelectOption<T = unknown> = {
  value: string
  label: string
  payload?: T
  disabled?: boolean
}

export type AsyncSelectStatus = 'idle' | 'loading' | 'error' | 'success'

export interface AsyncSelectProps<T> {
  /** The selected option value (controlled). */
  value?: string | null
  /** Called when the selection changes; `option` carries the full option or undefined when cleared. */
  onValueChange: (value: string | null, option: AsyncSelectOption<T> | undefined) => void
  /**
   * Called with the trimmed query whenever the debounced query is >= minQueryLength.
   * Returns the server result; the component renders at most `maxResults` of them.
   */
  loadOptions: (query: string) => Promise<AsyncSelectOption<T>[]>
  /** Query length that triggers a search. Default: 2. */
  minQueryLength?: number
  /** Maximum number of loader results rendered in the panel. Default: 10. */
  maxResults?: number
  /** Placeholder shown when the input is empty. Default: "اكتب للبحث...". */
  placeholder?: string
  /** Disables the control entirely. */
  disabled?: boolean
  /** Shows the selected value while blocking any interaction. */
  readOnly?: boolean
  /** Empty results message. Default: "لا توجد نتائج". */
  emptyMessage?: string
  /** Error message inside the panel. Default: "تعذر البحث في الخيارات". */
  errorMessage?: string
  /** When provided, a trailing "create" row is shown and called with the trimmed query. */
  onCreate?: (query: string) => void
  /** Label factory for the create row. Default: (q) => `إضافة جديد: ${q}`. */
  createLabel?: (query: string) => string
  /** Custom option renderer; defaults to the label with the query substring highlighted. */
  renderOption?: (option: AsyncSelectOption<T>, query: string) => ReactNode
  /** Fired whenever the dropdown panel opens or closes. */
  onOpenChange?: (open: boolean) => void
  /** Standard attributes forwarded to the inner combobox input (id, aria-*, ...). */
  inputProps?: ComponentPropsWithoutRef<'input'>
  className?: string
}

const defaultCreateLabel = (query: string) => `إضافة جديد: ${query}`

/**
 * Highlights the first case-insensitive occurrence of `query` inside `label`
 * using a Mountain Teal <mark>, per ui-design.md §5.2 Autocomplete.
 */
function highlightQuery(label: string, query: string): ReactNode {
  const trimmed = query.trim()
  if (trimmed === '') {
    return label
  }
  const index = label.toLocaleLowerCase().indexOf(trimmed.toLocaleLowerCase())
  if (index === -1) {
    return label
  }
  return (
    <>
      {label.slice(0, index)}
      <mark className="bg-transparent font-semibold text-mountain-teal">
        {label.slice(index, index + trimmed.length)}
      </mark>
      {label.slice(index + trimmed.length)}
    </>
  )
}

/**
 * Generic search-as-you-type option loader.
 *
 * Composed on the Base UI Combobox primitive (Root/Input/List/Item/Popup +
 * Status/Empty), which owns the ARIA combobox semantics and ↑↓/Enter/Escape
 * keyboard navigation (ui-design.md §9.4). The loader result is passed through
 * `items` with `filter={null}` so the server query is never re-filtered
 * client-side.
 *
 * Behaviour notes:
 * - Searches start once the debounced (300ms) trimmed query reaches
 *   `minQueryLength` (default 2). The panel opens only after the loader
 *   publishes results (success or error) for the current query — opening while
 *   loading leaves the combobox with zero items and breaks ArrowDown highlight
 *   tracking (ui-design §5.2 shows the panel with results, not while loading).
 * - Stale responses are discarded via a monotonically increasing request id;
 *   only the latest loader resolution updates the panel.
 * - The last selected option `{ value, label, payload }` is kept internally,
 *   so the input keeps showing the label even after the option list clears
 *   (e.g. after a new search). A `value` set without a known label (fresh
 *   page load) is displayed as its raw value until a matching option loads.
 * - Selecting an option fills the input with its label (Base UI item-press
 *   fill). Because the fill is a genuine input change the debounced effect
 *   re-runs once with the label as query; that request keeps the panel
 *   meaningful during reopen-after-selection (rows matched by the label).
 */
function AsyncSelect<T>({
  value,
  onValueChange,
  loadOptions,
  minQueryLength = 2,
  maxResults = 10,
  placeholder = 'اكتب للبحث...',
  disabled = false,
  readOnly = false,
  emptyMessage = 'لا توجد نتائج',
  errorMessage = 'تعذر البحث في الخيارات',
  onCreate,
  createLabel = defaultCreateLabel,
  renderOption,
  onOpenChange: onOpenChangeProp,
  inputProps,
  className,
}: AsyncSelectProps<T>) {
  const [inputText, setInputText] = useState(value ?? '')
  const [selectedOption, setSelectedOption] = useState<AsyncSelectOption<T> | null>(null)
  const [result, setResult] = useState<{
    query: string
    options: AsyncSelectOption<T>[]
    status: 'success' | 'error'
  } | null>(null)
  const [open, setOpen] = useState(false)
  const [lastControlledValue, setLastControlledValue] = useState(value ?? null)

  const requestIdRef = useRef(0)
  const loadOptionsRef = useRef(loadOptions)
  // Set when the user selects an option so the label re-search that follows
  // (Base UI fills the input with the label) does not pop the panel open again.
  const selectionDismissedRef = useRef(false)
  // True while the user is still typing a query that has not been re-published
  // yet. The panel closes per keystroke (typing closes the panel), and jsdom
  // completes the close transition instantly, so the close-completion's
  // input-to-label sync would wipe the typed text mid-search. The sync is
  // skipped only then; real dismissals (Escape, outside-press, selection) run
  // it and clear the query as intended.
  const retypingRef = useRef(false)

  useEffect(() => {
    loadOptionsRef.current = loadOptions
  })

  // External `value` changes are mirrored into the remembered option and, when
  // the input is not mid-search, into the displayed text (render-adjust pattern).
  const nextValue = value ?? null
  if (nextValue !== lastControlledValue) {
    const showsSelection =
      inputText === '' || inputText === selectedOption?.label || inputText === selectedOption?.value
    if (nextValue === null) {
      if (showsSelection) {
        setInputText('')
      }
      setSelectedOption(null)
    } else {
      const matched = result?.options.find((option) => option.value === nextValue)
      const nextOption =
        matched ??
        (selectedOption?.value === nextValue
          ? selectedOption
          : { value: nextValue, label: nextValue })
      setSelectedOption(nextOption)
      if (showsSelection) {
        setInputText(nextOption.label)
      }
    }
    setLastControlledValue(nextValue)
  }

  const debouncedQuery = useDebounce(inputText, DEFAULT_DEBOUNCE_MS)
  const trimmedQuery = debouncedQuery.trim()
  const queryReady = trimmedQuery.length >= minQueryLength

  // The panel state derives from the result atom instead of being synced from
  // an effect, so no synchronous setState happens inside the effect body.
  const resultMatchesQuery = result != null && result.query === trimmedQuery
  const visibleOptions = resultMatchesQuery ? result.options : []
  const status: AsyncSelectStatus = !queryReady
    ? 'idle'
    : resultMatchesQuery
      ? result.status
      : 'loading'

  // Panel lifecycle: the popup opens only once the loader publishes results
  // for the current query (success or error) — opening while loading leaves
  // the combobox with zero items and breaks ArrowDown highlight tracking
  // (ui-design §5.2 shows the panel with results, not while loading). The open
  // transition happens in the same microtask that publishes the results, so
  // the panel always appears with its options already rendered.
  const openRef = useRef(false)

  useEffect(() => {
    if (disabled || readOnly || queryReady) {
      return
    }
    // Query cleared or control disabled mid-search: close a panel that may
    // still be open from a previous search.
    if (openRef.current) {
      openRef.current = false
      setOpen(false)
      onOpenChangeProp?.(false)
    }
  }, [disabled, readOnly, queryReady, onOpenChangeProp])

  useEffect(() => {
    if (disabled || readOnly || !queryReady) {
      // Invalidate any in-flight request so its resolution cannot publish
      // stale results once the control is disabled or the query shortens.
      requestIdRef.current += 1
      return
    }
    const query = trimmedQuery
    const requestId = ++requestIdRef.current
    loadOptionsRef
      .current(query)
      .then((loaded) => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setResult({ query, options: loaded.slice(0, maxResults), status: 'success' })
        retypingRef.current = false
        if (!openRef.current && !selectionDismissedRef.current) {
          openRef.current = true
          setOpen(true)
          onOpenChangeProp?.(true)
        }
      })
      .catch(() => {
        if (requestId !== requestIdRef.current) {
          return
        }
        setResult({ query, options: [], status: 'error' })
        retypingRef.current = false
        if (!openRef.current && !selectionDismissedRef.current) {
          openRef.current = true
          setOpen(true)
          onOpenChangeProp?.(true)
        }
      })
  }, [trimmedQuery, queryReady, maxResults, disabled, readOnly, onOpenChangeProp])

  function handleInputValueChange(next: string, eventDetails: Combobox.Root.ChangeEventDetails) {
    if (disabled || readOnly) {
      return
    }
    if (eventDetails.reason === 'item-press') {
      // Base UI fills the input with the selected label; the search effect
      // re-runs naturally with the label — no special casing needed.
      setInputText(next)
      selectionDismissedRef.current = true
      openRef.current = false
      setOpen(false)
      return
    }
    // Programmatic clears (Base UI's internal `Event('base-ui')` fallback event)
    // are the input-to-selected-label sync that runs when a popup close
    // completes. jsdom completes the close transition instantly after opening,
    // so a typing-close (panel closes per keystroke) would wipe the query
    // mid-search; browsers only reach the sync after a real close. While the
    // user is still typing (`retypingRef`) the text must survive — the create
    // row commits it. Real dismissals (Escape, outside-press) and real user
    // clears (deleting the text, which carries a genuine native event) pass
    // through and clear as intended.
    if (next === '' && eventDetails.event?.type === 'base-ui' && retypingRef.current) {
      return
    }
    setInputText(next)
    selectionDismissedRef.current = false
    // Typing closes the panel while a new query loads; the loader publish
    // re-opens it. If fresh results already exist for this exact query, keep
    // (or re-open) the panel immediately — no new load is in flight.
    retypingRef.current = true
    const nextMatches =
      result != null && result.query === next.trim() && result.status === 'success'
    if (nextMatches) {
      if (!openRef.current) {
        openRef.current = true
        setOpen(true)
        onOpenChangeProp?.(true)
      }
      return
    }
    if (openRef.current) {
      openRef.current = false
      setOpen(false)
      onOpenChangeProp?.(false)
    }
  }

  function handleRootOpenChange(next: boolean) {
    const canOpen = next && !disabled && !readOnly && inputText.trim().length >= minQueryLength
    openRef.current = canOpen
    setOpen(canOpen)
    onOpenChangeProp?.(canOpen)
  }

  function handleRootValueChange(option: AsyncSelectOption<T> | null) {
    setSelectedOption(option)
    setInputText(option ? option.label : '')
    selectionDismissedRef.current = option != null
    openRef.current = false
    setOpen(false)
    onValueChange(option ? option.value : null, option ?? undefined)
  }

  const renderOptionWithHighlight =
    renderOption ?? ((option: AsyncSelectOption<T>) => highlightQuery(option.label, trimmedQuery))

  return (
    <div className={cn('relative w-full', className)}>
      <Combobox.Root
        items={visibleOptions}
        filter={null}
        disabled={disabled}
        readOnly={readOnly}
        open={open}
        onOpenChange={handleRootOpenChange}
        value={selectedOption}
        onValueChange={handleRootValueChange}
        inputValue={inputText}
        onInputValueChange={handleInputValueChange}
        itemToStringLabel={(option) => option.label}
        isItemEqualToValue={(itemValue, value) => itemValue?.value === value?.value}
      >
        <Combobox.Input
          data-slot="async-select-input"
          {...inputProps}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          aria-disabled={disabled || undefined}
          className="h-10 w-full min-w-0 rounded-md border border-input bg-popover px-3 py-2 text-start text-base text-foreground transition-[color,box-shadow,background-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 read-only:cursor-default read-only:bg-muted/50"
        />
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} align="start" className="isolate z-50">
            <Combobox.Popup className="relative isolate z-50 max-h-64 w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-dropdown outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:duration-150 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-150 motion-reduce:transition-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none">
              <Combobox.Status>
                {status === 'error' ? (
                  <div role="alert" className="px-3 py-2 text-sm text-destructive">
                    {errorMessage}
                  </div>
                ) : null}
              </Combobox.Status>
              <Combobox.Empty>
                {status === 'success' ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">{emptyMessage}</div>
                ) : null}
              </Combobox.Empty>
              <Combobox.List>
                {(item) => {
                  const option = item as AsyncSelectOption<T>
                  return (
                    <Combobox.Item
                      key={option.value}
                      value={option}
                      disabled={option.disabled}
                      className="relative flex w-full min-w-0 cursor-default items-center gap-2 rounded-sm border-s-2 border-transparent py-2 pe-3 ps-3 text-start text-base outline-none select-none data-selected:border-s-accent data-highlighted:bg-muted data-highlighted:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50"
                    >
                      {renderOptionWithHighlight(option, trimmedQuery)}
                    </Combobox.Item>
                  )
                }}
              </Combobox.List>
              {onCreate && status === 'success' ? (
                <div className="border-t border-border pt-1">
                  <button
                    type="button"
                    data-slot="async-select-create"
                    onClick={() => {
                      onCreate(trimmedQuery)
                      openRef.current = false
                      setOpen(false)
                      onOpenChangeProp?.(false)
                    }}
                    className="relative flex w-full min-w-0 cursor-default items-center gap-2 rounded-sm px-3 py-2 text-start text-base text-muted-foreground outline-none transition-colors select-none hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                  >
                    <IconPlus aria-hidden className="size-4 shrink-0 text-mountain-teal" />
                    <span className="truncate">{createLabel(trimmedQuery)}</span>
                  </button>
                </div>
              ) : null}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  )
}

export { AsyncSelect }
