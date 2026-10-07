import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu'

/**
 * The menu opens on `mousedown`, but floating-ui defers the store write to the
 * next animation frame, and the roving highlight lands a frame after the key
 * press. jsdom has no layout engine and drives `requestAnimationFrame` on a
 * timer, so every open and every highlight assertion is awaited instead of
 * assuming the event has already settled.
 */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: 'قائمة المستخدم' })
  await user.click(trigger)
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'))
  return trigger
}

async function expectHighlight(items: HTMLElement[], index: number): Promise<HTMLElement> {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`No menu item at index ${index}`)
  }

  await waitFor(() => expect(document.activeElement).toBe(item))
  expect(item).toHaveAttribute('data-highlighted')
  return item
}

function renderMenu(dir?: 'rtl') {
  return render(
    <div dir={dir}>
      <DropdownMenu>
        <DropdownMenuTrigger>قائمة المستخدم</DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>الملف الشخصي</DropdownMenuItem>
          <DropdownMenuItem>الإعدادات</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">تسجيل الخروج</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>,
  )
}

describe('DropdownMenu primitive', () => {
  it('opens on click and announces the popup relationship on the trigger', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = screen.getByRole('button', { name: 'قائمة المستخدم' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await openMenu(user)

    expect(screen.getByRole('menu')).toBeInTheDocument()
    const content = screen.getByRole('menu').closest('[data-slot="dropdown-menu-content"]')
    expect(content).toHaveClass('bg-popover', 'border-border', 'shadow-dropdown')
  })

  it('moves the highlight with the arrow keys and loops back to the first item', async () => {
    const user = userEvent.setup()
    renderMenu()
    await openMenu(user)

    const items = screen.getAllByRole('menuitem')
    expect(items).toHaveLength(3)

    await user.keyboard('{ArrowDown}')
    await expectHighlight(items, 0)

    await user.keyboard('{ArrowDown}')
    await expectHighlight(items, 1)

    await user.keyboard('{ArrowDown}')
    await expectHighlight(items, 2)

    // `loopFocus` (the Base UI default) wraps from the last item to the first.
    await user.keyboard('{ArrowDown}')
    await expectHighlight(items, 0)

    await user.keyboard('{ArrowUp}')
    await expectHighlight(items, 2)
  })

  it('jumps to the first and last item with Home and End', async () => {
    const user = userEvent.setup()
    renderMenu()
    await openMenu(user)

    const items = screen.getAllByRole('menuitem')

    await user.keyboard('{End}')
    await expectHighlight(items, 2)

    await user.keyboard('{Home}')
    await expectHighlight(items, 0)
  })

  // This test CANNOT prove the focus ring is visible, and must not claim to.
  // jsdom does not compile Tailwind, so computed styles are unavailable and no
  // assertion here can observe contrast. An earlier version of this case was
  // titled "keeps a visible focus ring" while asserting only that two class
  // strings were present — it would have passed with an invisible ring, and
  // browser QA found exactly that. What it CAN pin is the presence of the
  // offset utilities, which are the mechanism that makes the ring visible:
  // in this theme `--ring` and `--accent` are both #428177, so a bare
  // `ring-ring` drawn on a `bg-accent` item is invisible. The
  // `ring-offset-background` gap separates the two.
  // True visibility is a browser-only property, covered by browser QA.
  it('applies the shared focus-ring utilities, including the offset that keeps the ring visible', async () => {
    const user = userEvent.setup()
    renderMenu()
    await openMenu(user)

    await user.keyboard('{ArrowDown}')
    const highlighted = await expectHighlight(screen.getAllByRole('menuitem'), 0)

    expect(highlighted.className).toContain('focus-visible:ring-2')
    expect(highlighted.className).toContain('focus-visible:ring-ring')
    expect(highlighted.className).toContain('focus-visible:ring-offset-2')
    expect(highlighted.className).toContain('focus-visible:ring-offset-background')
  })

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    renderMenu()

    const trigger = await openMenu(user)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('defaults the positioner to the same placement the popover wrapper uses', () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>فتح</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>عنصر</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    const positioner = document.querySelector('[data-slot="dropdown-menu-positioner"]')
    const content = document.querySelector('[data-slot="dropdown-menu-content"]')
    expect(positioner).toHaveClass('isolate', 'z-50')
    expect(content).toHaveAttribute('data-side', 'bottom')
    expect(content).toHaveAttribute('data-align', 'center')
  })

  it('exposes a data-slot on every rendered part so consumers can target it', async () => {
    const user = userEvent.setup()
    renderMenu()
    await openMenu(user)

    // `Menu.Root` and `Menu.Portal` render no element of their own (the same
    // as the other Base UI wrappers in this repo), so only the rendered parts
    // carry a slot.
    for (const slot of [
      'dropdown-menu-trigger',
      'dropdown-menu-positioner',
      'dropdown-menu-content',
      'dropdown-menu-item',
      'dropdown-menu-separator',
    ]) {
      expect(document.querySelector(`[data-slot="${slot}"]`), slot).toBeInTheDocument()
    }
  })

  it('resolves the direction-aware placement and stays keyboard navigable under dir="rtl"', async () => {
    const user = userEvent.setup()
    renderMenu('rtl')
    await openMenu(user)

    // `align="end"` is Base UI's direction-aware alignment: the popup is never
    // pinned to a physical left/right edge, it follows the document direction.
    const content = document.querySelector('[data-slot="dropdown-menu-content"]')
    expect(content).toHaveAttribute('data-side', 'bottom')
    expect(content).toHaveAttribute('data-align', 'end')

    const items = screen.getAllByRole('menuitem')
    expect(items[0]).toHaveTextContent('الملف الشخصي')

    await user.keyboard('{ArrowDown}')
    await expectHighlight(items, 0)

    await user.keyboard('{ArrowDown}')
    await expectHighlight(items, 1)
  })
})
