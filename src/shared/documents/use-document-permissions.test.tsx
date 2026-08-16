import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { authSessionQueryKey } from '@/modules/auth/services/session-lifecycle'
import { createQueryClient } from '@/shared/services/query.client'
import type { DocumentActionType, SessionResponse } from '@/shared/types/generated/eiams-v1'
import {
  ACTION_PERMISSION_CODES,
  getActionPermissionCode,
  useDocumentLifecyclePermissions,
} from '@/shared/documents/use-document-permissions'

/** Mutable session-scope mock; tests swap the effective permissionCodes. */
const activeSession = vi.hoisted(() => ({
  permissionCodes: ['document.view'] as readonly string[],
}))

const ALL_ACTIONS: readonly DocumentActionType[] = [
  'Edit',
  'Submit',
  'Post',
  'Reject',
  'Revise',
  'Cancel',
  'Reverse',
  'UploadAttachment',
  'DeleteAttachment',
]

function sessionWith(permissionCodes: readonly string[]): SessionResponse {
  return {
    user: {
      userId: '10000000-0000-4000-8000-000000000001',
      username: 'warehouse.manager',
      displayName: 'مدير المستودع',
      status: 'Active',
      rowVersion: 1,
    },
    permissionCodes: [...permissionCodes],
    availableScopes: [],
    scopeState: 'Selected',
    activeRoles: [],
  }
}

function createQueryWrapper() {
  const client = createQueryClient()
  client.setQueryData(authSessionQueryKey, sessionWith(activeSession.permissionCodes))
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

afterEach(() => {
  activeSession.permissionCodes = ['document.view']
})

describe('document action → permission mapping', () => {
  it('covers every DocumentActionType with the backend permission vocabulary', () => {
    expect(Object.keys(ACTION_PERMISSION_CODES)).toEqual(ALL_ACTIONS)

    expect(getActionPermissionCode('Submit')).toBe('document.submit')
    expect(getActionPermissionCode('Post')).toBe('document.post')
    expect(getActionPermissionCode('Reject')).toBe('document.reject')
    expect(getActionPermissionCode('Revise')).toBe('document.revise')
    expect(getActionPermissionCode('Cancel')).toBe('document.cancel')
    expect(getActionPermissionCode('Reverse')).toBe('document.reverse')
    expect(getActionPermissionCode('Edit')).toBe('document.update')
    expect(getActionPermissionCode('UploadAttachment')).toBe('document.update')
    expect(getActionPermissionCode('DeleteAttachment')).toBe('document.update')
  })
})

describe('useDocumentLifecyclePermissions', () => {
  it('permits an action only under its mapped code', () => {
    activeSession.permissionCodes = ['document.view', 'document.submit']

    const { result } = renderHook(() => useDocumentLifecyclePermissions(), {
      wrapper: createQueryWrapper().wrapper,
    })

    expect(result.current.canView).toBe(true)
    expect(result.current.isActionPermitted('Submit')).toBe(true)
    for (const action of ALL_ACTIONS) {
      if (action !== 'Submit') {
        expect(result.current.isActionPermitted(action)).toBe(false)
      }
    }
    expect([...result.current.permittedActions]).toEqual(['Submit'])
  })

  it('denies every action when the session lacks document.view', () => {
    activeSession.permissionCodes = ['document.submit', 'document.post', 'document.update']

    const { result } = renderHook(() => useDocumentLifecyclePermissions(), {
      wrapper: createQueryWrapper().wrapper,
    })

    expect(result.current.canView).toBe(false)
    for (const action of ALL_ACTIONS) {
      expect(result.current.isActionPermitted(action)).toBe(false)
    }
    expect(result.current.permittedActions.size).toBe(0)
  })

  it('derives permittedActions from the effective document.* set', () => {
    activeSession.permissionCodes = [
      'document.view',
      'document.update',
      'document.cancel',
      'document.reverse',
    ]

    const { result } = renderHook(() => useDocumentLifecyclePermissions(), {
      wrapper: createQueryWrapper().wrapper,
    })

    expect([...result.current.permittedActions].sort()).toEqual([
      'Cancel',
      'DeleteAttachment',
      'Edit',
      'Reverse',
      'UploadAttachment',
    ])
    expect(result.current.isActionPermitted('Post')).toBe(false)
    expect(result.current.isActionPermitted('Submit')).toBe(false)
  })

  it('flips the gates when the active session scope changes', async () => {
    activeSession.permissionCodes = ['document.view', 'document.post']
    const { client, wrapper } = createQueryWrapper()

    const { result } = renderHook(() => useDocumentLifecyclePermissions(), { wrapper })
    expect(result.current.isActionPermitted('Post')).toBe(true)

    activeSession.permissionCodes = ['document.view']
    client.setQueryData(authSessionQueryKey, sessionWith(activeSession.permissionCodes))

    await waitFor(() => {
      expect(result.current.isActionPermitted('Post')).toBe(false)
      expect(result.current.isActionPermitted('Revise')).toBe(false)
      expect([...result.current.permittedActions]).toEqual([])
    })
  })
})