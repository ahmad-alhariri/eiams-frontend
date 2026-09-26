import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import {
  materialFamilySchema,
  type MaterialFamilyFormValues,
} from '@/modules/catalog/schemas/material-family.schemas'
import type { MaterialCategory, MaterialFamily } from '@/modules/catalog/types/catalog.types'
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

const EMPTY_VALUES: MaterialFamilyFormValues = {
  materialCategoryId: '',
  code: '',
  nameAr: '',
  status: 'Active',
}

export interface MaterialFamilyFormDialogProps {
  categories: readonly MaterialCategory[]
  isCategoriesLoading: boolean
  isCategoriesError: boolean
  family: MaterialFamily | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: MaterialFamilyFormValues) => Promise<void>
}

/** Create/edit form. The family inherits its domain from the selected active category. */
export function MaterialFamilyFormDialog({
  categories,
  isCategoriesLoading,
  isCategoriesError,
  family,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: MaterialFamilyFormDialogProps) {
  const activeCategories = useMemo(
    () => categories.filter((category) => category.status === 'Active'),
    [categories],
  )
  const form = useForm<MaterialFamilyFormValues>({
    resolver: zodResolver(materialFamilySchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      materialCategoryId: family?.materialCategory.id ?? '',
      code: family?.code ?? '',
      nameAr: family?.nameAr ?? '',
      status: family?.status ?? 'Active',
    })
  }, [family, form, open])

  const submit = async (values: MaterialFamilyFormValues) => {
    if (
      !activeCategories.some(
        (category) => category.materialCategoryId === values.materialCategoryId,
      )
    ) {
      form.setError('materialCategoryId', { message: 'اختر تصنيفاً نشطاً للعائلة.' })
      return
    }

    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['materialCategoryId', 'code', 'nameAr', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{family ? 'تعديل عائلة مادة' : 'إضافة عائلة مادة'}</DialogTitle>
          <DialogDescription>
            ترتبط العائلة بتصنيف نشط، ويُستمد مجالها تلقائياً من التصنيف المختار.
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
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم العائلة</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isPending}
                      maxLength={200}
                      placeholder="مثال: الحواسيب المكتبية"
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
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>رمز العائلة</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        dir="ltr"
                        disabled={isPending}
                        maxLength={50}
                        placeholder="IT-HW-PC"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
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
              name="materialCategoryId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>التصنيف</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending || isCategoriesLoading}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue>
                          {activeCategories.find(
                            (category) => category.materialCategoryId === field.value,
                          )?.nameAr ?? 'اختر التصنيف'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeCategories.map((category) => (
                        <SelectItem
                          key={category.materialCategoryId}
                          value={category.materialCategoryId}
                        >
                          {category.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isCategoriesError ? (
                    <p className="text-sm text-destructive" role="alert">
                      تعذّر تحميل التصنيفات النشطة. أغلق النافذة وحاول مرة أخرى.
                    </p>
                  ) : null}
                  {!isCategoriesLoading && !isCategoriesError && activeCategories.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      لا توجد تصنيفات نشطة متاحة لإسناد العائلة.
                    </p>
                  ) : null}
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {family ? 'حفظ التعديلات' : 'إضافة العائلة'}
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
