import { useCallback } from 'react'

import { normalizeApiError } from '@/shared/services/api-error'
import { toast } from '@/shared/ui/toast-manager'

/**
 * Wraps an async form action so API failures are reported once, in Arabic,
 * and re-thrown for the caller's own error handling (e.g. inline field
 * mapping). Success toasts remain the caller's responsibility.
 */
export function useSubmitFeedback() {
  return useCallback(async (action: () => Promise<void>): Promise<void> => {
    try {
      await action()
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      toast.error({
        title: apiError.titleAr,
        ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
      })
      throw error
    }
  }, [])
}
