import { zodResolver } from '@hookform/resolvers/zod'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import type { ReactNode } from 'react'
import {
  FormProvider,
  useForm,
  useWatch,
  type Resolver,
  type UseFormReturn,
} from 'react-hook-form'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { fixtureUuid } from '@/test/msw/factories'
import { okPageJson } from '@/test/msw/envelope'
import { server } from '@/test/msw/server'
import { createQueryClient } from '@/shared/services/query.client'
import {
  createEmptyQuantityLine,
  documentLinesSchema,
  type DocumentLinesContainer,
} from '@/shared/documents/schemas/document-lines.schemas'
import type { ReturnEligibleItem } from '@/modules/custody/types/return.types'
import { ReturnLineAssetSelector } from './return-line-asset-selector'

const API_BASE_URL = '/api/v1'
const ISSUE_DOC_ID = fixtureUuid(155)
const MATERIAL_ID = fixtureUuid(41)
const ASSET_A_ID = fixtureUuid(60)
const ASSET_B_ID = fixtureUuid(61)

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({
    activeScopeCacheKey: { kind: 'enterprise' } as unknown,
  }),
}))

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

const ELIGIBLE_ASSETS = [eligibleAsset(1, ASSET_A_ID), eligibleAsset(2, ASSET_B_ID)]

function createAssetKindLine(
  overrides: Partial<DocumentLinesContainer['lines'][number]> = {},
): DocumentLinesContainer['lines'][number] {
  return {
    ...createEmptyQuantityLine(),
    materialId: MATERIAL_ID,
    materialNameAr: 'حاسوب محمول',
    materialKind: 'Asset',
    materialDomainId: '00000000-0000-4000-8000-000000000020',
    quantity: 2,
    ...overrides,
  }
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
      <QueryClientProvider client={createQueryClient()}>
        <FormProvider {...created}>
          <form aria-label="test-form" onSubmit={(event) => event.preventDefault()}>
            {children}
            <LinesOutput form={created} />
          </form>
        </FormProvider>
      </QueryClientProvider>
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

function useEligibleItemsHandler(items: readonly ReturnEligibleItem[]) {
  server.use(
    http.get(`${API_BASE_URL}/returns/eligible-items`, () => okPageJson([...items])),
  )
}

afterEach(() => {
  server.resetHandlers()
})

describe('ReturnLineAssetSelector (FIX-R2)', () => {
  it('renders nothing unless the line is Asset-kind with a material', () => {
    useEligibleItemsHandler(ELIGIBLE_ASSETS)
    const { Host } = createHost([createEmptyQuantityLine()])
    render(
      <Host>
        <ReturnLineAssetSelector index={0} originalIssueDocumentId={ISSUE_DOC_ID} />
      </Host>,
    )
    expect(document.querySelector('[data-slot="return-line-asset-selector"]')).toBeNull()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('hints to choose the original issue first and never queries with an empty id', () => {
    let eligibleCalls = 0
    server.use(
      http.get(`${API_BASE_URL}/returns/eligible-items`, () => {
        eligibleCalls += 1
        return okPageJson([...ELIGIBLE_ASSETS])
      }),
    )
    const { Host } = createHost([createAssetKindLine()])
    render(
      <Host>
        <ReturnLineAssetSelector index={0} originalIssueDocumentId={undefined} />
      </Host>,
    )

    expect(
      screen.getByText('اختر سند الصرف الأصلي أولاً لعرض الأصول المستردة ضمن هذا البند.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(eligibleCalls).toBe(0)
  })

  it('writes the picked subjectIds into lines.<index>.assetIds and flags mismatches', async () => {
    const user = userEvent.setup()
    useEligibleItemsHandler(ELIGIBLE_ASSETS)
    const { Host } = createHost([createAssetKindLine()])
    render(
      <Host>
        <ReturnLineAssetSelector index={0} originalIssueDocumentId={ISSUE_DOC_ID} />
      </Host>,
    )

    // The chips surface once the eligible row is resolved; a line that has not
    // matched its full quantity yet shows the Arabic count guard.
    expect(
      await screen.findByText('المحدد 0 من 2 — يجب أن يساوي عدد الأصول المحددة الكمية.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'AST-2026-0001 — حاسوب محمول' }))
    await waitFor(() => expect(linesValue()[0]?.assetIds).toEqual([ASSET_A_ID]))
    expect(screen.getByText('المحدد 1 من 2 — يجب أن يساوي عدد الأصول المحددة الكمية.'))
      .toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'AST-2026-0002 — حاسوب محمول' }))
    await waitFor(() => expect(linesValue()[0]?.assetIds).toEqual([ASSET_A_ID, ASSET_B_ID]))
    expect(screen.getByText('الأصول المستردة للبند: 2 من 2 (يجب أن يساوي المحدد الكمية)'))
      .toBeInTheDocument()
  })

  it('flags a non-integer quantity on the asset line', () => {
    useEligibleItemsHandler(ELIGIBLE_ASSETS)
    const { Host } = createHost([createAssetKindLine({ quantity: 1.5 })])
    render(
      <Host>
        <ReturnLineAssetSelector index={0} originalIssueDocumentId={ISSUE_DOC_ID} />
      </Host>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'يجب أن تكون كمية بند الأصل رقماً صحيحاً (وحدة لكل أصل).',
    )
  })

  it('reports an empty eligible set in Arabic', async () => {
    useEligibleItemsHandler([])
    const { Host } = createHost([createAssetKindLine()])
    render(
      <Host>
        <ReturnLineAssetSelector index={0} originalIssueDocumentId={ISSUE_DOC_ID} />
      </Host>,
    )
    expect(
      await screen.findByText('لا توجد أصول مستردة مطابقة لهذه المادة في سند الصرف الأصلي.'),
    ).toBeInTheDocument()
  })
})
