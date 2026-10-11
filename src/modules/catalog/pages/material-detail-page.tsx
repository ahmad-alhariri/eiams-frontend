import {
  IconArchive,
  IconArrowRight,
  IconCheck,
  IconChevronLeft,
  IconUserOff,
} from '@tabler/icons-react'
import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'

import { ROUTE_PATHS } from '@/config/routes'
import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialStatusBadge } from '@/modules/catalog/components/material-status-badge'
import { MaterialUnitConversions } from '@/modules/catalog/components/material-unit-conversions'
import { useSetMaterialStatusMutation } from '@/modules/catalog/hooks/use-catalog-mutations'
import {
  useMaterialCategoryQuery,
  useMaterialFamilyQuery,
  useMaterialQuery,
} from '@/modules/catalog/hooks/use-catalog-queries'
import {
  MATERIAL_KIND_LABELS,
  TRACKING_TYPE_LABELS,
} from '@/modules/catalog/constants/catalog-labels'
import type { Material, MaterialStatus } from '@/modules/catalog/types/catalog.types'
import { EmptyState } from '@/shared/feedback/empty-state'
import { ErrorState } from '@/shared/feedback/error-state'
import { LoadingSpinner } from '@/shared/feedback/loading-spinner'
import { ContentCard } from '@/shared/layout/content-card'
import { DetailField } from '@/shared/layout/detail-field'
import { PageHeader } from '@/shared/layout/page-header'
import { Button } from '@/shared/ui/button'
import { ConfirmDialog } from '@/shared/ui/confirm-dialog'
import { toast } from '@/shared/ui/toast-manager'

type MaterialKind = Material['materialKind']

/** The two directions the status command can take, and the only two. */
type ToggleableMaterialStatus = Exclude<MaterialStatus, 'Archived'>

const TOGGLEABLE_STATUS: Record<ToggleableMaterialStatus, ToggleableMaterialStatus> = {
  Active: 'Inactive',
  Inactive: 'Active',
}

function HierarchyStep({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex min-w-36 flex-1 flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </li>
  )
}

function policyDescription(materialKind: MaterialKind): string {
  switch (materialKind) {
    case 'Consumable':
      return 'لا تنشأ عهدة بعد الصرف؛ وتنتهي مسؤولية المستودع عند ترحيل سند الصرف.'
    case 'Durable':
      return 'يبقى الأصل ضمن عهدة الجهة حتى إعادته أو استبعاده، ويجوز صرفه أكثر من مرة دون استهلاكه.'
    case 'Asset':
      return 'تُنشأ عهدة إلزامية، ويُسجّل كل أصل في سجل الأصول بمعرّف داخلي للمؤسسة.'
  }
}

function assetNumberPolicy(materialKind: MaterialKind): string {
  return materialKind === 'Asset' ? 'مطلوب (رقم أصل داخلي)' : 'غير مطلوب'
}

/**
 * Material profile. The descriptive fields are read-only, but the status
 * command IS reachable here — the same activate/deactivate/archive route the
 * list row uses — so a manager who lands on a material does not have to go back
 * to the table to act on it.
 *
 * The record carries `materialDomainName` FLAT, and only `familyId` — there is
 * no nested domain/category/family reference any more — so the category step of
 * the breadcrumb is resolved by reading the family and then its category, one
 * contract-backed lookup each. Asset and custody actions remain in their
 * downstream modules; material-specific unit conversions are managed here.
 */
