import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { IconLoader2 } from '@tabler/icons-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/shared/utils/class-names'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-base font-semibold whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-secondary aria-expanded:bg-secondary',
        outline:
          'border-primary bg-transparent text-primary hover:bg-primary hover:text-primary-foreground aria-expanded:bg-primary aria-expanded:text-primary-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-primary aria-expanded:bg-primary aria-expanded:text-primary-foreground',
        ghost:
          'text-foreground hover:bg-muted aria-expanded:bg-muted aria-expanded:text-foreground',
        destructive:
          'bg-destructive text-primary-foreground hover:bg-critical focus-visible:border-destructive focus-visible:ring-destructive',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-10 gap-2 px-4 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-3 has-data-[icon=inline-start]:ps-3',
        // The compact sizes keep their ui-design.md 5.1 height from the `sm`
        // breakpoint up (28/32px) and reach the 40px touch floor below it, so
        // a phone gets a 40px target without changing the desktop design.
        xs: "h-10 gap-1 px-2 text-xs sm:h-7 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-1.5 has-data-[icon=inline-start]:ps-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-10 gap-1.5 px-3 sm:h-8 in-data-[slot=button-group]:rounded-md has-data-[icon=inline-end]:pe-2 has-data-[icon=inline-start]:ps-2',
        lg: 'h-12 gap-2 px-6 has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4',
        'icon-xs':
          "size-10 in-data-[slot=button-group]:rounded-md sm:size-7 [&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'size-10 in-data-[slot=button-group]:rounded-md sm:size-8',
        'icon-lg': 'size-10',
        // standard-allow: touch-target-floor — this 36px icon size is the shared CALENDAR's day cell (src/shared/ui/calendar.tsx). Measured: 7 columns x 36px = 252px, plus the date popover's 10px padding on each side = a 272px popover, which fits the 360px viewport with 88px to spare; a 40px cell would make it 300px, wider than the 280px date field the popover opens from.
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean
  }

function Button({
  'aria-busy': ariaBusy,
  children,
  className,
  disabled,
  loading = false,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      {...props}
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || ariaBusy || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
    >
      {loading ? (
        <IconLoader2
          data-slot="button-loading-icon"
          data-icon="inline-start"
          className="animate-spin motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}
      {children}
    </ButtonPrimitive>
  )
}

// Generated shadcn consumers reuse the variant contract alongside the component.
// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants, type ButtonProps }
