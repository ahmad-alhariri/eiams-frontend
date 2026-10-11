/**
 * Shared collapsible hierarchy tree primitive.
 *
 * Owns the recursion, the collapse state, the toggle and edit controls, the
 * status badge slot, and the ARIA wiring that the consuming feature trees
 * (`material-category-tree`, `organizational-unit-tree`, and downstream
 * custody / count trees) used to duplicate. The component is generic over the
 * record type `T`; consumers supply the key, label, code, and status getters
 * plus an optional edit callback and an optional activate/deactivate callback.
 *
 * Interaction model
 * -----------------
 * The expand/collapse toggle is a real `<button>` with `aria-expanded`; the
 * optional edit action is a separate real `<button>` with an Arabic
 * `aria-label` that names the record being edited. The root list exposes the
 * tree under a consumer-supplied `ariaLabel`. Keyboard activation follows the
 * native semantics of those controls â€” focus, Enter/Space, and screen-reader
 * announcement work without extra wiring.
 *
 * Status type
 * -----------
 * `RecordStatus` is the only contract status enum in v1, so the badge slot
 * is typed against it directly. The import comes from the generated type
 * artifact at `@/shared/types/generated/eiams-v1`; once that artifact is
 * retired (per `whhu.5`) the import path will move to `@/shared/types` and
 * the public API of this component is unchanged.
 *
 * Generic forest builder
 * ----------------------
 * The companion `buildHierarchyForest` in `./hierarchy-tree.model.ts` builds a
 * resilient `HierarchyTreeNode<T>[]` from a flat list with parent
 * references. The two consume each other but neither imports the other from
 * the consumer's module, so neither feature tree carries duplicated tree
 * markup or duplicated parent-resolution logic.
 */
import { IconChevronDown, IconCheck, IconEdit, IconUserOff } from '@tabler/icons-react'
import { useCallback, useState, type ReactNode } from 'react'

import { StatusBadge } from '@/shared/feedback/status-badge'
import { Button } from '@/shared/ui/button'
import type { RecordStatus } from '@/shared/api/api-contracts'
import { cn } from '@/shared/utils/class-names'
import type { HierarchyTreeNode } from '@/shared/ui/hierarchy-tree.model'

export type { HierarchyTreeNode }

export interface HierarchyTreeProps<T> {
  nodes: readonly HierarchyTreeNode<T>[]
  /** Accessible name for the root list. */
  ariaLabel: string
  /** Leading glyph rendered before every label (folder, sitemap, ...). */
  leadIcon: ReactNode
  getKey: (record: T) => string
  getLabel: (record: T) => string
  getCode: (record: T) => string
  getStatus: (record: T) => RecordStatus
  onEdit?: (record: T) => void
  /**
   * Optional activate/deactivate action, drawn from `getStatus` so the button
   * offers the direction the row actually needs. Symmetrical with `onEdit`:
   * omitted means the tree is read-only for that record, and a consumer that
   * passes it is expected to gate it on its own permission.
   */
  onToggleStatus?: (record: T) => void
}

type TreeBranchProps<T> = {
  collapsedIds: ReadonlySet<string>
  depth: number
  node: HierarchyTreeNode<T>
  onEdit: ((record: T) => void) | undefined
  onToggleStatus: ((record: T) => void) | undefined
  onToggle: (recordId: string) => void
  props: Pick<HierarchyTreeProps<T>, 'getCode' | 'getKey' | 'getLabel' | 'getStatus' | 'leadIcon'>
}

function TreeBranch<T>({
  collapsedIds,
  depth,
  node,
  onEdit,
  onToggleStatus,
  onToggle,
  props,
}: TreeBranchProps<T>) {
  const { children, data: record } = node
  const hasChildren = children.length > 0
  const isExpanded = !collapsedIds.has(props.getKey(record))
  const isRecordActive = props.getStatus(record) === 'Active'

  return (
    <li data-depth={depth}>
      <div className="group flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label={`${isExpanded ? 'طي' : 'توسيع'} ${props.getLabel(record)}`}
            aria-expanded={isExpanded}
            onClick={() => onToggle(props.getKey(record))}
          >
            <IconChevronDown
              aria-hidden
              className={cn(
                'transition-transform motion-reduce:transition-none',
                isExpanded ? 'rotate-0' : '-rotate-90',
              )}
            />
          </Button>
        ) : (
          <span aria-hidden className="size-7 shrink-0" />
        )}
        {props.leadIcon}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{props.getLabel(record)}</p>
          <p dir="ltr" className="truncate text-start font-english text-xs text-muted-foreground">
            {props.getCode(record)}
          </p>
        </div>
        <StatusBadge entity="record" status={props.getStatus(record)} icon={false} />
        {onEdit === undefined ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`تعديل ${props.getLabel(record)}`}
            onClick={() => onEdit(record)}
          >
            <IconEdit aria-hidden />
          </Button>
        )}
        {onToggleStatus === undefined ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${isRecordActive ? 'تعطيل' : 'تنشيط'} ${props.getLabel(record)}`}
            onClick={() => onToggleStatus(record)}
          >
            {isRecordActive ? <IconUserOff aria-hidden /> : <IconCheck aria-hidden />}
          </Button>
        )}
      </div>
      {hasChildren && isExpanded ? (
        <ul className="me-5 border-e border-border pe-3">
          {children.map((child) => (
            <TreeBranch
              key={props.getKey(child.data)}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              onEdit={onEdit}
              onToggleStatus={onToggleStatus}
              onToggle={onToggle}
              props={props}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

/**
 * Collapsible, keyboard-accessible hierarchy built from server-derived nodes.
 * Each branch exposes an expand/collapse toggle (`aria-expanded`), a status
 * badge, and optional edit and activate/deactivate actions for
 * permission-gated administration.
 */
export function HierarchyTree<T>({
  nodes,
  ariaLabel,
  onEdit,
  onToggleStatus,
  ...props
}: HierarchyTreeProps<T>) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(() => new Set())

  const toggleExpanded = useCallback((recordId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current)
      if (next.has(recordId)) {
        next.delete(recordId)
      } else {
        next.add(recordId)
      }
      return next
    })
  }, [])

  return (
    <ul aria-label={ariaLabel} className="space-y-1">
      {nodes.map((node) => (
        <TreeBranch
          key={props.getKey(node.data)}
          node={node}
          depth={1}
          collapsedIds={collapsedIds}
          onEdit={onEdit}
          onToggleStatus={onToggleStatus}
          onToggle={toggleExpanded}
          props={props}
        />
      ))}
    </ul>
  )
}
