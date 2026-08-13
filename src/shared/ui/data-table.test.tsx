import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createColumnHelper, type RowSelectionState, type Updater } from '@tanstack/react-table'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/shared/ui/button'
import { DataTable, dataTableFeatures, type DataTableSortState } from '@/shared/ui/data-table'

type WarehouseRow = {
  id: number
  name: string
  location: string
  active: boolean
}

const warehouseRows: WarehouseRow[] = [
  { id: 1, name: 'مستودع دمشق', location: 'دمشق', active: true },
  { id: 2, name: 'مستودع حلب', location: 'حلب', active: false },
]

const helper = createColumnHelper<typeof dataTableFeatures, WarehouseRow>()

const columns = helper.columns([
  helper.accessor('name', {
    id: 'name',
    header: 'الاسم',
    cell: (info) => <strong>{String(info.getValue())}</strong>,
  }),
  helper.accessor('location', { id: 'location', header: 'الموقع', enableSorting: false }),
  helper.accessor('active', {
    id: 'active',
    header: 'الحالة',
    cell: (info) => (info.getValue() ? 'نشط' : 'مغلق'),
  }),
])

function SortHarness({
  onSortChange,
}: {
  onSortChange: (next: DataTableSortState | null) => void
}) {
  const [sortState, setSortState] = useState<DataTableSortState | null>(null)
  return (
    <DataTable
      columns={columns}
      data={warehouseRows}
      sort={{
        sortState,
        onSortChange: (next) => {
          setSortState(next)
          onSortChange(next)
        },
      }}
    />
  )
}

