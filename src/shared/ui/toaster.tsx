import { Toast as ToastPrimitive } from '@base-ui/react/toast'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconCircleX,
  IconInfoCircle,
  IconLoader2,
  type Icon,
} from '@tabler/icons-react'

import { cn } from '@/shared/utils/class-names'
import { toastManager, type ToastType } from '@/shared/ui/toast-manager'
import {
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastRoot,
  ToastTitle,
  ToastViewport,
} from '@/shared/ui/toast'

const TYPE_PRESENTATION: Record<ToastType | 'loading', { icon: Icon; color: string }> = {
  success: { icon: IconCircleCheck, color: 'text-success' },
  error: { icon: IconCircleX, color: 'text-error' },
  warning: { icon: IconAlertTriangle, color: 'text-warning' },
  info: { icon: IconInfoCircle, color: 'text-accent' },
  loading: { icon: IconLoader2, color: 'animate-spin text-muted-foreground' },
}

function ToasterViewport() {
  const { toasts } = ToastPrimitive.useToastManager()

  return (
    <ToastViewport>
      {toasts.map((item) => {
        const type = (item.type as ToastType | 'loading' | undefined) ?? 'info'
        const presentation = TYPE_PRESENTATION[type]
        const IconComponent = presentation.icon

        return (
          <ToastRoot key={item.id} toast={item}>
            <IconComponent
              aria-hidden
              data-slot="toast-icon"
              className={cn('mt-0.5 shrink-0 size-5', presentation.color)}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {item.title ? <ToastTitle>{item.title}</ToastTitle> : null}
              {item.description ? <ToastDescription>{item.description}</ToastDescription> : null}
            </div>
            <ToastClose />
          </ToastRoot>
        )
      })}
    </ToastViewport>
  )
}

/**
 * Renders the app-wide toast surface. Mount once in the application shell
 * (owned by eiams-frontend-e05-t01) so the imperative `toast` facade and the
 * `useToast` hook stay available across the app.
 */
export function Toaster() {
  return (
    <ToastProvider toastManager={toastManager} timeout={5000} limit={3}>
      <ToasterViewport />
    </ToastProvider>
  )
}
