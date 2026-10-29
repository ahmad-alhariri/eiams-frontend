import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { FormProvider, useForm, useWatch, type Resolver, type UseFormReturn } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { fixtureUuid } from '@/test/msw/factories'
import {
  createEmptyQuantityLine,
  documentLinesSchema,
  type DocumentLinesContainer,
} from '@/shared/documents/schemas/document-lines.schemas'
import type { ReturnEligibleItem } from '@/modules/custody/types/return.types'
import { formatNumber } from '@/shared/utils/format'
import { ReturnLineAssetSelector } from './return-line-asset-selector'

const ISSUE_DOC_ID = fixtureUuid(155)
const MATERIAL_ID = fixtureUuid(41)
const DURABLE_QTY_MATERIAL_ID = fixtureUuid(43)
const DURABLE_SERIAL_MATERIAL_ID = fixtureUuid(44)
const ASSET_A_ID = fixtureUuid(60)
const ASSET_B_ID = fixtureUuid(61)

function eligibleAsset(assetSequence: number, subjectId: string): ReturnEligibleItem {
  return {
    subjectType: 'Asset',
    subjectId,
    materialId: MATERIAL_ID,
    materialNameAr: 'حاسوب محمول',
    materialNameEn: 'Laptop Computer',
    materialCode: 'IT-HW-01',
    materialKind: 'Asset',
    trackingType: 'Serial',
    serialNumber: `SN-${assetSequence}`,
    assetNumber: `AST-2026-${assetSequence.toString().padStart(4, '0')}`,
    availableQuantity: 1,
    issuedQuantity: 1,
  }
}

function eligibleQuantity(availableQuantity: number, issuedQuantity = 10): ReturnEligibleItem {
  return {
    subjectType: 'MaterialQuantity',
    subjectId: fixtureUuid(71),
    materialId: DURABLE_QTY_MATERIAL_ID,
    materialNameAr: 'أسطوانة غاز',
    materialNameEn: 'Gas Cylinder',
    materialCode: 'DUR-GAS-01',
    materialKind: 'Durable',
    trackingType: 'Quantity',
    serialNumber: null,
    assetNumber: null,
    availableQuantity,
    issuedQuantity,
  }
}

function eligibleUnit(serialNumber: string, subjectId: string): ReturnEligibleItem {
  return {
    subjectType: 'TrackedUnit',
    subjectId,
    materialId: DURABLE_SERIAL_MATERIAL_ID,
    materialNameAr: 'جهاز قياس',
    materialNameEn: 'Measuring Device',
    materialCode: 'DUR-MEAS-01',
    materialKind: 'Durable',
    trackingType: 'Serial',
    serialNumber,
    assetNumber: null,
    availableQuantity: 1,
    issuedQuantity: 1,
  }
}

const ELIGIBLE_ASSETS = [eligibleAsset(1, ASSET_A_ID), eligibleAsset(2, ASSET_B_ID)]
const ELIGIBLE_UNITS = [eligibleUnit('SN-DUR-0001', fixtureUuid(72))]

function createLine(
  materialId: string,
  materialKind: string,
  overrides: Partial<DocumentLinesContainer['lines'][number]> = {},
): DocumentLinesContainer['lines'][number] {
  return {
    ...createEmptyQuantityLine(),
    materialId,
    materialNameAr: 'مادة اختبار',
    materialKind,
    materialDomainId: '00000000-0000-4000-8000-000000000020',
    quantity: 2,
    ...overrides,
  }
}

function createAssetKindLine(
  overrides: Partial<DocumentLinesContainer['lines'][number]> = {},
): DocumentLinesContainer['lines'][number] {
  return createLine(MATERIAL_ID, 'Asset', overrides)
}

/** RHF host exposing the form (`lines` container) the selector mutates. */
function createHost(initialLines: DocumentLinesContainer['lines']) {
  function Host({ children }: { children: ReactNode }) {
    const created = useForm<DocumentLinesContainer>({
      resolver: zodResolver(
        z.object({ lines: documentLinesSchema }),
      ) as Resolver<DocumentLinesContainer>,
      defaultValues: { lines: initialLines },
      mode: 'onSubmit',
    })
    return (
      <FormProvider {...created}>
        <form aria-label="test-form" onSubmit={(event) => event.preventDefault()}>
          {children}
          <LinesOutput form={created} />
        </form>
      </FormProvider>
    )
  }
  return { Host }
}

function LinesOutput({ form }: { form: UseFormReturn<DocumentLinesContainer> }) {
  const lines = useWatch({ control: form.control, name: 'lines' })
  return <pre data-slot="document-lines-values">{JSON.stringify(lines)}</pre>
}

function linesValue(): DocumentLinesContainer['lines'] {
  const slot = document.querySelector('[data-slot="document-lines-values"]')
  return slot === null
    ? []
    : (JSON.parse(slot.textContent ?? '[]') as DocumentLinesContainer['lines'])
}

