import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { PropsWithChildren } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

import { IssueLineAssetSelector } from './issue-line-asset-selector'
import type { DocumentLinesContainer } from '@/shared/documents/schemas/document-lines.schemas'
import { createEmptyQuantityLine } from '@/shared/documents/schemas/document-lines.schemas'
import { createQueryClient } from '@/shared/services/query.client'
import { createAsset, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

const API_BASE_URL = '/api/v1'
const MATERIAL_ID = fixtureUuid(61)
const WAREHOUSE_ID = fixtureUuid(30)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

function createHarness(lineOverrides: Partial<DocumentLinesContainer['lines'][number]> = {}) {
  function Harness({ children }: PropsWithChildren) {
    const form = useForm<DocumentLinesContainer>({
      defaultValues: {
        lines: [
          {
            ...createEmptyQuantityLine(),
            materialId: MATERIAL_ID,
            materialNameAr: 'حاسوب مكتبي',
            materialKind: 'Asset',
            quantity: 2,
            ...lineOverrides,
          },
        ],
      },
    })
    return (
      <QueryClientProvider client={createQueryClient()}>
        <FormProvider {...form}>{children}</FormProvider>
      </QueryClientProvider>
    )
  }
  return Harness
}

function useTwoInStockAssetsHandler() {
  server.use(
    http.get(`${API_BASE_URL}/assets`, () =>
      HttpResponse.json({
        items: [
          createAsset({
            assetId: fixtureUuid(230),
            assetNumber: 'AST-2024-C01',
            serialNumber: 'SN-PC-0001',
            derivedStatus: 'InStock',
            material: { id: MATERIAL_ID, displayName: 'حاسوب مكتبي' },
            currentWarehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
          }),
          createAsset({
            assetId: fixtureUuid(231),
            assetNumber: 'AST-2024-C02',
            serialNumber: 'SN-PC-0002',
            derivedStatus: 'InStock',
            material: { id: MATERIAL_ID, displayName: 'حاسوب مكتبي' },
            currentWarehouse: { id: WAREHOUSE_ID, displayName: 'المستودع المركزي' },
          }),
        ],
        meta: { page: 0, pageSize: 50, total: 2 },
      }),
    ),
  )
}

describe('IssueLineAssetSelector (e16-t05 / D-IAR-01)', () => {
  it('lists InStock assets as selectable chips with accessible labels', async () => {
    useTwoInStockAssetsHandler()
    render(<IssueLineAssetSelector index={0} warehouseId={WAREHOUSE_ID} />, {
      wrapper: createHarness(),
    })

    const chips = await screen.findAllByRole('checkbox')
    expect(chips).toHaveLength(2)
    expect(chips[0]!).toHaveAccessibleName(/AST-2024-C01/)
    expect(screen.getByText('AST-2024-C02')).toBeInTheDocument()
  })

  it('writes selected ids into the line and reports count mismatch vs quantity', async () => {
    useTwoInStockAssetsHandler()
    const user = userEvent.setup()
    render(<IssueLineAssetSelector index={0} warehouseId={WAREHOUSE_ID} />, {
      wrapper: createHarness(),
    })

    await screen.findAllByRole('checkbox')
    // Quantity is 2; selecting one asset must surface the mismatch alert.
    // The counter text is split across JSX text nodes → match with a function.
    await user.click(screen.getAllByRole('checkbox')[0]!)
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent === 'الأصول المحددة للبند: 1 من 2 (يجب أن يساوي المحدد الكمية)',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/يجب أن يساوي عدد الأصول المحددة الكمية/)).toBeInTheDocument()

    // Selecting the second satisfies the count gate.
    await user.click(screen.getAllByRole('checkbox')[1]!)
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent === 'الأصول المحددة للبند: 2 من 2 (يجب أن يساوي المحدد الكمية)',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/يجب أن يساوي عدد الأصول المحددة الكمية/)).toBeNull()
  })

  it('renders nothing for non-Asset lines', () => {
    render(<IssueLineAssetSelector index={0} warehouseId={WAREHOUSE_ID} />, {
      wrapper: createHarness({
        materialKind: 'Consumable',
        materialNameAr: 'ورق تصوير A4',
        quantity: 3,
      }),
    })
    expect(document.querySelector('[data-slot="issue-line-asset-selector"]')).toBeNull()
  })

  it('shows an empty-state message when no InStock assets exist for the material', async () => {
    server.use(
      http.get(`${API_BASE_URL}/assets`, () =>
        HttpResponse.json({ items: [], meta: { page: 0, pageSize: 50, total: 0 } }),
      ),
    )
    render(<IssueLineAssetSelector index={0} warehouseId={WAREHOUSE_ID} />, {
      wrapper: createHarness(),
    })
    expect(
      await screen.findByText('لا توجد أصول متاحة لهذه المادة في المستودع.'),
    ).toBeInTheDocument()
  })
})
