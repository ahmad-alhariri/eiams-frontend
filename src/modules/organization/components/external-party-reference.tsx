import { useExternalPartyQuery } from '@/modules/organization/hooks/use-organization-queries'
import { StatusBadge } from '@/shared/feedback/status-badge'

/**
 * Historical counterpart display. Unlike write selectors it deliberately
 * resolves inactive parties, so existing IssueTo/Custody records never lose
 * their human-readable counterparty after a soft deactivation.
 */
export function ExternalPartyReference({ externalPartyId }: { externalPartyId: string }) {
  const partyQuery = useExternalPartyQuery(externalPartyId)

  if (partyQuery.isPending) {
    return <span className="text-sm text-muted-foreground">جارٍ تحميل الجهة...</span>
  }

  if (partyQuery.isError || partyQuery.data === undefined) {
    return <span className="text-sm text-muted-foreground">جهة خارجية غير متاحة</span>
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span>{partyQuery.data.nameAr}</span>
      <StatusBadge entity="record" status={partyQuery.data.status} />
    </span>
  )
}
