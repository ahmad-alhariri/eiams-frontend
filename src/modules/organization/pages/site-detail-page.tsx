import { IconArrowRight, IconEdit } from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { SiteFormDialog } from '@/modules/organization/components/site-form-dialog'
import { useUpdateSiteMutation } from '@/modules/organization/hooks/use-site-mutations'
import { useSiteQuery } from '@/modules/organization/hooks/use-organization-queries'
import { toSiteRequest, type SiteFormValues } from '@/modules/organization/schemas/site.schemas'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { useSubmitFeedback } from '@/shared/hooks/use-submit-feedback'
import { Button } from '@/shared/ui/button'
import { toast } from '@/shared/ui/toast-manager'

/**
 * Read-only, contract-backed site profile. Related operational records remain
 * outside this page until v1 exposes a dedicated site relationship endpoint.
 */
function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const { has } = usePermission()
  const siteQuery = useSiteQuery(siteId)
  const updateMutation = useUpdateSiteMutation()
  const submitFeedback = useSubmitFeedback()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const site = siteQuery.data
  const canManage = has('organization.manage')

  const returnToSites = useCallback(() => navigate(ROUTE_PATHS.organizationSites), [navigate])
  const closeEditDialog = useCallback((open: boolean) => {
    if (!open) setIsEditDialogOpen(false)
  }, [])

  const submitForm = useCallback(
    async (values: SiteFormValues) => {
      if (site === undefined) return

      await submitFeedback(async () => {
        await updateMutation.mutateAsync({
          siteId: site.siteId,
          request: toSiteRequest(values, site),
        })
        setIsEditDialogOpen(false)
        toast.success({ title: 'تم حفظ تعديلات الموقع.' })
      })
    },
    [site, submitFeedback, updateMutation],
  )

  if (siteId === undefined || siteId === '') {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحديد الموقع"
          description="رابط الموقع غير مكتمل. ارجع إلى قائمة المواقع ثم اختر موقعاً صالحاً."
          action={
            <Button type="button" onClick={returnToSites}>
              العودة إلى المواقع
            </Button>
          }
        />
      </div>
    )
  }

  if (siteQuery.isPending) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل الموقع" />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل الموقع..." />
        </ContentCard>
      </div>
    )
  }

  if (siteQuery.isError || site === undefined) {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحميل تفاصيل الموقع"
          description="تعذّر جلب بيانات الموقع. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void siteQuery.refetch()}>
                إعادة المحاولة
              </Button>
              <Button type="button" variant="outline" onClick={returnToSites}>
                العودة إلى المواقع
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={site.nameAr}
        subtitle={`رمز الموقع: ${site.code}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <Button type="button" onClick={() => setIsEditDialogOpen(true)}>
                <IconEdit aria-hidden data-icon="inline-start" />
                تعديل الموقع
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={returnToSites}>
              <IconArrowRight aria-hidden data-icon="inline-start" />
              العودة إلى المواقع
            </Button>
          </div>
        }
      />

      <ContentCard title="بيانات الموقع" description="بيانات مرجعية للقراءة ضمن نطاق العمل الحالي.">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="اسم الموقع">{site.nameAr}</DetailField>
          <DetailField label="رمز الموقع" ltr>
            {site.code}
          </DetailField>
          <DetailField label="المحافظة">{site.governorate ?? '—'}</DetailField>
          <DetailField label="الحالة">
            <StatusBadge entity="record" status={site.status} />
          </DetailField>
          <div className="border-b border-border pb-4 sm:col-span-2 sm:border-b-0">
            <dt className="text-sm font-medium text-muted-foreground">العنوان</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground">{site.address ?? '—'}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-muted-foreground">معرّف الجهة المالكة</dt>
            <dd className="mt-1.5 font-mono text-sm text-foreground" dir="ltr">
              {site.organizationId ?? '—'}
            </dd>
          </div>
        </dl>
      </ContentCard>

      <SiteFormDialog
        open={isEditDialogOpen}
        site={site}
        isPending={updateMutation.isPending}
        onOpenChange={closeEditDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default SiteDetailPage