function MaterialDetailPage() {
  const { materialId } = useParams<{ materialId: string }>()
  const navigate = useNavigate()
  const materialQuery = useMaterialQuery(materialId)
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

  if (materialQuery.data == null) {
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

  return <MaterialDetail material={materialQuery.data} onReturn={returnToMaterials} />
}

function MaterialDetail({ material, onReturn }: { material: Material; onReturn: () => void }) {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const familyQuery = useMaterialFamilyQuery(material.familyId)
  const family = familyQuery.data
  const categoryQuery = useMaterialCategoryQuery(family?.categoryId)
  const category = categoryQuery.data
  const statusMutation = useSetMaterialStatusMutation()
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false)
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false)
  const isArchived = material.status === 'Archived'
  const nextStatus = isArchived ? null : TOGGLEABLE_STATUS[material.status]
  const isActive = material.status === 'Active'

  /**
   * Activate/deactivate is ONE command with the other ordinal; ARCHIVE is a
   * separate, terminal direction. An archived material offers NO status action
   * at all: `MaterialStatusOrdinal` has no value that leaves `Archived`, and the
   * copy below says so rather than pretending a route exists.
   */
  const confirmStatusChange = useCallback(async () => {
    if (nextStatus === null) return

    try {
      await statusMutation.mutateAsync({ materialId: material.id, status: nextStatus })
    } catch {
      return
    }

    toast.success({
      title:
        nextStatus === 'Inactive'
          ? 'تم تعطيل المادة مع الاحتفاظ بالمراجع السابقة.'
          : 'تم تنشيط المادة من جديد.',
    })
    setIsStatusDialogOpen(false)
  }, [material.id, nextStatus, statusMutation])

  const confirmArchive = useCallback(async () => {
    try {
      await statusMutation.mutateAsync({ materialId: material.id, status: 'Archived' })
    } catch {
      return
    }

    toast.success({ title: 'تمت أرشفة المادة نهائياً.' })
    setIsArchiveDialogOpen(false)
  }, [material.id, statusMutation])

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title={material.nameAr}
        subtitle={`رمز المادة: ${material.code}`}
        actions={
          <>
            {canManage && nextStatus !== null ? (
              <Button type="button" variant="outline" onClick={() => setIsStatusDialogOpen(true)}>
                {isActive ? (
                  <IconUserOff aria-hidden data-icon="inline-start" />
                ) : (
                  <IconCheck aria-hidden data-icon="inline-start" />
                )}
                {isActive ? 'تعطيل المادة' : 'تنشيط المادة'}
              </Button>
            ) : null}
            {canManage && !isArchived ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setIsArchiveDialogOpen(true)}
              >
                <IconArchive aria-hidden data-icon="inline-start" />
                أرشفة نهائية
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={onReturn}>
              <IconArrowRight aria-hidden data-icon="inline-start" />
              العودة إلى الأصناف
            </Button>
          </>
        }
      />

      <ContentCard
        title="التسلسل التصنيفي"
        description="يعرض هذا المسار المرجعي للمادة كما يعتمد عليه كتالوج المؤسسة."
      >
        <ol className="flex flex-wrap items-stretch gap-2" aria-label="التسلسل التصنيفي للمادة">
          <HierarchyStep label="المجال" value={material.materialDomainName} />
          <IconChevronLeft
            className="my-auto hidden size-5 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
          <HierarchyStep label="التصنيف" value={category?.name ?? '—'} />
          <IconChevronLeft
            className="my-auto hidden size-5 shrink-0 text-muted-foreground sm:block"
            aria-hidden
          />
          <HierarchyStep label="العائلة" value={family?.name ?? '—'} />
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
          <DetailField label="اسم المادة بالإنجليزية">{material.nameEn ?? '—'}</DetailField>
          <DetailField label="رمز المادة" ltr>
            {material.code}
          </DetailField>
          <DetailField label="وحدة القياس الأساسية" ltr>
            {material.baseUnitSymbol}
          </DetailField>
          <DetailField label="الحالة">
            <MaterialStatusBadge status={material.status} />
          </DetailField>
          <DetailField label="إصدار الكتالوج" ltr>
            {material.catalogVersion}
          </DetailField>
          <div className="sm:col-span-2">
            <dt className="text-sm font-medium text-muted-foreground">خصائص إضافية</dt>
            <dd className="mt-1.5 text-base font-medium text-foreground" dir="ltr">
              {material.attributes ?? '—'}
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
          <DetailField label="طريقة التتبع">
            {TRACKING_TYPE_LABELS[material.trackingType]}
          </DetailField>
          <DetailField label="رقم الأصل">{assetNumberPolicy(material.materialKind)}</DetailField>
          <DetailField label="تاريخ الصلاحية">
            {material.hasExpiry ? 'لها صلاحية' : 'بدون صلاحية'}
          </DetailField>
          <DetailField label="المسؤولية بعد الصرف">
            {policyDescription(material.materialKind)}
          </DetailField>
        </dl>
      </ContentCard>

      <MaterialUnitConversions material={material} />

      <ConfirmDialog
        open={isStatusDialogOpen}
        onOpenChange={setIsStatusDialogOpen}
        title={isActive ? 'تعطيل مادة' : 'تنشيط مادة'}
        message={
          isActive
            ? 'سيبقى اسم المادة ظاهراً في السندات والسجلات السابقة، لكنه لن يكون متاحاً للاختيار في العمليات الجديدة.'
            : 'ستصبح المادة متاحة مرة أخرى للاختيار في العمليات الجديدة.'
        }
        confirmLabel={isActive ? 'تعطيل المادة' : 'تنشيط المادة'}
        variant={isActive ? 'destructive' : 'confirm'}
        busy={statusMutation.isPending}
        onConfirm={() => void confirmStatusChange()}
      />
      <ConfirmDialog
        open={isArchiveDialogOpen}
        onOpenChange={setIsArchiveDialogOpen}
        title="أرشفة مادة"
        message="الأرشفة نهائية ولا يمكن التراجع عنها. لن تعود المادة نشطةً أو قابلة للاختيار في أي سند جديد بعد الأرشفة، وتبقى ظاهرة في السجلات السابقة فقط؛ ولا يعرض النظام أي طريقة للخروج من حالة الأرشيف."
        confirmLabel="أرشفة نهائية"
        variant="destructive"
        busy={statusMutation.isPending}
        onConfirm={() => void confirmArchive()}
      />
    </div>
  )
}

export default MaterialDetailPage
