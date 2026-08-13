import type { ComponentProps } from 'react'

import { cn } from '@/shared/utils/class-names'

type SkeletonProps = ComponentProps<'div'>

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      data-slot="skeleton"
      className={cn(
        'relative overflow-hidden rounded-sm bg-muted before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-linear-to-r before:from-transparent before:via-popover/80 before:to-transparent motion-reduce:before:animate-none',
        className,
      )}
    />
  )
}

export { Skeleton, type SkeletonProps }
