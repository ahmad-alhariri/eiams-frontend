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

const EMPTY_VALUES: MaterialFamilyFormValues = { categoryId: '', code: '', name: '' }

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
  const isEditing = family !== null
  /**
   * Only ACTIVE categories are assignable, but the family's OWN category stays
   * in the list even once deactivated: `categoryId` is flat on the record (there
   * is no nested category reference any more), so hiding it would leave the
   * trigger blank on a record that legitimately still points at it. It is
   * rendered disabled — re-categorising a family is not exposed by the API.
   */
  const categoryOptions = useMemo(() => {
    const active = categories.filter((category) => category.status === 'Active')
    if (family === null) return active
    if (active.some((category) => category.id === family.categoryId)) return active
    const current = categories.find((category) => category.id === family.categoryId)
    return current === undefined ? active : [...active, current]
  }, [categories, family])
  const form = useForm<MaterialFamilyFormValues>({
    resolver: zodResolver(materialFamilySchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      categoryId: family?.categoryId ?? '',
      code: family?.code ?? '',
      name: family?.name ?? '',
    })
  }, [family, form, open])

  const submit = async (values: MaterialFamilyFormValues) => {
    if (!categoryOptions.some((category) => category.id === values.categoryId)) {
      form.setError('categoryId', { message: 'اختر تصنيفاً نشطاً للعائلة.' })
      return
    }

    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['categoryId', 'code', 'name'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>{family ? 'تعديل عائلة مادة' : 'إضافة عائلة مادة'}</DialogTitle>
          <DialogDescription>
            ترتبط العائلة بتصنيف نشط، ويُستمد مجالها تلقائياً من التصنيف المختار. التصنيف ثابت بعد
            الإنشاء.
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
              name="name"
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
            </div>
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>التصنيف</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending || isCategoriesLoading || isEditing}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue>
                          {categoryOptions.find((category) => category.id === field.value)?.name ??
                            'اختر التصنيف'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isCategoriesError ? (
                    <p className="text-sm text-destructive" role="alert">
                      تعذّر تحميل التصنيفات النشطة. أغلق النافذة وحاول مرة أخرى.
                    </p>
                  ) : null}
                  {!isCategoriesLoading && !isCategoriesError && categoryOptions.length === 0 ? (
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
