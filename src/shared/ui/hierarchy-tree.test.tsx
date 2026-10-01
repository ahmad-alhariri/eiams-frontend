import { IconFolder } from '@tabler/icons-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HierarchyTree, type HierarchyTreeProps } from '@/shared/ui/hierarchy-tree'
import type { HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'
import type { RecordStatus } from '@/shared/types/generated/eiams-v1'
/**
 * The shared primitive's own contract.
 *
 * Two feature-tree suites (`material-category-tree.test.tsx`,
 * `organizational-unit-tree.test.tsx`) exercise the integration. This suite
 * covers the surface only the shared component owns: the root `ariaLabel`,
 * the optional `onEdit` slot, the badge entity wiring, and the toggle's
 * `aria-expanded` transition across repeated clicks. It is intentionally a
 * sibling of `hierarchy-tree.model.test.ts` rather than a replacement for
 * either feature tree test.
 */

type TreeRow = {
  id: string
  name: string
  code: string
  status: RecordStatus
  parentId: string | null
}

const ROWS: readonly TreeRow[] = [
  { id: 'root', name: 'الإدارة العامة', code: 'HQ', status: 'Active', parentId: null },
  { id: 'child', name: 'مديرية تقنية المعلومات', code: 'IT', status: 'Active', parentId: 'root' },
  { id: 'grandchild', name: 'قسم الشبكات', code: 'NET', status: 'Inactive', parentId: 'child' },
  { id: 'leaf', name: 'قسم الحواسيب', code: 'PC', status: 'Active', parentId: 'child' },
]

function forest(): HierarchyTreeNode<TreeRow>[] {
  return [
    {
      data: ROWS[0]!,
      children: [
        {
          data: ROWS[1]!,
          children: [
            { data: ROWS[2]!, children: [] },
            { data: ROWS[3]!, children: [] },
          ],
        },
      ],
    },
  ]
}

function renderTree(
  overrides: Partial<HierarchyTreeProps<TreeRow>> = {},
): ReturnType<typeof render> {
  return render(
    <HierarchyTree
      nodes={forest()}
      ariaLabel="شجرة الوحدات التنظيمية"
      leadIcon={<IconFolder aria-hidden className="size-4 shrink-0 text-golden-wheat" />}
      getKey={(row) => row.id}
      getLabel={(row) => row.name}
      getCode={(row) => row.code}
      getStatus={(row) => row.status}
      {...overrides}
    />,
  )
}

describe('HierarchyTree (shared primitive)', () => {
  it('lands the consumer-supplied ariaLabel on the root list', () => {
    renderTree()

    const root = screen.getByRole('list', { name: 'شجرة الوحدات التنظيمية' })
    expect(root).toBeInTheDocument()
  })

  it('renders the label and code for every record, with the code in LTR', () => {
    renderTree()

    for (const row of ROWS) {
      expect(screen.getByText(row.name)).toBeInTheDocument()
      const codeNode = screen.getByText(row.code)
      expect(codeNode).toBeInTheDocument()
      expect(codeNode).toHaveAttribute('dir', 'ltr')
    }
  })

  it('renders a status badge for every record through the shared StatusBadge', () => {
    renderTree({ ariaLabel: 'شجرة الاختبار' })

    // Active and Inactive both render through the shared StatusBadge with the
    // entity="record" variant; we only assert the badges are present, not the
    // styling, which is the StatusBadge's own contract.
    expect(screen.getAllByText('نشط').length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('غير نشط')).toBeInTheDocument()
  })

  it('renders the lead icon for every record', () => {
    renderTree()

    // The leadIcon is a presentational IconFolder per row, rendered as a
    // decorative <svg aria-hidden="true" class="...tabler-icon-folder">.
    // We count those inside the root list and confirm at least one per row.
    const root = screen.getByRole('list', { name: 'شجرة الوحدات التنظيمية' })
    const leadIcons = root.querySelectorAll('svg[aria-hidden="true"].tabler-icon-folder')
    expect(leadIcons.length).toBe(ROWS.length)
  })

  it('starts expanded: every descendant label is reachable without interaction', () => {
    renderTree()

    for (const row of ROWS) {
      expect(screen.getByText(row.name)).toBeVisible()
    }
  })

  it('flips aria-expanded on the toggle when clicked, and the descendants disappear', async () => {
    const user = userEvent.setup()
    renderTree()

    // Root has children: its toggle is rendered with aria-expanded="true" at first.
    const toggle = screen.getByRole('button', { name: 'طي الإدارة العامة' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(toggle)

    // After clicking, the same toggle is now the expand action.
    const expandToggle = screen.getByRole('button', { name: 'توسيع الإدارة العامة' })
    expect(expandToggle).toHaveAttribute('aria-expanded', 'false')

    // The descendants are no longer rendered while collapsed.
    expect(screen.queryByText('مديرية تقنية المعلومات')).not.toBeInTheDocument()
    expect(screen.queryByText('قسم الشبكات')).not.toBeInTheDocument()
  })

  it('re-expands on a second click and re-shows the descendants', async () => {
    const user = userEvent.setup()
    renderTree()

    await user.click(screen.getByRole('button', { name: 'طي الإدارة العامة' }))
    expect(screen.queryByText('مديرية تقنية المعلومات')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'توسيع الإدارة العامة' }))
    expect(screen.getByText('مديرية تقنية المعلومات')).toBeInTheDocument()
  })

  it('does not render an edit button when onEdit is omitted', () => {
    renderTree()

    expect(screen.queryByRole('button', { name: /تعديل/ })).not.toBeInTheDocument()
  })

  it('renders an edit button with an Arabic aria-label naming the record when onEdit is provided', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    renderTree({ onEdit })

    const editButtons = screen.getAllByRole('button', { name: /^تعديل /u })
    expect(editButtons.length).toBe(ROWS.length)

    // Each edit button names the record it edits, so screen readers can pick
    // the right one. The label carries the row's Arabic name verbatim.
    expect(screen.getByRole('button', { name: 'تعديل الإدارة العامة' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'تعديل مديرية تقنية المعلومات' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'تعديل قسم الحواسيب' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    expect(onEdit).toHaveBeenCalledWith(ROWS[3])
  })

  it('does not render a toggle button for leaf nodes', () => {
    renderTree()

    // The two leaves ("قسم الشبكات" and "قسم الحواسيب") have no children, so
    // they expose no expand/collapse control. Their edit/aria-label buttons,
    // when present, must not carry the "طي" / "توسيع" prefix.
    expect(
      screen.queryByRole('button', { name: 'طي قسم الشبكات' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'توسيع قسم الشبكات' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'طي قسم الحواسيب' }),
    ).not.toBeInTheDocument()
  })
})