function SelectionHarness({
  getRowId,
  onSelectionChange,
}: {
  getRowId?: (row: WarehouseRow, index: number) => string
  onSelectionChange?: (updater: Updater<RowSelectionState>) => void
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  return (
    <DataTable
      columns={columns}
      data={warehouseRows}
      selection={{
        rowSelection,
        onRowSelectionChange: (updater) => {
          setRowSelection(updater)
          onSelectionChange?.(updater)
        },
        ...(getRowId ? { getRowId } : {}),
      }}
    />
  )
}

function applyUpdater(updater: Updater<RowSelectionState>): RowSelectionState {
  return typeof updater === 'function' ? updater({}) : updater
}

describe('DataTable', () => {
  it('renders Arabic column headers with scope="col"', () => {
    render(<DataTable columns={columns} data={warehouseRows} />)

    expect(screen.getByRole('columnheader', { name: 'الاسم' })).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('columnheader', { name: 'الموقع' })).toHaveAttribute('scope', 'col')
    expect(screen.getByRole('columnheader', { name: 'الحالة' })).toHaveAttribute('scope', 'col')
  })

  it('renders row cells from custom accessor renderers', () => {
    const { container } = render(<DataTable columns={columns} data={warehouseRows} />)

    const nameCell = container.querySelector('tbody strong')
    expect(nameCell).toHaveTextContent('مستودع دمشق')
    expect(screen.getByText('مستودع حلب')).toBeInTheDocument()
    expect(screen.getByText('نشط')).toBeInTheDocument()
    expect(screen.getByText('مغلق')).toBeInTheDocument()
  })

  it('shows the loading skeleton when data is undefined', () => {
    render(<DataTable columns={columns} data={undefined} />)

    expect(screen.getByRole('status', { name: 'جاري تحميل الجدول...' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the loading skeleton while isLoading is true', () => {
    render(<DataTable columns={columns} data={warehouseRows} isLoading />)

    expect(screen.getByRole('status', { name: 'جاري تحميل الجدول...' })).toBeInTheDocument()
  })

  it('renders an Arabic error state and invokes onRetry', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(<DataTable columns={columns} data={warehouseRows} isError onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'حدث خطأ' })).toBeInTheDocument()
    expect(screen.getByText('تعذر تحميل البيانات. حاول مرة أخرى.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders custom error copy and no retry button without onRetry', () => {
    render(
      <DataTable
        columns={columns}
        data={null}
        isError
        errorTitle="تعذر الترحيل"
        errorMessage="تأكد من رفع النسخة الموقعة ثم حاول مجددًا."
      />,
    )

    expect(screen.getByRole('heading', { name: 'تعذر الترحيل' })).toBeInTheDocument()
    expect(screen.getByText('تأكد من رفع النسخة الموقعة ثم حاول مجددًا.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إعادة المحاولة' })).not.toBeInTheDocument()
  })

  it('renders the empty state with its CTA when the data array is empty', () => {
    render(<DataTable columns={columns} data={[]} emptyAction={<Button>إضافة مستودع</Button>} />)

    expect(screen.getByRole('heading', { name: 'لا توجد بيانات' })).toBeInTheDocument()
    expect(screen.getByText('لم يتم العثور على سجلات مطابقة.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'إضافة مستودع' })).toBeInTheDocument()
  })

  it('treats null data as empty data', () => {
    render(<DataTable columns={columns} data={null} />)

    expect(screen.getByRole('heading', { name: 'لا توجد بيانات' })).toBeInTheDocument()
  })

  it('sorts through onSortChange with an asc/desc toggle and reflects aria-sort', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()

    render(<SortHarness onSortChange={onSortChange} />)

    const nameHeader = screen.getByRole('columnheader', { name: 'الاسم' })
    const nameSortButton = within(nameHeader).getByRole('button')

    await user.click(nameSortButton)
    expect(onSortChange).toHaveBeenLastCalledWith({ id: 'name', direction: 'asc' })
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')

    await user.click(nameSortButton)
    expect(onSortChange).toHaveBeenLastCalledWith({ id: 'name', direction: 'desc' })
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
  })

  it('does not offer sorting for columns with enableSorting false', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()

    render(<SortHarness onSortChange={onSortChange} />)

    const locationHeader = screen.getByRole('columnheader', { name: 'الموقع' })
    expect(within(locationHeader).queryByRole('button')).not.toBeInTheDocument()
    expect(locationHeader).not.toHaveAttribute('aria-sort')

    await user.click(locationHeader)
    expect(onSortChange).not.toHaveBeenCalled()
  })

  it('selects all rows from the header checkbox and marks row checkboxes', async () => {
    const user = userEvent.setup()
    const onSelectionChange = vi.fn()

    render(
      <SelectionHarness
        getRowId={(row) => `warehouse-${row.id}`}
        onSelectionChange={onSelectionChange}
      />,
    )

    const selectAll = screen.getByRole('checkbox', { name: 'تحديد الكل' })
    await user.click(selectAll)

    const next = applyUpdater(onSelectionChange.mock.calls[0]![0]!)
    expect(next['warehouse-1']).toBe(true)
    expect(next['warehouse-2']).toBe(true)

    expect(screen.getByRole('checkbox', { name: 'إلغاء تحديد الكل' })).toBeChecked()
    const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'تحديد الصف' })
    expect(rowCheckboxes).toHaveLength(2)
    for (const rowCheckbox of rowCheckboxes) {
      expect(rowCheckbox).toBeChecked()
    }

    await user.click(screen.getByRole('checkbox', { name: 'إلغاء تحديد الكل' }))
    const cleared = applyUpdater(onSelectionChange.mock.calls[1]![0]!)
    expect(cleared['warehouse-1']).toBeUndefined()
    expect(cleared['warehouse-2']).toBeUndefined()
    expect(screen.getByRole('checkbox', { name: 'تحديد الكل' })).not.toBeChecked()
  })

  it('indicates partial selection with an indeterminate header checkbox', async () => {
    const user = userEvent.setup()

    render(<SelectionHarness getRowId={(row) => `warehouse-${row.id}`} />)

    await user.click(screen.getAllByRole('checkbox', { name: 'تحديد الصف' })[0]!)

    const selectAll = screen.getByRole('checkbox', { name: 'تحديد الكل' })
    expect(selectAll).toHaveAttribute('data-indeterminate')
    expect(selectAll).not.toBeChecked()
  })

  it('styles the selected row with the forest-light start border', async () => {
    const user = userEvent.setup()

    render(<SelectionHarness getRowId={(row) => `warehouse-${row.id}`} />)

    const selectedCheckbox = screen.getAllByRole('checkbox', { name: 'تحديد الصف' })[0]!
    const selectedRow = selectedCheckbox.closest('tr')!
    const unselectedRow = selectedRow.nextElementSibling as HTMLTableRowElement | null

    expect(selectedRow).not.toHaveClass('border-s-forest-light')

    await user.click(selectedCheckbox)

    expect(selectedRow).toHaveClass('border-s-forest-light', 'bg-forest/5')
    expect(unselectedRow).not.toHaveClass('border-s-forest-light')
  })

  it('fires onRowClick with the clicked row data', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()

    render(<DataTable columns={columns} data={warehouseRows} onRowClick={onRowClick} />)

    await user.click(screen.getByText('مستودع دمشق'))

    expect(onRowClick).toHaveBeenCalledTimes(1)
    expect(onRowClick).toHaveBeenCalledWith(warehouseRows[0])
  })

  it('uses logical RTL classes and the row-divider token in table markup', () => {
    const { container } = render(<DataTable columns={columns} data={warehouseRows} />)

    const table = container.querySelector('table')
    expect(table).toHaveClass('w-full', 'caption-bottom', 'text-sm')

    const firstHeader = container.querySelector('th')!
    expect(firstHeader).toHaveClass('border-s', 'text-start', 'text-white', 'font-semibold')
    expect(firstHeader).toHaveAttribute('scope', 'col')

    const firstCell = container.querySelectorAll('tbody td')[0]!
    expect(firstCell).toHaveClass('px-4', 'py-3', 'text-sm', 'text-charcoal', 'align-middle')

    const firstRow = container.querySelectorAll('tbody tr')[0]!
    expect(firstRow).toHaveClass('border-b', 'border-row-divider')

    const physicalDirectionClasses = Array.from(container.querySelectorAll('[class]'))
      .flatMap((element) => (element.getAttribute('class') ?? '').split(' '))
      .filter(Boolean)
      .filter((token) =>
        /\bleft\b|\bright\b|\bml-|\bmr-|\bpl-|\bpr-|\bpx-l|\btext-left\b|\btext-right\b/.test(
          token,
        ),
      )
    expect(physicalDirectionClasses).toHaveLength(0)
  })

  it('uses getRowId results as the selection keys when provided', async () => {
    const user = userEvent.setup()
    const firstSelection = vi.fn()
    const defaultSelection = vi.fn()

    render(
      <div>
        <SelectionHarness
          getRowId={(row) => `warehouse-${row.id}`}
          onSelectionChange={firstSelection}
        />
        <SelectionHarness onSelectionChange={defaultSelection} />
      </div>,
    )

    const rowCheckboxes = screen.getAllByRole('checkbox', { name: 'تحديد الصف' })
    await user.click(rowCheckboxes[0]!)
    await user.click(rowCheckboxes[2]!)

    expect(applyUpdater(firstSelection.mock.calls[0]![0]!)['warehouse-1']).toBe(true)
    expect(applyUpdater(defaultSelection.mock.calls[0]![0]!)).toEqual({ 0: true })
  })
})
