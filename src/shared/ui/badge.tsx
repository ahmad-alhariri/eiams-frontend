import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/shared/utils/class-names'

const badgeVariants = cva(
  'group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-secondary',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-primary',
        success: 'bg-success text-primary-foreground [a]:hover:bg-accent',
        warning: 'bg-warning text-primary-foreground [a]:hover:bg-golden-wheat/90',
        critical: 'bg-critical text-primary-foreground [a]:hover:bg-destructive',
        destructive:
          'bg-destructive text-primary-foreground focus-visible:ring-destructive [a]:hover:bg-critical',
        outline:
          'border-border bg-transparent text-foreground [a]:hover:bg-muted [a]:hover:text-foreground',
        ghost: 'text-muted-foreground [a]:hover:bg-muted [a]:hover:text-foreground',
        link: 'text-accent underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeProps = useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>

function Badge({ className, variant = 'default', render, ...props }: BadgeProps) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  })
}

// Generated shadcn consumers reuse the variant contract alongside the component.
// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants, type BadgeProps }
