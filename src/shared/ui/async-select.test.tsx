import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_DEBOUNCE_MS } from '@/shared/hooks/use-debounce'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'

interface WarehousePayload {
  code: string
}

type Option = AsyncSelectOption<WarehousePayload>

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const warehouseOptions: Option[] = [
  { value: 'wh-damascus', label: 'مستودع دمشق', payload: { code: 'W1' } },
  { value: 'wh-aleppo', label: 'مستودع حلب', payload: { code: 'W2' } },
  { value: 'wh-homs', label: 'مستودع حمص', payload: { code: 'W3' } },
]

describe('AsyncSelect', () => {
  beforeEach(() => {
    // Base UI's positioner runs Floating UI autoUpdate, which schedules a
    // requestAnimationFrame loop while mounted. Faking rAF (default) would
    // make advanceTimersByTime pump that loop forever, so only the debounce
    // timer APIs are faked here.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  function input() {
    return screen.getByRole('combobox')
  }

  async function typeQuery(text: string) {
    fireEvent.input(input(), { target: { value: text } })
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
    })
  }

  function pressKey(key: string) {
    fireEvent.keyDown(input(), { key })
  }

  it('does not call loadOptions below minQueryLength', async () => {
    const loadOptions = vi.fn(async () => [])
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={loadOptions}
        onValueChange={vi.fn()}
        minQueryLength={3}
      />,
    )

    await typeQuery('مد')

    expect(loadOptions).not.toHaveBeenCalled()
  })

  it('calls loadOptions once after the debounce with the trimmed query', async () => {
    const loadOptions = vi.fn(async () => warehouseOptions)
    render(<AsyncSelect<WarehousePayload> loadOptions={loadOptions} onValueChange={vi.fn()} />)

    await typeQuery('  دمشق  ')

    expect(loadOptions).toHaveBeenCalledExactlyOnceWith('دمشق')
  })

  it('renders loader results in the panel', async () => {
    const loadOptions = vi.fn(async () => warehouseOptions)
    render(<AsyncSelect<WarehousePayload> loadOptions={loadOptions} onValueChange={vi.fn()} />)

    await typeQuery('مستودع')

    expect(screen.getByRole('option', { name: 'مستودع دمشق' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'مستودع حلب' })).toBeInTheDocument()
  })

  it('selects the highlighted option with ArrowDown + Enter and calls onValueChange', async () => {
    const onValueChange = vi.fn()
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => warehouseOptions)}
        onValueChange={onValueChange}
      />,
    )

    await typeQuery('مستودع')

    pressKey('ArrowDown')
    pressKey('Enter')

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith(
      'wh-damascus',
      expect.objectContaining({ value: 'wh-damascus', label: 'مستودع دمشق' }),
    )
    expect(input()).toHaveValue('مستودع دمشق')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('selects an option on click and calls onValueChange with the payload option', async () => {
    const onValueChange = vi.fn()
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => warehouseOptions)}
        onValueChange={onValueChange}
      />,
    )

    await typeQuery('حلب')

    fireEvent.click(screen.getByRole('option', { name: 'مستودع حلب' }))

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('wh-aleppo', {
      value: 'wh-aleppo',
      label: 'مستودع حلب',
      payload: { code: 'W2' },
    })
  })

  it('highlights the query fragment inside option labels with a Mountain Teal mark', async () => {
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => warehouseOptions)}
        onValueChange={vi.fn()}
      />,
    )

    await typeQuery('دمشق')

    const option = screen.getByRole('option', { name: 'مستودع دمشق' })
    const mark = within(option).getByText('دمشق').closest('mark')
    expect(mark).not.toBeNull()
    expect(mark).toHaveClass('bg-transparent', 'text-mountain-teal', 'font-semibold')
    expect(option).toHaveTextContent('مستودع دمشق')
  })

  it('shows the Arabic empty message when the loader returns no results', async () => {
    render(
      <AsyncSelect<WarehousePayload> loadOptions={vi.fn(async () => [])} onValueChange={vi.fn()} />,
    )

    await typeQuery('xyz')

    // Base UI's status wrapper injects U+2060 (word joiner) into rendered text
    // as a Chromium a11y workaround, so strip it before matching.
    const stripWordJoiner = (text: string) => text.replaceAll('\u2060', '')
    expect(screen.getByText('لا توجد نتائج', { normalizer: stripWordJoiner })).toBeInTheDocument()
  })

  it('shows the Arabic error message and keeps the panel open on rejection', async () => {
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => {
          throw new Error('network')
        })}
        onValueChange={vi.fn()}
      />,
    )

    await typeQuery('مستودع')

    expect(screen.getByRole('alert')).toHaveTextContent('تعذر البحث في الخيارات')
  })

  it('renders the create row and calls onCreate with the trimmed query', async () => {
    const onCreate = vi.fn()
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => warehouseOptions)}
        onValueChange={vi.fn()}
        onCreate={onCreate}
      />,
    )

    await typeQuery('مستودع جديد')

    fireEvent.click(screen.getByRole('button', { name: 'إضافة جديد: مستودع جديد' }))

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('مستودع جديد')
  })

  it('supports a custom createLabel', async () => {
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => [])}
        onValueChange={vi.fn()}
        onCreate={vi.fn()}
        createLabel={(query) => `إنشاء المستودع «${query}»`}
      />,
    )

    await typeQuery('ورد')

    expect(screen.getByRole('button', { name: 'إنشاء المستودع «ورد»' })).toBeInTheDocument()
  })

  it('caps the rendered list at maxResults even when the loader returns more', async () => {
    const manyOptions: Option[] = Array.from({ length: 12 }, (_, index) => ({
      value: `wh-${index + 1}`,
      label: `مستودع رقم ${index + 1}`,
    }))
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => manyOptions)}
        onValueChange={vi.fn()}
        maxResults={10}
      />,
    )

    await typeQuery('مستودع')

    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(10)
  })

  it('ignores stale responses: the newest request wins even when an older one resolves later', async () => {
    const first = deferred<Option[]>()
    const second = deferred<Option[]>()
    const loadOptions = vi.fn((query: string) =>
      query === 'دمشق' ? first.promise : second.promise,
    )
    const onValueChange = vi.fn()
    render(
      <AsyncSelect<WarehousePayload> loadOptions={loadOptions} onValueChange={onValueChange} />,
    )

    await typeQuery('دمشق')
    expect(loadOptions).toHaveBeenLastCalledWith('دمشق')

    fireEvent.input(input(), { target: { value: 'دمشق حلب' } })
    await act(async () => {
      vi.advanceTimersByTime(DEFAULT_DEBOUNCE_MS)
    })
    expect(loadOptions).toHaveBeenLastCalledWith('دمشق حلب')

    act(() => {
      second.resolve([
        { value: 'wh-aleppo', label: 'مستودع حلب' },
        { value: 'wh-damascus-old', label: 'مستودع دمشق القديم' },
      ])
    })
    await act(async () => {})
    expect(screen.getByRole('option', { name: 'مستودع حلب' })).toBeInTheDocument()

    act(() => {
      first.resolve([{ value: 'wh-stale', label: 'مستودع قديم ملغى' }])
    })
    await act(async () => {})

    expect(screen.queryByRole('option', { name: 'مستودع قديم ملغى' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'مستودع حلب' })).toBeInTheDocument()
  })

  it('shows the selected value and blocks interaction in readOnly mode', async () => {
    const loadOptions = vi.fn(async () => warehouseOptions)
    render(
      <AsyncSelect<WarehousePayload>
        value="wh-damascus"
        readOnly
        loadOptions={loadOptions}
        onValueChange={vi.fn()}
      />,
    )

    expect(input()).toHaveAttribute('readonly')
    expect(input()).toHaveValue('wh-damascus')

    fireEvent.input(input(), { target: { value: 'حلب' } })
    fireEvent.click(input())

    expect(loadOptions).not.toHaveBeenCalled()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('renders aria-disabled, blocks typing, and ignores clicks when disabled', async () => {
    const loadOptions = vi.fn(async () => warehouseOptions)
    render(
      <AsyncSelect<WarehousePayload>
        disabled
        loadOptions={loadOptions}
        onValueChange={vi.fn()}
        value="wh-damascus"
      />,
    )

    expect(input()).toHaveAttribute('aria-disabled', 'true')
    expect(input()).toBeDisabled()

    fireEvent.input(input(), { target: { value: 'حلب' } })
    fireEvent.click(input())

    expect(loadOptions).not.toHaveBeenCalled()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('fires onOpenChange when the panel opens and closes', async () => {
    const onOpenChange = vi.fn()
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => warehouseOptions)}
        onValueChange={vi.fn()}
        onOpenChange={onOpenChange}
      />,
    )

    await typeQuery('مستودع')
    expect(screen.getByRole('option', { name: 'مستودع دمشق' })).toBeInTheDocument()

    pressKey('Escape')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)

    await typeQuery('مستودع')
    expect(screen.getByRole('option', { name: 'مستودع دمشق' })).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })

  it('keeps the selected label in the input after picking an option', async () => {
    const onValueChange = vi.fn()
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => warehouseOptions)}
        onValueChange={onValueChange}
      />,
    )

    await typeQuery('حلب')
    fireEvent.click(screen.getByRole('option', { name: 'مستودع حلب' }))

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('wh-aleppo', expect.anything())
    expect(input()).toHaveValue('مستودع حلب')
  })

  it('renders a custom renderOption result', async () => {
    render(
      <AsyncSelect<WarehousePayload>
        loadOptions={vi.fn(async () => warehouseOptions)}
        onValueChange={vi.fn()}
        renderOption={(option) => `🏭 ${option.label} (${option.payload?.code ?? ''})`}
      />,
    )

    await typeQuery('مستودع')

    expect(screen.getByRole('option', { name: '🏭 مستودع دمشق (W1)' })).toBeInTheDocument()
  })
})
