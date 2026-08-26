import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

import { AdjustmentLineEditor } from './adjustment-line-editor'
import {
  adjustmentFormSchema,
  type AdjustmentFormValues,
  type AdjustmentLineValues,
} from '@/modules/adjustment/schemas/adjustment-form.schemas'

vi.mock('@/modules/catalog/hooks/use-scoped-material-selector', () => ({
  useScopedMaterialSelector: () => ({
    scopeReady: true,
    loadOptions: vi.fn().mockResolvedValue([]),
  }),
}))

const MATERIAL_ID = '723e4567-e89b-42d3-a456-426614174007'
const ASSET_ID = 'e73e4567-e89b-42d3-a456-426614174052'

function varianceSeed(): AdjustmentLineValues[] {
  return [
    {
      materialId: MATERIAL_ID,
      materialNameAr: 'حاسوب مكتبي',
      quantityDelta: -2,
      reason: '',
    },
    {
      materialId: '773e4567-e89b-42d3-a456-426614174053',
      materialNameAr: 'طابعة ليزر',
      assetId: ASSET_ID,
      quantityDelta: -1,
      reason: 'تالف',
    },
  ]
}

function EditorHarness({
  purpose,
  lines,
}: {
  purpose: AdjustmentFormValues['header']['purpose']
  lines: AdjustmentLineValues[]
}) {
  const form = useForm<AdjustmentFormValues>({
    defaultValues: {
      header: {
        warehouseId: '823e4567-e89b-42d3-a456-426614174008',
        purpose,
        reason: '',
      },
      ...(purpose === 'CountVariance' ? { countId: '223e4567-e89b-42d3-a456-426614174002' } : {}),
      lines,
    },
    mode: 'onChange',
  })
  return (
    <FormProvider {...form}>
      <AdjustmentLineEditor purpose={purpose} />
    </FormProvider>
  )
}

function renderEditor(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('AdjustmentLineEditor (e21-t05)', () => {
  it('DirectCorrection: offers free signed rows with add/remove', async () => {
    const user = userEvent.setup()
    renderEditor(
      <EditorHarness purpose="DirectCorrection" lines={[{ ...varianceSeed()[0]!, reason: '' }]} />,
    )

    expect(screen.getByLabelText('مادة البند 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'إضافة بند' }))
    expect(screen.getByLabelText('مادة البند 2')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: /إزالة البند/ })[1]!)
    expect(screen.queryByLabelText('مادة البند 2')).toBeNull()
  })

  it('CountVariance: renders seeded rows read-only with reasons editable', () => {
    renderEditor(<EditorHarness purpose="CountVariance" lines={varianceSeed()} />)

    // Materials render as text (read-only projection), not inputs.
    expect(screen.getByText('حاسوب مكتبي')).toBeInTheDocument()
    expect(screen.getByText('طابعة ليزر')).toBeInTheDocument()
    expect(screen.queryByLabelText('مادة البند 1')).toBeNull()

    // Signed deltas render as text.
    expect(screen.getByText('-2')).toBeInTheDocument()
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(screen.queryByLabelText(/فرق الكمية/)).toBeNull()

    // One editable reason per row; no add/remove controls in variance mode.
    expect(screen.getAllByLabelText('سبب الفرق')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'إضافة بند' })).toBeNull()
    expect(screen.queryByRole('button', { name: /إزالة البند/ })).toBeNull()
  })

  it('CountVariance: shows the asset chip only on asset-backed rows', () => {
    renderEditor(<EditorHarness purpose="CountVariance" lines={varianceSeed()} />)

    expect(screen.getAllByText('أصل مرتبط بالجرد').length).toBe(1)
  })

  it('submits seeded variance rows carrying the asset reference (D-ADJ-01)', async () => {
    let captured: AdjustmentFormValues | undefined
    const user = userEvent.setup()

    function Probe() {
      const form = useForm<AdjustmentFormValues>({
        defaultValues: {
          header: {
            warehouseId: '823e4567-e89b-42d3-a456-426614174008',
            purpose: 'CountVariance',
            reason: 'فروقات الجرد',
          },
          countId: '223e4567-e89b-42d3-a456-426614174002',
          lines: varianceSeed(),
        },
        mode: 'onChange',
      })
      return (
        <FormProvider {...form}>
          <AdjustmentLineEditor purpose="CountVariance" />
          <button
            type="button"
            onClick={() =>
              void form.handleSubmit((values) => {
                captured = values
              })()
            }
          >
            تحقق
          </button>
        </FormProvider>
      )
    }

    render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe />
      </QueryClientProvider>,
    )

    const reasonInputs = screen.getAllByLabelText('سبب الفرق')
    await user.type(reasonInputs[0]!, 'عجز مرصود')
    await user.click(screen.getByRole('button', { name: 'تحقق' }))

    await vi.waitFor(() => expect(captured).toBeDefined())
    const parsed = adjustmentFormSchema.safeParse(captured)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.lines).toHaveLength(2)
      expect(parsed.data.lines[0]).toMatchObject({
        materialId: MATERIAL_ID,
        quantityDelta: -2,
        reason: 'عجز مرصود',
      })
      expect(parsed.data.lines[1]?.assetId).toBe(ASSET_ID)
    }
  })
})
