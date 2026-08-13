import { Toast as ToastPrimitive, type ToastManagerAddOptions } from '@base-ui/react/toast'
import type { ReactNode } from 'react'

export const TOAST_TYPES = ['success', 'error', 'warning', 'info'] as const
export type ToastType = (typeof TOAST_TYPES)[number]

export interface ToastOptions {
  id?: string
  title?: ReactNode
  description?: ReactNode
  timeout?: number
  priority?: 'low' | 'high'
}

const DEFAULT_TIMEOUT = 5000

function resolveTimeout(type: ToastType, timeout?: number) {
  return timeout ?? (type === 'error' || type === 'warning' ? 0 : DEFAULT_TIMEOUT)
}

function resolvePriority(type: ToastType, priority?: 'low' | 'high') {
  return priority ?? (type === 'error' || type === 'warning' ? 'high' : 'low')
}

export function toToastRequest(
  type: ToastType,
  { timeout, priority, ...options }: ToastOptions,
): ToastManagerAddOptions<object> {
  return {
    ...options,
    type,
    timeout: resolveTimeout(type, timeout),
    priority: resolvePriority(type, priority),
  }
}

export const toastManager = ToastPrimitive.createToastManager<object>()

export const toast = {
  success: (options: ToastOptions) => toastManager.add(toToastRequest('success', options)),
  error: (options: ToastOptions) => toastManager.add(toToastRequest('error', options)),
  warning: (options: ToastOptions) => toastManager.add(toToastRequest('warning', options)),
  info: (options: ToastOptions) => toastManager.add(toToastRequest('info', options)),
  dismiss: (id?: string) => toastManager.close(id),
  promise: <Value>(
    promiseValue: Promise<Value>,
    feedback: {
      loading: string | ToastOptions
      success: string | ToastOptions | ((value: Value) => string | ToastOptions)
      error: string | ToastOptions | ((error: unknown) => string | ToastOptions)
    },
  ): Promise<Value> => {
    const normalize = (item: string | ToastOptions) =>
      typeof item === 'string' ? { title: item } : item
    return toastManager.promise(promiseValue, {
      loading: normalize(feedback.loading),
      success: (value) => {
        const item = feedback.success as
          string | ToastOptions | ((value: Value) => string | ToastOptions)
        return typeof item === 'function' ? normalize(item(value)) : normalize(item)
      },
      error: (reason) => {
        const item = feedback.error as
          string | ToastOptions | ((error: unknown) => string | ToastOptions)
        return typeof item === 'function' ? normalize(item(reason)) : normalize(item)
      },
    })
  },
}
