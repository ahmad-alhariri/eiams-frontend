import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'

import { Button, type ButtonProps } from '@/shared/ui/button'
import { cn } from '@/shared/utils/class-names'

type AlertDialogSize = 'sm' | 'md'

function AlertDialog(props: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal(props: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      {...props}
      data-slot="alert-dialog-overlay"
      className={cn(
        'fixed inset-0 isolate z-50 bg-deep-umber/60 backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-open:duration-[250ms] data-closed:animate-out data-closed:fade-out-0 data-closed:duration-200 motion-reduce:transition-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none',
        className,
      )}
    />
  )
}

function AlertDialogContent({
  className,
  size = 'md',
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  size?: AlertDialogSize
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        {...props}
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          'fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-[90vw] gap-6 overflow-y-auto rounded-xl bg-popover p-6 text-base text-popover-foreground shadow-modal outline-none sm:p-8 data-[size=sm]:max-w-[30rem] data-[size=md]:max-w-[40rem] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-open:duration-[250ms] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-closed:duration-200 motion-reduce:transition-none motion-reduce:data-open:animate-none motion-reduce:data-closed:animate-none',
          className,
        )}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-2 text-start', className)}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col gap-2 sm:flex-row sm:justify-start', className)}
    />
  )
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="alert-dialog-media"
      className={cn(
        'inline-flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-6',
        className,
      )}
    />
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      {...props}
      data-slot="alert-dialog-title"
      className={cn('text-lg leading-tight font-semibold text-foreground', className)}
    />
  )
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      {...props}
      data-slot="alert-dialog-description"
      className={cn('text-base text-muted-foreground', className)}
    />
  )
}

function AlertDialogAction({ className, variant = 'destructive', ...props }: ButtonProps) {
  return (
    <Button
      {...props}
      data-slot="alert-dialog-action"
      variant={variant}
      className={cn(className)}
    />
  )
}

function AlertDialogCancel({
  className,
  size = 'default',
  variant = 'outline',
  ...props
}: AlertDialogPrimitive.Close.Props & Pick<ButtonProps, 'size' | 'variant'>) {
  return (
    <AlertDialogPrimitive.Close
      {...props}
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button size={size} variant={variant} />}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
  type AlertDialogSize,
}
