import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'

import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'

function renderPopover() {
  return render(
    <Popover>
      <PopoverTrigger>فتح القائمة</PopoverTrigger>
      <PopoverContent className="w-64">محتوى القائمة</PopoverContent>
    </Popover>,
  )
}

describe('Popover primitive', () => {
  it('opens on trigger click and announces the expanded state', async () => {
    const user = userEvent.setup()
    renderPopover()

    const trigger = screen.getByRole('button', { name: 'فتح القائمة' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(trigger)

    expect(screen.getByText('محتوى القائمة')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const content = screen.getByText('محتوى القائمة').closest('[data-slot="popover-content"]')
    expect(content).toHaveClass('shadow-dropdown', 'border-border')
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderPopover()

    await user.click(screen.getByRole('button', { name: 'فتح القائمة' }))
    expect(screen.getByText('محتوى القائمة')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByText('محتوى القائمة')).not.toBeInTheDocument()
  })

  it('closes when clicking outside the popover', async () => {
    const user = userEvent.setup()
    renderPopover()

    await user.click(screen.getByRole('button', { name: 'فتح القائمة' }))
    expect(screen.getByText('محتوى القائمة')).toBeInTheDocument()

    await user.click(document.body)

    expect(screen.queryByText('محتوى القائمة')).not.toBeInTheDocument()
  })
})
