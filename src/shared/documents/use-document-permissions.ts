import { useCallback, useMemo } from 'react'

import type { PermissionCode } from '@/config/permissions'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import type { DocumentActionType } from '@/shared/types/generated/eiams-v1'

/**
 * Canonical action → permission enforcement mapping (D-RBAC-01). Mirrors the
 * .NET backend vocabulary: each lifecycle action the server can authorize is
 * additionally gated by exactly one effective session permission code.
 * Attachment mutations share the update capability with document editing.
 */
export const ACTION_PERMISSION_CODES: Readonly<Record<DocumentActionType, PermissionCode>> = {
  Edit: 'document.update',
  Submit: 'document.submit',
  Post: 'document.post',
  Reject: 'document.reject',
  Revise: 'document.revise',
  Cancel: 'document.cancel',
  Reverse: 'document.reverse',
  UploadAttachment: 'document.update',
  DeleteAttachment: 'document.update',
}

/** Resolves the defence-in-depth permission code enforced for an action. */
export function getActionPermissionCode(action: DocumentActionType): PermissionCode {
  return ACTION_PERMISSION_CODES[action]
}

export interface DocumentLifecyclePermissions {
  /** Coarse gate for the whole lifecycle bar / detail page. */
  canView: boolean
  /** Stable predicate: whether the active scope may execute this action. */
  isActionPermitted: (action: DocumentActionType) => boolean
  /** The set of actions the active scope may execute, for bulk checks. */
  permittedActions: ReadonlySet<DocumentActionType>
}

/**
 * Defence-in-depth permission controller for the document lifecycle action
 * bar. The server-authoritative `DocumentPolicy` (presentation, blockers,
 * confirmation) remains the primary decision source; this layer only mirrors
 * the session scope's effective permissions so unauthorized actions are never
 * rendered — the same visibility contract the server enforces with `Hidden`.
 */
export function useDocumentLifecyclePermissions(): DocumentLifecyclePermissions {
  const { has } = usePermission()

  const canView = has('document.view')

  const isActionPermitted = useCallback(
    (action: DocumentActionType): boolean => canView && has(ACTION_PERMISSION_CODES[action]),
    [canView, has],
  )

  const permittedActions = useMemo<ReadonlySet<DocumentActionType>>(() => {
    const permitted = new Set<DocumentActionType>()
    for (const action of Object.keys(ACTION_PERMISSION_CODES) as DocumentActionType[]) {
      if (isActionPermitted(action)) {
        permitted.add(action)
      }
    }
    return permitted
  }, [isActionPermitted])

  return { canView, isActionPermitted, permittedActions }
}