import { lazy, useState } from 'react'

import { Button } from '@/shared/ui/button'

/**
 * Simulated slow route chunk: resolves after a real delay so the gallery can
 * demonstrate the RouteSuspense spinner without a fake network layer.
 */
export const SlowDemoPage = lazy(async () => {
  await new Promise((resolve) => setTimeout(resolve, 1200))
  return {
    default: () => (
      <p className="text-center text-base text-foreground">
        اكتمل تحميل الصفحة التجريبية بعد التأخير المتعمد.
      </p>
    ),
  }
})

export function BoundaryDemoBomb() {
  const [armed, setArmed] = useState(false)
  if (armed) {
    throw new Error('خطأ تجريبي مطلق عمداً من عينة DomainErrorBoundary.')
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">اضغط الزر لإطلاق خطأ داخل غلاف الحدود:</p>
      <Button type="button" variant="outline" onClick={() => setArmed(true)}>
        إطلاق الخطأ التجريبي
      </Button>
    </div>
  )
}
