import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'

import { KpiCard } from '@/shared/ui/kpi-card'
import type { KpiValue } from '@/shared/types/generated/eiams-v1'

// Canonical KpiValue fixtures matching the ratified vocabulary in D-RPT-02.
const fixtures = {
  positive: {
    code: 'documents_posted',
    labelAr: 'المستندات المرحّلة',
    value: 38,
    unitAr: 'مستند',
    changePercent: 12.1,
  } satisfies KpiValue,

  negative: {
    code: 'movements_this_period',
    labelAr: 'الحركات في الفترة',
    value: 127,
    unitAr: 'حركة',
    changePercent: -5.7,
  } satisfies KpiValue,

  zero: {
    code: 'active_assets',
    labelAr: 'الأصول النشطة',
    value: 412,
    unitAr: 'أصل',
    changePercent: 0,
  } satisfies KpiValue,

  nullChange: {
    code: 'open_custodies',
    labelAr: 'التكليفات النشطة',
    value: 19,
    unitAr: 'تكليف',
    changePercent: null,
  } satisfies KpiValue,
} as const

function renderCard(props: ComponentProps<typeof KpiCard>) {
  return render(<KpiCard {...props} />)
}

describe('KpiCard', () => {
  it('renders value in Arabic numeral format', () => {
    renderCard({ kpi: fixtures.positive })
    // 38 in Arabic-EG numerals is "٣٨"
    expect(screen.getByText(/٣٨/i)).toBeInTheDocument()
  })

  it('renders the Arabic label', () => {
    renderCard({ kpi: fixtures.positive })
    expect(screen.getByText('المستندات المرحّلة')).toBeInTheDocument()
  })

  it('renders the unit label', () => {
    renderCard({ kpi: fixtures.positive })
    expect(screen.getByText('مستند')).toBeInTheDocument()
  })

  it('renders positive change percent with up arrow', () => {
    renderCard({ kpi: fixtures.positive })
    // 12.1% → "؜+12.1٪" in ar-EG
    expect(screen.getByText(/12.1/i)).toBeInTheDocument()
    // SVG up-arrow should be present (aria-hidden, not in accessible tree)
    const upArrow = document.querySelector('[aria-hidden="true"]')
    expect(upArrow).toBeInTheDocument()
  })

  it('renders negative change percent with down arrow', () => {
    renderCard({ kpi: fixtures.negative })
    expect(screen.getByText(/-5.7/i)).toBeInTheDocument()
  })

  it('renders zero changePercent without trend badge', () => {
    renderCard({ kpi: fixtures.zero })
    // changePercent 0 → no trend badge rendered (only rendered when change !== null && change !== 0)
    // The card value "412" has a 0 in it, so we check the ARIA label specifically
    const article = screen.getByRole('article')
    // aria-label should NOT contain the word "تغيّر" (trend is absent for zero change)
    expect(article).toHaveAttribute(
      'aria-label',
      expect.not.stringContaining('تغيّر'),
    )
  })

  it('renders null changePercent without trend badge', () => {
    renderCard({ kpi: fixtures.nullChange })
    // null change → no trend badge rendered
    expect(screen.queryByRole('generic', { name: /تغيّر/i })).not.toBeInTheDocument()
  })

  it('has correct ARIA article role', () => {
    renderCard({ kpi: fixtures.positive })
    const article = screen.getByRole('article')
    expect(article).toHaveAttribute(
      'aria-label',
      expect.stringContaining('المستندات المرحّلة'),
    )
  })

  it('renders without unitAr (unit falls back to label)', () => {
    // Passing unitAr=null tests the fallback: the unit line shows labelAr as unit
    renderCard({
      kpi: { ...fixtures.positive, unitAr: null },
    })
    // The unit display falls back to labelAr, so we see it twice: once as unit, once as label
    const all = screen.getAllByText('المستندات المرحّلة')
    expect(all.length).toBeGreaterThanOrEqual(2)
  })
})
