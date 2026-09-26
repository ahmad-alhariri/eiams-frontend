import { useId, useMemo, type ReactNode } from 'react'

import { cn } from '@/shared/utils/class-names'

export interface ReportsTabDefinition<K extends string> {
  /** Stable key — used for selection state and test queries. */
  key: K
  /** Arabic label for the tab button. */
  labelAr: string
  /** Panel content rendered when this tab is active. */
  content: ReactNode
}

export interface ReportsTabsProps<K extends string> {
  /** Tab definitions in display order. The first entry is the default selection. */
  tabs: ReadonlyArray<ReportsTabDefinition<K>>
  /** Currently active tab key. */
  activeKey: K
  /** Fired when the user selects a different tab. */
  onTabChange: (key: K) => void
  /** Optional className for the outer wrapper. */
  className?: string
}

/**
 * Reports-page tablist (WAI-ARIA `tabs` pattern, RTL). Module-local because
 * no other feature module currently needs it; promote to `@/shared/ui/tabs`
 * once a second consumer appears.
 *
 * - `role="tablist"` with `aria-orientation="horizontal"`.
 * - Each tab is a `<button role="tab">` with `aria-selected` and `tabindex`
 *   managed for the roving focus pattern.
 * - Each panel is `<section role="tabpanel">` with `aria-labelledby` pointing
 *   to its tab's id.
 * - Arrow-key navigation: ←/→ (or ↑/↓ given RTL logical axes) cycle focus
 *   across tabs and activate on `Space`/`Enter`.
 */
export function ReportsTabs<K extends string>({
  activeKey,
  className,
  onTabChange,
  tabs,
}: ReportsTabsProps<K>) {
  const baseId = useId()

  const activeIndex = useMemo(
    () => tabs.findIndex((tab) => tab.key === activeKey),
    [activeKey, tabs],
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }
    event.preventDefault()
    let nextIndex = index
    if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length
    } else if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length
    }
    const nextTab = tabs[nextIndex]
    if (nextTab !== undefined) {
      onTabChange(nextTab.key)
      const nextButton = document.getElementById(`${baseId}-tab-${nextTab.key}`)
      nextButton?.focus()
    }
  }

  const activeTab = activeIndex >= 0 ? tabs[activeIndex] : tabs[0]

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div
        role="tablist"
        aria-label="أقسام التقارير"
        aria-orientation="horizontal"
        className="flex flex-wrap gap-2 border-b border-border pb-2"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.key === activeKey
          return (
            <button
              key={tab.key}
              id={`${baseId}-tab-${tab.key}`}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`${baseId}-panel-${tab.key}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.key)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70',
              )}
            >
              {tab.labelAr}
            </button>
          )
        })}
      </div>
      {activeTab !== undefined ? (
        <section
          key={activeTab.key}
          id={`${baseId}-panel-${activeTab.key}`}
          role="tabpanel"
          aria-labelledby={`${baseId}-tab-${activeTab.key}`}
          tabIndex={0}
        >
          {activeTab.content}
        </section>
      ) : null}
    </div>
  )
}
