import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { useServerPagination, type PageSizeOption } from '@/shared/hooks/use-server-pagination'
import { ServerPaginationControls } from '@/shared/ui/data-table-server-controls'

function ControlsHarness({
  initialPage = 1,
  initialPageSize = 10,
  totalCount,
}: {
  initialPage?: number
  initialPageSize?: PageSizeOption
  totalCount: number | undefined
}) {
  const pagination = useServerPagination({ initialPage, initialPageSize })
  return <ServerPaginationControls pagination={pagination} totalCount={totalCount} />
}

describe('ServerPaginationControls', () => {
  it('renders the Arabic range text with Arabic-Indic digits', () => {
    render(<ControlsHarness totalCount={37} />)

    expect(screen.getByText('عرض ١–١٠ من ٣٧')).toBeInTheDocument()
  })

  it('clamps the range end to the total count on the last page', () => {
    render(<ControlsHarness initialPage={4} totalCount={37} />)

    expect(screen.getByText('عرض ٣١–٣٧ من ٣٧')).toBeInTheDocument()
  })

  it('hides the range text while the total count is unknown', () => {
    render(<ControlsHarness totalCount={undefined} />)

    expect(
      screen.queryByText(
        (content, element) => element?.tagName === 'P' && content.startsWith('عرض'),
      ),
    ).not.toBeInTheDocument()
  })

  it('hides the range text when there are no records', () => {
    render(<ControlsHarness totalCount={0} />)

    expect(
      screen.queryByText(
        (content, element) => element?.tagName === 'P' && content.startsWith('عرض'),
      ),
    ).not.toBeInTheDocument()
  })

  it('renders the page indicator with Arabic digits', () => {
    render(<ControlsHarness initialPage={2} totalCount={37} />)

    expect(screen.getByText('صفحة ٢ من ٤')).toBeInTheDocument()
  })

  it('disables previous on the first page and navigates to the next page', async () => {
    const user = userEvent.setup()

    render(<ControlsHarness totalCount={37} />)

    const prev = screen.getByRole('button', { name: 'الصفحة السابقة' })
    const next = screen.getByRole('button', { name: 'الصفحة التالية' })
    expect(prev).toBeDisabled()
    expect(next).toBeEnabled()

    await user.click(next)

    expect(screen.getByText('صفحة ٢ من ٤')).toBeInTheDocument()
    expect(prev).toBeEnabled()
    expect(screen.getByText('عرض ١١–٢٠ من ٣٧')).toBeInTheDocument()
  })

  it('disables next on the last page and navigates back to the previous page', async () => {
    const user = userEvent.setup()

    render(<ControlsHarness initialPage={4} totalCount={37} />)

    const prev = screen.getByRole('button', { name: 'الصفحة السابقة' })
    const next = screen.getByRole('button', { name: 'الصفحة التالية' })
    expect(next).toBeDisabled()
    expect(prev).toBeEnabled()

    await user.click(prev)

    expect(screen.getByText('صفحة ٣ من ٤')).toBeInTheDocument()
    expect(next).toBeEnabled()
    expect(screen.getByText('عرض ٢١–٣٠ من ٣٧')).toBeInTheDocument()
  })

  it('shows the current page size in the selector trigger with Arabic digits', () => {
    render(<ControlsHarness initialPageSize={25} totalCount={37} />)

    expect(screen.getByRole('combobox', { name: 'عدد الصفوف في الصفحة' })).toHaveTextContent(
      'عرض ٢٥ صفاً',
    )
  })

  it('changes the page size through the Arabic selector and resets to page 1', async () => {
    const user = userEvent.setup()

    render(<ControlsHarness initialPage={3} totalCount={100} />)

    await user.click(screen.getByRole('combobox', { name: 'عدد الصفوف في الصفحة' }))

    const option = await screen.findByRole('option', { name: 'عرض ٢٥ صفاً' })
    await user.click(option)

    expect(screen.getByText('صفحة ١ من ٤')).toBeInTheDocument()
    expect(screen.getByText('عرض ١–٢٥ من ١٠٠')).toBeInTheDocument()
  })

  it('keeps navigation and selector accessible with Arabic labels', () => {
    render(<ControlsHarness totalCount={37} />)

    expect(screen.getByRole('navigation', { name: 'تنقل بين الصفحات' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'الصفحة السابقة' })).toHaveTextContent('السابق')
    expect(screen.getByRole('button', { name: 'الصفحة التالية' })).toHaveTextContent('التالي')
  })

  it('uses logical RTL classes without physical direction utilities', () => {
    const { container } = render(<ControlsHarness totalCount={37} />)

    const physicalDirectionClasses = Array.from(container.querySelectorAll('[class]'))
      .flatMap((element) => (element.getAttribute('class') ?? '').split(' '))
      .filter(Boolean)
      // Tabler icon glyph ids (tabler-icon-chevron-right) are icon names, not
      // layout utilities; they cannot be avoided when RTL needs chevrons.
      .filter((token) => !token.startsWith('tabler-icon-'))
      .filter((token) =>
        /\bleft\b|\bright\b|\bml-|\bmr-|\bpl-|\bpr-|\bpx-l|\btext-left\b|\btext-right\b/.test(
          token,
        ),
      )
    expect(physicalDirectionClasses).toHaveLength(0)
  })
})
