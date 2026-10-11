import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import {
  createMaterialCategorySchema,
  findDescendantIds,
  type MaterialCategoryFormValues,
} from '@/modules/catalog/schemas/material-category.schemas'
import type { MaterialCategory, MaterialDomain } from '@/modules/catalog/types/catalog.types'
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

const NO_PARENT = '__none__'
const NO_PARENT_LABEL = 'بدون تصنيف أب'
/**
 * Shown when a parent IS selected but its record is not among the loaded
 * options — the reference slice did not contain it. Saying "بدون تصنيف أب" here
 * would be a false statement about the stored value, so the trigger says the
 * opposite instead: a parent exists, its name is not on screen.
 */
const PARENT_NOT_IN_OPTIONS_LABEL = 'تصنيف أب غير معروض ضمن البيانات الحالية'
const EMPTY_VALUES: MaterialCategoryFormValues = {
  code: '',
  materialDomainId: '',
  name: '',
  parentCategoryId: null,
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

/**
 * Create/edit category dialog.
 *
 * `materialDomainId` and `status` are create-only here: the update route binds
 * `Name` and `Code` alone, re-domaining is not exposed at all, and status is a
 * guarded command taking an INTEGER ordinal. `parentCategoryId` IS editable on
 * an existing category — re-parenting has its own dedicated route
 * (`PUT /catalog/categories/{id}/parent`), which the page fires through
 * `toMoveMaterialCategoryRequest` after this form's update succeeds. The parent
 * list offers neither the edited category nor its descendants, and the client
 * guards in the schema that refuse them still run unchanged.
 */
export function MaterialCategoryFormDialog({
  categories,
  category,
  domains,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: MaterialCategoryFormDialogProps) {
  const isEditing = category !== null
  const schema = useMemo(
    () => createMaterialCategorySchema(categories, category),
    [categories, category],
  )
  const form = useForm<MaterialCategoryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  })
  const selectedDomainId = useWatch({ control: form.control, name: 'materialDomainId' })
  /**
   * Parent candidates are the categories of the SAME domain, minus the category
   * being edited and everything under it. A category used to be offered as its
   * own parent, and a descendant was offered too — the two shapes the server
   * refuses with 409 `MATERIAL_CATEGORIES_CIRCULAR_PARENT`. Both are removed
   * here using the SAME walk the schema guard uses, so the list cannot offer
   * what the guard would reject; the guard itself stays as the authority for
   * scope and for state that changed after this dialog opened.
   */
  const parentOptions = useMemo(() => {
    const descendantIds =
      category === null ? new Set<string>() : findDescendantIds(category.id, categories)

    return categories.filter(
      (candidate) =>
        candidate.materialDomainId === selectedDomainId &&
        candidate.id !== category?.id &&
        !descendantIds.has(candidate.id),
    )
  }, [categories, category, selectedDomainId])

  useEffect(() => {
    if (!open) return
    form.reset({
      code: category?.code ?? '',
      materialDomainId: category?.materialDomainId ?? '',
      name: category?.name ?? '',
      parentCategoryId: category?.parentCategoryId ?? null,
    })
  }, [category, form, open])

  const submit = async (values: MaterialCategoryFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['code', 'materialDomainId', 'name', 'parentCategoryId'],
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
              name="name"
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
            </div>
            <FormField
              control={form.control}
              name="materialDomainId"
              rules={{ required: true }}
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>مجال التصنيف</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending || isEditing}
                    onValueChange={(value) => {
                      field.onChange(value)
                      const parent = form.getValues('parentCategoryId')
                      if (
                        parent !== null &&
                        !categories.some(
                          (candidate) =>
                            candidate.id === parent && candidate.materialDomainId === value,
                        )
                      ) {
                        form.setValue('parentCategoryId', null, { shouldValidate: true })
                      }
                    }}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue>
                          {domains.find((domain) => domain.id === field.value)?.name ??
                            'اختر المجال'}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {domains.map((domain) => (
                        <SelectItem key={domain.id} value={domain.id}>
                          {domain.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isEditing ? (
                    <p className="text-sm text-muted-foreground">
                      مجال التصنيف ثابت ولا يمكن نقله إلى مجال آخر.
                    </p>
                  ) : null}
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
                    onValueChange={(value) => field.onChange(value === NO_PARENT ? null : value)}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        {/*
                          The label is resolved from the CURRENT value on purpose.
                          Hardcoding one label as `SelectValue` children overrides
                          both the shared Select's derived `items` map and any item
                          label, which is why reopening a NESTED category's dialog
                          showed "بدون تصنيف أب" while its listbox correctly marked
                          the real parent as selected. The domain select directly
                          above does the same thing.
                        */}
                        <SelectValue>
                          {field.value === null
                            ? NO_PARENT_LABEL
                            : (parentOptions.find((option) => option.id === field.value)?.name ??
                              PARENT_NOT_IN_OPTIONS_LABEL)}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>{NO_PARENT_LABEL}</SelectItem>
                      {parentOptions.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    تغيير التصنيف الأب ينقل التصنيف داخل شجرة المجال نفسه.
                  </p>
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
