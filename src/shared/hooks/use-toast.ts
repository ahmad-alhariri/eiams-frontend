import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { useMemo } from 'react'

import { toToastRequest, type ToastOptions, type ToastType } from '@/shared/ui/toast-manager'

/**
 * Imperative toast controls bound to the mounted Toaster provider. Use this
 * hook inside the provider tree when a component needs to update or dismiss a
 * specific toast by id; otherwise prefer the module-level `toast` facade.
 */
export function useToast() {
  const manager = ToastPrimitive.useToastManager()

  return useMemo(() => {
    const push = (type: ToastType, options: ToastOptions) =>
      manager.add(toToastRequest(type, options))

    return {
      success: (options: ToastOptions) => push('success', options),
      error: (options: ToastOptions) => push('error', options),
      warning: (options: ToastOptions) => push('warning', options),
      info: (options: ToastOptions) => push('info', options),
      dismiss: (id?: string) => manager.close(id),
      update: (id: string, updates: ToastOptions) => manager.update(id, updates),
    }
  }, [manager])
}
