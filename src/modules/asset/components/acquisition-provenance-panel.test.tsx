import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AcquisitionProvenancePanel } from './acquisition-provenance-panel'
import type { AssetDetails } from '@/modules/asset/types/asset.types'
import { formatDate } from '@/shared/utils/format'

/** The LIVE `GET /assets/{assetId}` row. */
function assetDetails(overrides: Partial<AssetDetails> = {}): AssetDetails {
  return {
    id: '77777777-7777-4777-8777-777777777777',
    assetNumber: 'AST-2024-C01',
    serialNumber: 'SN-PC-0001',
    materialId: '22222222-2222-4222-8222-222222222222',
    materialCode: 'IT-HW-PC-001',
    materialNameAr: 'حاسوب مكتبي',
    materialNameEn: null,
    warehouseId: '33333333-3333-4333-8333-333333333333',
    warehouseCode: 'WH-CENTRAL',
    warehouseName: 'المستودع المركزي',
    currentStatus: 'InStock',
    activeCustodyId: null,
    holderType: null,
    holderId: null,
    custodyKind: null,
    latestMovementType: null,
    latestMovementAtUtc: null,
    receiptLineId: null,
    receiptDocumentId: null,
    receiptDocumentReference: null,
    acquisitionDate: '2024-03-01',
    warrantyExpiry: null,
    rowVersion: 1,
    ...overrides,
  }
}

describe('AcquisitionProvenancePanel', () => {
  it('renders the receipt document, its line and the acquisition/warranty dates', () => {
    render(
      <AcquisitionProvenancePanel
        asset={assetDetails({
          receiptLineId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          receiptDocumentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          receiptDocumentReference: 'EIAMS-RCV-2026-0001',
          acquisitionDate: '2024-03-01',
          warrantyExpiry: '2027-03-01',
        })}
      />,
    )

    expect(screen.getByText('EIAMS-RCV-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBeInTheDocument()
    // The DateOnly fields go through the shared date formatter, like every
    // other date surface in the module.
    expect(screen.getByText(formatDate('2024-03-01'))).toBeInTheDocument()
    expect(screen.getByText(formatDate('2027-03-01'))).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('2024-03-01')
    expect(document.body.textContent).not.toContain('2027-03-01')
  })

  it('renders em-dash placeholders for the receipt fields the server sends as null', () => {
    render(
      <AcquisitionProvenancePanel
        asset={assetDetails({
          receiptDocumentReference: 'EIAMS-RCV-2026-0001',
          receiptLineId: null,
          receiptDocumentId: null,
          warrantyExpiry: null,
        })}
      />,
    )

    // The receipt line and the warranty expiry placeholders.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('EIAMS-RCV-2026-0001')).toBeInTheDocument()
    expect(screen.getByText('سند الاستلام المرجعي')).toBeInTheDocument()
  })

  it('shows the empty-state note when the server recorded no receipt at all', () => {
    render(
      <AcquisitionProvenancePanel
        asset={assetDetails({
          receiptLineId: null,
          receiptDocumentId: null,
          receiptDocumentReference: null,
        })}
      />,
    )

    expect(screen.getByText('لا توجد بيانات اقتناء مسجّلة لهذا الأصل.')).toBeInTheDocument()
  })
})
