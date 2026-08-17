import { IconChevronDown, IconEdit } from '@tabler/icons-react'
import { useCallback, useState, type ReactNode } from 'react'

import { StatusBadge } from '@/shared/feedback/status-badge'
import { Button } from '@/shared/ui/button'
import type { RecordStatus } from '@/shared/types/generated/eiams-v1'
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
}

type TreeBranchProps<T> = {
  collapsedIds: ReadonlySet<string>
  depth: number
  node: HierarchyTreeNode<T>
  onEdit: ((record: T) => void) | undefined
  onToggle: (recordId: string) => void
  props: Pick<HierarchyTreeProps<T>, 'getCode' | 'getKey' | 'getLabel' | 'getStatus' | 'leadIcon'>
}

function TreeBranch<T>({ collapsedIds, depth, node, onEdit, onToggle, props }: TreeBranchProps<T>) {
  const { children, data: record } = node
  const hasChildren = children.length > 0
  const isExpanded = !collapsedIds.has(props.getKey(record))

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
 * badge, and an optional edit action for permission-gated administration.
 */
export function HierarchyTree<T>({ nodes, ariaLabel, onEdit, ...props }: HierarchyTreeProps<T>) {
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
          onToggle={toggleExpanded}
          props={props}
        />
      ))}
    </ul>
  )
}
