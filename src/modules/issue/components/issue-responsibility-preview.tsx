import { useFormContext } from 'react-hook-form'

import type { IssuePetalContainer } from '@/modules/issue/components/issue-recipient-section'
import { issueResponsibilityPreview } from '@/modules/issue/responsibility-preview.model'

/**
 * Live preview of the responsibility/custody outcome for the currently
 * selected recipient (e16-t06). Purely presentational guidance under the
 * recipient section: custody creation is server-owned on posting, and the
 * preview renders nothing until a recipient type is chosen.
 */
export function IssueResponsibilityPreview() {
  const form = useFormContext<IssuePetalContainer>()
  const recipientType = String(form.watch('petal.issueTo.recipientType'))
  const displayName = form.watch('petal.issueToDisplayName')
  const preview = issueResponsibilityPreview(recipientType, displayName)

  if (preview.messageAr === null) {
    return null
  }

  return (
    <p data-slot="issue-responsibility-preview" className="text-sm text-muted-foreground">
      {preview.messageAr}
    </p>
  )
}
