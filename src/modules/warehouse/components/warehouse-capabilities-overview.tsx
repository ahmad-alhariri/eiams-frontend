import { usePermission } from '@/modules/auth/hooks/use-permission'
import { WarehouseCapabilitiesEditor } from '@/modules/warehouse/components/warehouse-capabilities-editor'
import { OPERATION_LABELS } from '@/modules/warehouse/hooks/use-warehouse-capability-validation'
import { useWarehouseCapabilitiesQuery } from '@/modules/warehouse/hooks/use-warehouse-queries'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { Badge } from '@/shared/ui/badge'
import { Button } from '@/shared/ui/button'

/**
 * Read-only, server-authoritative capability matrix for one warehouse.
 * Changing the matrix remains a separate warehouse.manage flow.
 */
export function WarehouseCapabilitiesOverview({ warehouseId }: { warehouseId: string }) {
  const { has } = usePermission()
  const capabilitiesQuery = useWarehouseCapabilitiesQuery(warehouseId)

  if (capabilitiesQuery.isPending) {
    return (
      <ContentCard
        title="قدرات المستودع"
        description="المجالات والعمليات المسموح بها لهذا المستودع."
      >
        <LoadingSpinner className="min-h-32" label="جارٍ تحميل قدرات المستودع..." />
      </ContentCard>
    )
  }

  if (capabilitiesQuery.isError) {
    return (
      <ContentCard title="قدرات المستودع">
        <ErrorState
          className="min-h-48"
          title="تعذّر تحميل قدرات المستودع"
          description="تعذّر جلب المجالات والعمليات المسموح بها. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <Button type="button" onClick={() => void capabilitiesQuery.refetch()}>
              إعادة المحاولة
            </Button>
          }
        />
      </ContentCard>
    )
  }

  const capabilities = capabilitiesQuery.data ?? []
  const canManage = has('warehouse.manage')
  const editor = canManage ? (
    <WarehouseCapabilitiesEditor warehouseId={warehouseId} capabilities={capabilities} />
  ) : null

  if (capabilities.length === 0) {
    return (
      <ContentCard
        title="قدرات المستودع"
        description="المجالات والعمليات المسموح بها لهذا المستودع."
      >
        <p className="py-6 text-center text-muted-foreground" role="status">
          لا توجد قدرات معرّفة لهذا المستودع.
        </p>
        {editor}
      </ContentCard>
    )
  }

  return (
    <ContentCard
      title="قدرات المستودع"
      description="المجالات والعمليات المسموح بها لهذا المستودع. تُطبَّق القدرة عند ترحيل المستندات."
      action={editor}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-start">
          <caption className="sr-only">المجالات والعمليات المسموح بها للمستودع</caption>
          <thead className="border-b border-border text-sm text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3 text-start font-medium">
                مجال المواد
              </th>
              <th scope="col" className="px-3 py-3 text-start font-medium">
                العمليات المسموحة
              </th>
            </tr>
          </thead>
          <tbody>
            {capabilities.map((capability) => (
              <tr key={capability.capabilityId} className="border-b border-border last:border-b-0">
                <td className="px-3 py-4 font-medium text-foreground">
                  {capability.domain.displayName}
                </td>
                <td className="px-3 py-4">
                  <ul
                    className="flex flex-wrap gap-2"
                    aria-label={`عمليات ${capability.domain.displayName}`}
                  >
                    {capability.operations.map((operation) => (
                      <li key={operation}>
                        <Badge variant="secondary">{OPERATION_LABELS[operation]}</Badge>
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ContentCard>
  )
}
