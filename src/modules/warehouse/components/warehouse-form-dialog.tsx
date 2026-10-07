import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  useOrganizationalUnitsQuery,
  useSitesQuery,
} from '@/modules/organization/hooks/use-organization-queries'
import {
  emptyWarehouseFormValues,
  toWarehouseFormValues,
  warehouseFormSchema,
  type WarehouseFormValues,
} from '@/modules/warehouse/schemas/warehouse.schemas'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.api-types'

const SERVER_ERROR_KEYS = [
  'siteId',
  'code',
  'name',
  'organizationalUnitId',
  'warehouseType',
  'canHoldStock',
] as const

/** Arabic note shown in place of an editable control on the create-only fields. */
const CREATE_ONLY_NOTE = 'يُحدَّد الموقع والرمز عند إنشاء المستودع ولا يمكن تعديلهما بعد ذلك.'

export interface WarehouseFormDialogProps {
  warehouse: Warehouse | null | undefined
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: WarehouseFormValues) => Promise<void>
}

export function WarehouseFormDialog({
  warehouse,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: WarehouseFormDialogProps) {
  const isCreate = warehouse === null || warehouse === undefined
  const form = useForm<WarehouseFormValues>({
    resolver: zodResolver(warehouseFormSchema(isCreate)),
    defaultValues: emptyWarehouseFormValues(),
  })
  const sitesQuery = useSitesQuery({ page: 0, pageSize: 200 }, { enabled: open })
  const organizationalUnitsQuery = useOrganizationalUnitsQuery(
    { page: 0, pageSize: 200 },
    { enabled: open },
  )

  useEffect(() => {
    if (!open) return

    form.reset(toWarehouseFormValues(warehouse ?? null))
  }, [form, open, warehouse])

  // `siteId` binds only to the create body, so on edit it is the warehouse's own
  // site — which is also what scopes the organizational-unit options. `useWatch`
  // rather than `form.watch` keeps one subscription for all five fields and
  // stays out of the React Compiler's incompatible-library path.
  const [siteId, code, name, organizationalUnitId, warehouseType] = useWatch({
    control: form.control,
    name: ['siteId', 'code', 'name', 'organizationalUnitId', 'warehouseType'],
  })

  const organizationalUnits = useMemo(() => {
    const items = organizationalUnitsQuery.data?.items ?? []
    return siteId === '' ? items : items.filter((unit) => unit.siteId === siteId)
  }, [organizationalUnitsQuery.data, siteId])

  const isSubmittable =
    name.trim() !== '' &&
    warehouseType.trim() !== '' &&
    organizationalUnitId !== '' &&
    (!isCreate || (siteId !== '' && code.trim() !== ''))

  const submit = async (values: WarehouseFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: [...SERVER_ERROR_KEYS] })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'إضافة مستودع' : 'تعديل المستودع'}</DialogTitle>
          <DialogDescription>
            أدخل بيانات المستودع المرجعية. إعدادات الصلاحيات والمواد تُدار في صفحات مستقلة.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            {isCreate ? null : (
              <p
                role="note"
                className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground"
              >
                {CREATE_ONLY_NOTE}
              </p>
            )}
            <FormField
              control={form.control}
              name="siteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الموقع</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending || !isCreate}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="الموقع">
                        <SelectValue>
                          {sitesQuery.data?.items.find((site) => site.id === field.value)?.name ??
                            field.value ??
                            'اختر الموقع'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">اختر الموقع</SelectItem>
                      {sitesQuery.data?.items.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{site.name}</span>
                            <span className="text-muted text-sm" dir="ltr">
                              ({site.code})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الرمز</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value}
                      disabled={isPending || !isCreate}
                      onValueChange={field.onChange}
                      placeholder="مثال: WH-001"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم المستودع</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value}
                      disabled={isPending}
                      onValueChange={field.onChange}
                      placeholder="اسم المستودع"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="organizationalUnitId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>الوحدة التنظيمية</FormLabel>
                  <Select value={field.value} disabled={isPending} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger aria-label="الوحدة التنظيمية">
                        <SelectValue>
                          {organizationalUnits.find((unit) => unit.id === field.value)?.name ??
                            field.value ??
                            'اختر الوحدة التنظيمية'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="">اختر الوحدة التنظيمية</SelectItem>
                      {organizationalUnits.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{unit.name}</span>
                            {unit.unitType === '' ? null : (
                              <span className="text-muted text-sm">{unit.unitType}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="warehouseType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نوع المستودع</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value}
                      disabled={isPending}
                      onValueChange={field.onChange}
                      placeholder="مثال: Storage"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="canHoldStock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>السماح بالتخزين</FormLabel>
                  <Select
                    value={field.value ? 'true' : 'false'}
                    disabled={isPending}
                    onValueChange={(next) => field.onChange(next === 'true')}
                  >
                    <FormControl>
                      <SelectTrigger aria-label="السماح بالتخزين">
                        <SelectValue>{field.value ? 'نعم' : 'لا'}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">نعم</SelectItem>
                      <SelectItem value="false">لا</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending} disabled={!isSubmittable}>
                {isCreate ? 'إضافة المستودع' : 'حفظ التعديلات'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
