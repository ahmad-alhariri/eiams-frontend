import { IconEdit, IconPlus } from '@tabler/icons-react'
import { createColumnHelper } from '@tanstack/react-table'
import { useCallback, useMemo, useState } from 'react'

import { usePermission } from '@/modules/auth/hooks/use-permission'
import { MaterialDomainFormDialog } from '@/modules/catalog/components/material-domain-form-dialog'
import {
  useCreateMaterialDomainMutation,
  useUpdateMaterialDomainMutation,
} from '@/modules/catalog/hooks/use-catalog-mutations'
import { useMaterialDomainsQuery } from '@/modules/catalog/hooks/use-catalog-queries'
import {
  toMaterialDomainRequest,
  type MaterialDomainFormValues,
} from '@/modules/catalog/schemas/material-domain.schemas'
import { StatusBadge } from '@/shared/feedback/status-badge'
import { ContentCard } from '@/shared/layout/content-card'
import { PageHeader } from '@/shared/layout/page-header'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { dataTableFeatures, DataTable } from '@/shared/ui/data-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { toast } from '@/shared/ui/toast-manager'
import { listRows } from '@/shared/utils/table-data'
import type { MaterialDomain, RecordStatus } from '@/shared/types/generated/eiams-v1'

const materialDomainColumnHelper = createColumnHelper<typeof dataTableFeatures, MaterialDomain>()

function isRecordStatus(value: string | null): value is RecordStatus {
  return value === 'Active' || value === 'Inactive'
}

/** Scoped, contract-backed material domain directory. The endpoint is intentionally unpaginated in v1. */
function MaterialDomainsPage() {
  const { has } = usePermission()
  const canManage = has('catalog.manage')
  const [status, setStatus] = useState<RecordStatus | undefined>()
  const [dialogDomain, setDialogDomain] = useState<MaterialDomain | null | undefined>(undefined)
  const domainsQuery = useMaterialDomainsQuery(status === undefined ? {} : { status })
  const createMutation = useCreateMaterialDomainMutation()
  const updateMutation = useUpdateMaterialDomainMutation()

  const openCreate = useCallback(() => setDialogDomain(null), [])
  const openEdit = useCallback((domain: MaterialDomain) => setDialogDomain(domain), [])
  const closeDialog = useCallback((open: boolean) => {
    if (!open) setDialogDomain(undefined)
  }, [])

  const submitForm = useCallback(
    async (values: MaterialDomainFormValues) => {
      const domain = dialogDomain ?? null
      try {
        const request = toMaterialDomainRequest(values, domain)
        if (domain === null) {
          await createMutation.mutateAsync(request)
          toast.success({ title: 'تمت إضافة مجال التصنيف.' })
        } else {
          await updateMutation.mutateAsync({ domainId: domain.domainId, request })
          toast.success({ title: 'تم حفظ تعديلات مجال التصنيف.' })
        }
        setDialogDomain(undefined)
      } catch (error: unknown) {
        const apiError = normalizeApiError(error)
        toast.error({
          title: apiError.titleAr,
          ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
        })
        throw error
      }
    },
    [createMutation, dialogDomain, updateMutation],
  )

  const columns = useMemo(
    () =>
      materialDomainColumnHelper.columns([
        materialDomainColumnHelper.accessor('nameAr', {
          id: 'nameAr',
          header: 'اسم المجال',
          cell: (info) => <span className="font-semibold text-foreground">{info.getValue()}</span>,
        }),
        materialDomainColumnHelper.accessor('code', { id: 'code', header: 'الرمز' }),
        materialDomainColumnHelper.accessor('status', {
          id: 'status',
          header: 'الحالة',
          cell: (info) => <StatusBadge entity="record" status={info.getValue()} />,
        }),
        ...(canManage
          ? [
              materialDomainColumnHelper.display({
                id: 'actions',
                header: 'إجراءات',
                cell: ({ row }) => (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`تعديل ${row.original.nameAr}`}
                    onClick={() => openEdit(row.original)}
                  >
                    <IconEdit aria-hidden />
                  </Button>
                ),
              }),
            ]
          : []),
      ]),
    [canManage, openEdit],
  )

  return (
    <div dir="rtl" className="min-w-0">
      <PageHeader
        title="مجالات التصنيف"
        subtitle="المستوى الأعلى في هيكل تصنيف المواد ضمن نطاق العمل الحالي."
        toolbar={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <div className="flex w-full flex-col gap-2 sm:w-52">
              <span className="text-sm font-medium text-foreground">حالة المجال</span>
              <Select
                value={status ?? 'all'}
                onValueChange={(value) => setStatus(isRecordStatus(value) ? value : undefined)}
              >
                <SelectTrigger aria-label="تصفية حسب حالة المجال">
                  <SelectValue>
                    {status === undefined ? 'كل الحالات' : status === 'Active' ? 'نشط' : 'غير نشط'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="Active">نشط</SelectItem>
                  <SelectItem value="Inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {canManage ? (
              <Button type="button" onClick={openCreate}>
                <IconPlus aria-hidden data-icon="inline-start" />
                إضافة مجال
              </Button>
            ) : null}
          </div>
        }
      />
      <ContentCard
        title="قائمة مجالات التصنيف"
        description="تُدار المجالات عبر خادم النظام، بما في ذلك نطاق الصلاحيات وحالة السجل."
      >
        <DataTable
          columns={columns}
          data={listRows(domainsQuery.data, domainsQuery.isError)}
          isLoading={domainsQuery.isLoading}
          isError={domainsQuery.isError}
          onRetry={() => void domainsQuery.refetch()}
          errorTitle="تعذّر تحميل مجالات التصنيف"
          errorMessage="تعذّر جلب قائمة المجالات. حاول مرة أخرى."
          emptyTitle="لا توجد مجالات تصنيف"
          emptyDescription="لم يتم العثور على مجالات تطابق حالة السجل المحددة."
          emptyAction={canManage ? <Button onClick={openCreate}>إضافة مجال</Button> : undefined}
        />
      </ContentCard>
      <MaterialDomainFormDialog
        open={dialogDomain !== undefined}
        domain={dialogDomain ?? null}
        isPending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={closeDialog}
        onSubmit={submitForm}
      />
    </div>
  )
}

export default MaterialDomainsPage
