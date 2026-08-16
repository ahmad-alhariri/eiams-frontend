import { IconArrowRight, IconChevronLeft } from '@tabler/icons-react'
import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { MaterialUnitConversions } from '@/modules/catalog/components/material-unit-conversions'
import { useMaterialQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import {
  MATERIAL_KIND_LABELS,
  TRACKING_TYPE_LABELS,
} from '@/modules/catalog/constants/catalog-labels'
import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import type { Material, MaterialKind, NamedReference } from '@/shared/types/generated/eiams-v1'

function HierarchyStep({ label, reference }: { label: string; reference: NamedReference }) {
  return (
    <li className="flex min-w-36 flex-1 flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{reference.displayName}</span>
      <span className="text-xs text-muted-foreground" dir="ltr">
        {reference.code}
      </span>
    </li>
  )
}

function policyDescription(materialKind: MaterialKind): string {
  switch (materialKind) {
    case 'Consumable':
      return 'لا تنشأ عهدة بعد الصرف؛ وتنتهي مسؤولية المستودع عند ترحيل سند الصرف.'
    case 'Durable':
      return 'تُنشأ عهدة تشغيلية إلزامية عند الصرف، من دون إنشاء سجل أصل ثابت.'
    case 'Asset':
      return 'تُنشأ عهدة إلزامية، ويُسجّل كل أصل في سجل الأصول بمعرّف داخلي للمؤسسة.'
  }
}

function assetNumberPolicy(materialKind: MaterialKind): string {
  return materialKind === 'Asset' ? 'مطلوب (رقم أصل داخلي)' : 'غير مسموح'
}

/**
 * Read-only material profile. The API supplies the authoritative hierarchy and
 * D-MAT-01 classification fields. Asset and custody actions remain in their
 * downstream modules; material-specific unit conversions are managed here.
 */
function MaterialDetailPage() {
  const { materialId } = useParams<{ materialId: string }>()
  const navigate = useNavigate()
  const materialQuery = useMaterialQuery(materialId)
  const material = materialQuery.data
  const returnToMaterials = useCallback(() => navigate(ROUTE_PATHS.catalogMaterials), [navigate])

  if (materialId === undefined || materialId === '') {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحديد المادة"
          description="رابط المادة غير مكتمل. ارجع إلى القائمة ثم اختر مادة صالحة."
          action={
            <Button type="button" onClick={returnToMaterials}>
              العودة إلى الأصناف
            </Button>
          }
        />
      </div>
    )
  }

  if (materialQuery.isPending) {
    return (
      <div dir="rtl" className="min-w-0">
        <PageHeader title="تفاصيل المادة" />
        <ContentCard>
          <LoadingSpinner className="min-h-48" label="جارٍ تحميل تفاصيل المادة..." />
        </ContentCard>
      </div>
    )
  }

  if (materialQuery.isError) {
    return (
      <div dir="rtl" className="min-w-0">
        <ErrorState
          title="تعذّر تحميل تفاصيل المادة"
          description="تعذّر جلب بيانات المادة. تحقق من الاتصال ثم أعد المحاولة."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" onClick={() => void materialQuery.refetch()}>
                إعادة المحاولة
              </Button>
              <Button type="button" variant="outline" onClick={returnToMaterials}>
                العودة إلى الأصناف
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  if (material == null) {
    return (
      <div dir="rtl" className="min-w-0">
        <EmptyState
          title="لا تتوفر بيانات المادة"
          description="لم تُرجع الخدمة بيانات قابلة للعرض لهذه المادة. ارجع إلى القائمة واختر مادة أخرى."
          action={
            <Button type="button" onClick={returnToMaterials}>
              العودة إلى الأصناف
            </Button>
          }
        />
      </div>
    )
  }

  return <MaterialDetail material={material} onReturn={returnToMaterials} />
}

function MaterialDetail({ material, onReturn }: { material: Material; onReturn: () => void }) {
  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={material.nameAr}
        subtitle={`رمز المادة: ${material.code}`}
        actions={
          <Button type="button" variant="outline" onClick={onReturn}>
            <IconArrowRight aria-hidden data-icon="inline-start" />
            العودة إلى الأصناف
          </Button>
        }
      />

      <ContentCard
        title="التسلسل التصنيفي"
        description="يعرض هذا المسار المرجعي للمادة كما يعتمد عليه كتالوج المؤسسة."
      >
        <ol className="flex flex-wrap items-stretch gap-2" aria-label="التسلسل التصنيفي للمادة">
          <HierarchyStep label="المجال" reference={material.domain} />
          <IconChevronLeft
            className="my-auto hidden size-5 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
          <HierarchyStep label="التصنيف" reference={material.category} />
          <IconChevronLeft
            className="my-auto hidden size-5 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
          <HierarchyStep label="العائلة" reference={material.family} />
          <IconChevronLeft
            className="my-auto hidden size-5 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
          <li className="flex min-w-36 flex-1 flex-col gap-1 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <span className="text-xs font-medium text-muted-foreground">المادة</span>
            <span className="font-semibold text-foreground">{material.nameAr}</span>
            <span className="text-xs text-muted-foreground" dir="ltr">
              {material.code}
            </span>
          </li>
        </ol>
      </ContentCard>

      <ContentCard
        title="بيانات المادة"
        description="بيانات مرجعية للقراءة فقط ضمن نطاق العمل الحالي."
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="اسم المادة">{material.nameAr}</DetailField>
          <DetailField label="رمز المادة" ltr>
            {material.code}
          </DetailField>
          <DetailField label="وحدة القياس الأساسية">{material.baseUnit.displayName}</DetailField>
          <DetailField label="الحالة">
            <StatusBadge entity="record" status={material.status} />
          </DetailField>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-muted-foreground">وصف المادة</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground">
              {material.descriptionAr ?? '—'}
            </dd>
          </div>
        </dl>
      </ContentCard>

      <ContentCard
        title="سياسة التصنيف والتتبع"
        description="تُعرض القيم المعتمدة للمادة وفق سياسة D-MAT-01."
      >
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <DetailField label="نوع المادة">
            {MATERIAL_KIND_LABELS[material.materialKind]}
          </DetailField>
          <DetailField label="أسلوب التتبع">
            {TRACKING_TYPE_LABELS[material.trackingType]}
          </DetailField>
          <DetailField label="رقم الأصل">{assetNumberPolicy(material.materialKind)}</DetailField>
          <DetailField label="المسؤولية بعد الصرف">
            {policyDescription(material.materialKind)}
          </DetailField>
        </dl>
      </ContentCard>

      <MaterialUnitConversions material={material} />
    </div>
  )
}

export default MaterialDetailPage
