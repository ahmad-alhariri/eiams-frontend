import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import { IconX } from '@tabler/icons-react'

import { cn } from '@/shared/utils/class-names'

export type { ToastOptions, ToastType } from '@/shared/ui/toast-manager'

function ToastProvider(props: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider data-slot="toast-provider" {...props} />
}

function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      {...props}
      data-slot="toast-viewport"
      className={cn(
        'pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:end-4 sm:items-end sm:p-0',
        className,
      )}
    />
  )
}

function ToastRoot({ className, ...props }: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      {...props}
      data-slot="toast-root"
      className={cn(
        'pointer-events-auto relative flex w-[min(92vw,400px)] gap-3 rounded-lg bg-popover p-4 text-base text-popover-foreground shadow-toast outline-none select-none',
        'border-inline-start-4 border-transparent',
        'data-[type=success]:border-success data-[type=error]:border-error data-[type=warning]:border-warning data-[type=info]:border-accent',
        'data-[starting-style]:animate-in data-[starting-style]:slide-in-from-top-full data-[starting-style]:duration-300 data-[starting-style]:ease-out',
        'data-[ending-style]:animate-out data-[ending-style]:slide-out-to-top-full data-[ending-style]:fade-out-0 data-[ending-style]:duration-200 data-[ending-style]:ease-in',
        'motion-reduce:transition-none motion-reduce:data-[starting-style]:animate-none motion-reduce:data-[ending-style]:animate-none',
        className,
      )}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      {...props}
      data-slot="toast-title"
      className={cn('text-base font-semibold text-foreground', className)}
    />
  )
}

function ToastDescription({ className, ...props }: ToastPrimitive.Description.Props) {
  return (
    <ToastPrimitive.Description
      {...props}
      data-slot="toast-description"
      className={cn('text-sm text-muted-foreground', className)}
    />
  )
}

function ToastClose({ className, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      {...props}
      aria-label="إغلاق الإشعار"
      data-slot="toast-close"
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors select-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <IconX aria-hidden />
    </ToastPrimitive.Close>
  )
}

export { ToastClose, ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport }
