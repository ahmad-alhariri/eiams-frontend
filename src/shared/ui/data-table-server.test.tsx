import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createColumnHelper } from '@tanstack/react-table'
import { useState } from 'react'
import { describe, expect, it, vi, afterEach } from 'vitest'

import { dataTableFeatures } from '@/shared/ui/data-table'
import { DataTableServer } from '@/shared/ui/data-table-server'

type WarehouseRow = {
  id: number
  name: string
  location: string
}

const warehouseRows: WarehouseRow[] = [
  { id: 1, name: 'مستودع دمشق', location: 'دمشق' },
  { id: 2, name: 'مستودع حلب', location: 'حلب' },
]

const helper = createColumnHelper<typeof dataTableFeatures, WarehouseRow>()

const columns = helper.columns([
  helper.accessor('name', { id: 'name', header: 'الاسم' }),
  helper.accessor('location', { id: 'location', header: 'الموقع' }),
])

afterEach(() => {
  vi.useRealTimers()
})

describe('DataTableServer', () => {
  it('renders Arabic column headers and server rows through DataTable', () => {
    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={2}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('columnheader', { name: 'الاسم' })).toHaveAttribute('scope', 'col')
    expect(screen.getByText('مستودع دمشق')).toBeInTheDocument()
    expect(screen.getByText('مستودع حلب')).toBeInTheDocument()
  })

  it('omits the search input when the search props are not supplied', () => {
    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={2}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('renders the search input with an Arabic label and placeholder', () => {
    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={2}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchPlaceholder="ابحث عن مستودع..."
      />,
    )

    expect(screen.getByRole('searchbox', { name: 'بحث' })).toHaveAttribute(
      'placeholder',
      'ابحث عن مستودع...',
    )
  })

  it('debounces typing before firing onSearchChange with the settled query', () => {
    vi.useFakeTimers()
    const onSearchChange = vi.fn()

    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={2}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'حلب' } })
    expect(onSearchChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(onSearchChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onSearchChange).toHaveBeenCalledTimes(1)
    expect(onSearchChange).toHaveBeenCalledWith('حلب')
  })

  it('clears the query immediately through the Arabic clear button', () => {
    vi.useFakeTimers()
    const onSearchChange = vi.fn()

    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={2}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        searchQuery=""
        onSearchChange={onSearchChange}
      />,
    )

    const searchbox = screen.getByRole('searchbox')
    fireEvent.change(searchbox, { target: { value: 'حلب' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onSearchChange).toHaveBeenLastCalledWith('حلب')

    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث' }))

    expect(onSearchChange).toHaveBeenLastCalledWith('')
    expect(searchbox).toHaveValue('')
  })

  it('does not re-fire the stale query after clearing when the parent acknowledges the clear', () => {
    vi.useFakeTimers()

    function StatefulHarness() {
      const [query, setQuery] = useState('')
      return (
        <DataTableServer
          columns={columns}
          data={warehouseRows}
          page={1}
          pageSize={10}
          totalCount={2}
          totalPages={1}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
          searchQuery={query}
          onSearchChange={setQuery}
        />
      )
    }

    render(<StatefulHarness />)
    const searchbox = screen.getByRole('searchbox')

    fireEvent.change(searchbox, { target: { value: 'حلب' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(searchbox).toHaveValue('حلب')

    fireEvent.click(screen.getByRole('button', { name: 'مسح البحث' }))
    expect(searchbox).toHaveValue('')

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(searchbox).toHaveValue('')
  })

  it('passes pagination through to the controls bar with Arabic range text', () => {
    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={37}
        totalPages={4}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByText('عرض ١–١٠ من ٣٧')).toBeInTheDocument()
    expect(screen.getByText('صفحة ١ من ٤')).toBeInTheDocument()
  })

  it('fires onPageChange from the next button', () => {
    const onPageChange = vi.fn()

    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={37}
        totalPages={4}
        onPageChange={onPageChange}
        onPageSizeChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'الصفحة التالية' }))

    expect(onPageChange).toHaveBeenCalledTimes(1)
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('fires onPageSizeChange through the Arabic page-size selector', async () => {
    const user = userEvent.setup()
    const onPageSizeChange = vi.fn()

    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        page={1}
        pageSize={10}
        totalCount={37}
        totalPages={4}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    )

    await user.click(screen.getByRole('combobox', { name: 'عدد الصفوف في الصفحة' }))
    await user.click(await screen.findByRole('option', { name: 'عرض ٢٥ صفاً' }))

    expect(onPageSizeChange).toHaveBeenCalledTimes(1)
    expect(onPageSizeChange).toHaveBeenCalledWith(25)
  })

  it('passes the loading state through to the DataTable skeleton', () => {
    render(
      <DataTableServer
        columns={columns}
        data={warehouseRows}
        isLoading
        page={1}
        pageSize={10}
        totalCount={2}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('status', { name: 'جاري تحميل الجدول...' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('renders the Arabic empty state through DataTable', () => {
    render(
      <DataTableServer
        columns={columns}
        data={[]}
        page={1}
        pageSize={10}
        totalCount={0}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'لا توجد بيانات' })).toBeInTheDocument()
  })

  it('renders the Arabic error state and fires onRetry through DataTable', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(
      <DataTableServer
        columns={columns}
        data={null}
        isError
        onRetry={onRetry}
        page={1}
        pageSize={10}
        totalCount={2}
        totalPages={1}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'حدث خطأ' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
