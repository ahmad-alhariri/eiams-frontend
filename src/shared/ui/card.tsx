import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/class-names'

type CardProps = ComponentProps<'div'> & {
  size?: 'default' | 'sm'
}

function Card({ className, size = 'default', ...props }: CardProps) {
  return (
    <div
      {...props}
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl border border-border bg-popover py-(--card-spacing) text-base text-card-foreground shadow-card transition-shadow [--card-spacing:--spacing(6)] hover:shadow-card-hover has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(4)] *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        className,
      )}
    />
  )
}

function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) text-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className,
      )}
    />
  )
}

function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-title"
      className={cn(
        'text-lg leading-tight font-semibold text-foreground group-data-[size=sm]/card:text-base',
        className,
      )}
    />
  )
}

function CardDescription({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
    />
  )
}

function CardAction({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
    />
  )
}

function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-content"
      className={cn('flex flex-col gap-3 px-(--card-spacing)', className)}
    />
  )
}

function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-xl px-(--card-spacing) [.border-t]:pt-(--card-spacing)',
        className,
      )}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  type CardProps,
}
