import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AcquisitionProvenancePanel } from './acquisition-provenance-panel'
import { createAsset, fixtureUuid } from '@/test/msw/factories'

describe('AcquisitionProvenancePanel (e18-t04)', () => {
  it('renders the receipt line id and acquisition/warranty dates', () => {
    const receiptLineId = fixtureUuid(70)
    render(
      <AcquisitionProvenancePanel
        asset={createAsset({
          receiptLineId,
          acquisitionDate: '2024-03-01',
          warrantyExpiry: '2027-03-01',
        })}
      />,
    )

    expect(screen.getByText(receiptLineId)).toBeInTheDocument()
    expect(screen.getByText('2024-03-01')).toBeInTheDocument()
    expect(screen.getByText('2027-03-01')).toBeInTheDocument()
  })

  it('renders em-dash placeholders when provenance fields are explicitly null', () => {
    render(
      <AcquisitionProvenancePanel
        asset={createAsset({ acquisitionDate: null, warrantyExpiry: null })}
      />,
    )

    const dashes = screen.getAllByText('—')
    // receipt line (undefined) + acquisition + warranty placeholders.
    expect(dashes.length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText(/بند الاستلام المرجعي/)).toBeInTheDocument()
  })

  it('shows the empty-state note when no provenance exists at all', () => {
    // A bare fixture carries none of the provenance fields at all.
    render(<AcquisitionProvenancePanel asset={createAsset()} />)

    expect(screen.getByText('لا توجد بيانات اقتناء مسجّلة لهذا الأصل.')).toBeInTheDocument()
    expect(screen.queryByText(/بند الاستلام المرجعي/)).toBeNull()
  })
})