describe('ReturnLineAssetSelector (FIX-R2 / o098.5)', () => {
  it('renders nothing unless the line carries an Asset or Durable material', () => {
    const { Host } = createHost([
      createEmptyQuantityLine(),
      createLine(fixtureUuid(42), 'Consumable'),
    ])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={ELIGIBLE_ASSETS}
          isLoading={false}
        />
        <ReturnLineAssetSelector
          index={1}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={ELIGIBLE_ASSETS}
          isLoading={false}
        />
      </Host>,
    )
    expect(document.querySelector('[data-slot="return-line-asset-selector"]')).toBeNull()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('hints to choose the original issue first for an Asset line', () => {
    const { Host } = createHost([createAssetKindLine()])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={undefined}
          items={[]}
          isLoading={false}
        />
      </Host>,
    )

    expect(
      screen.getByText('اختر سند الصرف الأصلي أولاً لعرض الأصول المستردة ضمن هذا البند.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('writes the picked asset subjectIds into lines.<index>.assetIds and flags mismatches', async () => {
    const user = userEvent.setup()
    const { Host } = createHost([createAssetKindLine()])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={ELIGIBLE_ASSETS}
          isLoading={false}
        />
      </Host>,
    )

    // A line that has not matched its full quantity yet shows the Arabic count guard.
    expect(
      screen.getByText('المحدد 0 من 2 — يجب أن يساوي عدد الأصول المحددة الكمية.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'AST-2026-0001 — حاسوب محمول' }))
    await waitFor(() => expect(linesValue()[0]?.assetIds).toEqual([ASSET_A_ID]))
    expect(
      screen.getByText('المحدد 1 من 2 — يجب أن يساوي عدد الأصول المحددة الكمية.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'AST-2026-0002 — حاسوب محمول' }))
    await waitFor(() => expect(linesValue()[0]?.assetIds).toEqual([ASSET_A_ID, ASSET_B_ID]))
    expect(
      screen.getByText('الأصول المستردة للبند: 2 من 2 (يجب أن يساوي المحدد الكمية)'),
    ).toBeInTheDocument()
  })

  it('flags a non-integer quantity on the asset line', () => {
    const { Host } = createHost([createAssetKindLine({ quantity: 1.5 })])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={ELIGIBLE_ASSETS}
          isLoading={false}
        />
      </Host>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'يجب أن تكون كمية بند الأصل رقماً صحيحاً (وحدة لكل أصل).',
    )
  })

  it('reports an empty eligible asset set in Arabic', () => {
    const { Host } = createHost([createAssetKindLine()])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={[]}
          isLoading={false}
        />
      </Host>,
    )
    expect(
      screen.getByText('لا توجد أصول مستردة مطابقة لهذه المادة في سند الصرف الأصلي.'),
    ).toBeInTheDocument()
  })

  it('shows the remaining durable custody and flags a quantity above it', () => {
    const { Host } = createHost([createLine(DURABLE_QTY_MATERIAL_ID, 'Durable', { quantity: 5 })])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={[eligibleQuantity(3)]}
          isLoading={false}
        />
      </Host>,
    )

    expect(
      screen.getByText(`الكمية المتبقية في العهدة: ${formatNumber(3)} من ${formatNumber(10)}`),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      `الكمية المطلوبة تتجاوز الكمية المتبقية في العهدة (${formatNumber(3)}).`,
    )
  })

  it('accepts a durable quantity within the remaining custody', () => {
    const { Host } = createHost([createLine(DURABLE_QTY_MATERIAL_ID, 'Durable', { quantity: 2 })])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={[eligibleQuantity(3)]}
          isLoading={false}
        />
      </Host>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports a durable material with no remaining custody', () => {
    const { Host } = createHost([createLine(DURABLE_QTY_MATERIAL_ID, 'Durable')])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={[]}
          isLoading={false}
        />
      </Host>,
    )
    expect(
      screen.getByText('لا توجد عهدة متبقية قابلة للإرجاع لهذه المادة في سند الصرف الأصلي.'),
    ).toBeInTheDocument()
  })

  it('puts the picked serial unit on batchNumber and pins the quantity to 1', async () => {
    const user = userEvent.setup()
    const { Host } = createHost([
      createLine(DURABLE_SERIAL_MATERIAL_ID, 'Durable', { quantity: 0 }),
    ])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={ELIGIBLE_UNITS}
          isLoading={false}
        />
      </Host>,
    )

    await user.click(screen.getByRole('radio', { name: 'SN-DUR-0001 — جهاز قياس' }))

    await waitFor(() => {
      expect(linesValue()[0]?.batchNumber).toBe('SN-DUR-0001')
      expect(linesValue()[0]?.quantity).toBe(1)
    })
  })

  it('flags a serial line whose quantity is not 1', () => {
    const { Host } = createHost([
      createLine(DURABLE_SERIAL_MATERIAL_ID, 'Durable', {
        quantity: 2,
        batchNumber: 'SN-DUR-0001',
      }),
    ])
    render(
      <Host>
        <ReturnLineAssetSelector
          index={0}
          originalIssueDocumentId={ISSUE_DOC_ID}
          items={ELIGIBLE_UNITS}
          isLoading={false}
        />
      </Host>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('يجب أن تكون كمية الوحدة التسلسلية 1.')
  })
})
