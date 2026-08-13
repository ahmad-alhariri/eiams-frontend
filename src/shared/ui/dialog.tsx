import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { IconX } from '@tabler/icons-react'

import { Button } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'

type DialogSize = 'sm' | 'md' | 'lg' | 'xl'

function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      {...props}
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-deep-umber/60 backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-open:duration-[250ms] data-closed:animate-out data-closed:fade-out-0 data-closed:duration-200 motion-reduce:transition-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none',
        className,
      )}
    />
  )
}

function DialogContent({
  children,
  className,
  showCloseButton = true,
  size = 'md',
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
  size?: DialogSize
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        {...props}
        data-slot="dialog-content"
        data-size={size}
        className={cn(
          'fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-[90vw] gap-6 overflow-y-auto rounded-xl bg-popover p-6 text-base text-popover-foreground shadow-modal outline-none sm:p-8 data-[size=sm]:max-w-[30rem] data-[size=md]:max-w-[40rem] data-[size=lg]:max-w-[50rem] data-[size=xl]:max-w-[90vw] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:duration-[250ms] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-200 motion-reduce:transition-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none',
          className,
        )}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            aria-label="إغلاق النافذة"
            data-slot="dialog-close"
            render={<Button size="icon-sm" variant="ghost" />}
          >
            <IconX aria-hidden />
            <span className="sr-only">إغلاق النافذة</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-start', className)}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="dialog-footer"
      className={cn('flex flex-col gap-2 sm:flex-row sm:justify-start', className)}
    />
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      {...props}
      data-slot="dialog-title"
      className={cn('text-xl leading-tight font-semibold text-foreground', className)}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      {...props}
      data-slot="dialog-description"
      className={cn('text-base text-muted-foreground', className)}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  type DialogSize,
}
