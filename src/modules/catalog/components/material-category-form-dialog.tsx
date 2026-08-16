import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  createMaterialCategorySchema,
  type MaterialCategoryFormValues,
} from '@/modules/catalog/schemas/material-category.schemas'
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
import type { MaterialCategory, MaterialDomain } from '@/shared/types/generated/eiams-v1'

const NO_PARENT = '__none__'
const EMPTY_VALUES: MaterialCategoryFormValues = {
  code: '',
  domainId: '',
  nameAr: '',
  status: 'Active',
}

export interface MaterialCategoryFormDialogProps {
  categories: readonly MaterialCategory[]
  category: MaterialCategory | null
  domains: readonly MaterialDomain[]
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MaterialCategoryFormValues) => Promise<void>
}

/** Create/edit category dialog restricted to the contract's domain-aware hierarchy. */
export function MaterialCategoryFormDialog({
  categories,
  category,
  domains,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: MaterialCategoryFormDialogProps) {
  const schema = useMemo(
    () => createMaterialCategorySchema(categories, category),
    [categories, category],
  )
  const form = useForm<MaterialCategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  })
  const selectedDomainId = useWatch({ control: form.control, name: 'domainId' })
  const parentOptions = useMemo(
    () => categories.filter((candidate) => candidate.domain.id === selectedDomainId),
    [categories, selectedDomainId],
  )

  useEffect(() => {
    if (!open) return
    form.reset({
      code: category?.code ?? '',
      domainId: category?.domain.id ?? '',
      nameAr: category?.nameAr ?? '',
      parentCategoryId: category?.parentCategoryId,
      status: category?.status ?? 'Active',
    })
  }, [category, form, open])

  const submit = async (values: MaterialCategoryFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['code', 'domainId', 'nameAr', 'parentCategoryId', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{category ? 'تعديل تصنيف مادة' : 'إضافة تصنيف مادة'}</DialogTitle>
          <DialogDescription>
            اختر المجال أولاً، ثم يمكن ربط التصنيف بتصنيف أب من المجال نفسه.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            aria-busy={isPending}
            className="grid gap-5"
            onSubmit={form.handleSubmit(submit)}
          >
            <FormField
              control={form.control}
              name="nameAr"
              rules={{ required: true }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم التصنيف</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isPending}
                      maxLength={200}
                      placeholder="مثال: الأجهزة"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="code"
                rules={{ required: true }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رمز التصنيف</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="ltr"
                        disabled={isPending}
                        maxLength={50}
                        placeholder="IT-HW"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                rules={{ required: true }}
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الحالة</FormLabel>
                    <Select value={field.value} disabled={isPending} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                          <SelectValue>{field.value === 'Active' ? 'نشط' : 'غير نشط'}</SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Active">نشط</SelectItem>
                        <SelectItem value="Inactive">غير نشط</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="domainId"
              rules={{ required: true }}
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>مجال التصنيف</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending}
                    onValueChange={(value) => {
                      field.onChange(value)
                      const parent = form.getValues('parentCategoryId')
                      if (
                        parent !== undefined &&
                        !categories.some(
                          (candidate) =>
                            candidate.categoryId === parent && candidate.domain.id === value,
                        )
                      ) {
                        form.setValue('parentCategoryId', undefined, { shouldValidate: true })
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue>
                          {domains.find((domain) => domain.domainId === field.value)?.nameAr ??
                            'اختر المجال'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {domains.map((domain) => (
                        <SelectItem key={domain.domainId} value={domain.domainId}>
                          {domain.nameAr}
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
              name="parentCategoryId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>التصنيف الأب</FormLabel>
                  <Select
                    value={field.value ?? NO_PARENT}
                    disabled={isPending || selectedDomainId === ''}
                    onValueChange={(value) =>
                      field.onChange(value === NO_PARENT ? undefined : value)
                    }
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue>بدون تصنيف أب</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>بدون تصنيف أب</SelectItem>
                      {parentOptions.map((candidate) => (
                        <SelectItem key={candidate.categoryId} value={candidate.categoryId}>
                          {candidate.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {category ? 'حفظ التعديلات' : 'إضافة التصنيف'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
