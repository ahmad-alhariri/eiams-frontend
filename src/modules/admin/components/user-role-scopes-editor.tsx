import { IconCirclePlus, IconDeviceFloppy, IconTrash } from '@tabler/icons-react'
import { useMemo } from 'react'
import { useFieldArray, useWatch, type UseFormReturn } from 'react-hook-form'

import {
  ROLE_SCOPE_TYPES,
  type UserRoleScopesFormValues,
} from '@/modules/admin/schemas/user-role-scopes.schemas'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { ContentCard } from '@/shared/layout/content-card'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { Role, ScopeType } from '@/shared/types/generated/eiams-v1'

const SCOPE_TYPE_LABELS: Readonly<Record<ScopeType, string>> = {
  Enterprise: 'المؤسسة',
  Site: 'موقع',
  Warehouse: 'مستودع',
}

const EMPTY_ASSIGNMENT: UserRoleScopesFormValues['assignments'][number] = {
  roleId: '',
  scopeType: 'Enterprise',
  scopeId: '',
}

interface UserRoleScopesEditorProps {
  canManage: boolean
  canSelectRoles: boolean
  form: UseFormReturn<UserRoleScopesFormValues>
  isPending: boolean
  isRoleCatalogLoading: boolean
  onSubmit: (values: UserRoleScopesFormValues) => Promise<void>
  roles: readonly Role[]
}

/** Contract-shaped field-array editor for a user's complete role-scope assignment set. */
export function UserRoleScopesEditor({
  canManage,
  canSelectRoles,
  form,
  isPending,
  isRoleCatalogLoading,
  onSubmit,
  roles,
}: UserRoleScopesEditorProps) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'assignments' })
  const watchedAssignments = useWatch({ control: form.control, name: 'assignments' }) ?? []
  const roleNameById = useMemo(
    () => new Map(roles.map((role) => [role.roleId, role.nameAr])),
    [roles],
  )

  return (
    <ContentCard
      title="أدوار المستخدم ونطاقاتها"
      description="كل تعيين يربط دوراً بنطاق. الحفظ يستبدل مجموعة التعيينات بالكامل باستخدام إصدار المستخدم الحالي."
      action={
        canManage && canSelectRoles ? (
          <Button type="button" onClick={() => append({ ...EMPTY_ASSIGNMENT })}>
            <IconCirclePlus aria-hidden data-icon="inline-start" />
            إضافة تعيين
          </Button>
        ) : null
      }
    >
      <Form {...form}>
        <form
          noValidate
          aria-busy={isPending}
          className="grid gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا توجد أدوار معيّنة لهذا المستخدم ضمن نطاق العمل الحالي.
            </p>
          ) : (
            <div className="grid gap-3">
              {fields.map((field, index) => {
                const assignment = watchedAssignments[index]
                const scopeType = assignment?.scopeType ?? 'Enterprise'
                const roleName = roleNameById.get(assignment?.roleId ?? '') ?? 'غير محدد'
                return (
                  <fieldset
                    key={field.id}
                    className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-start"
                  >
                    <legend className="sr-only">تعيين الدور {index + 1}</legend>
                    {canManage && canSelectRoles ? (
                      <FormField
                        control={form.control}
                        name={`assignments.${index}.roleId`}
                        render={({ field: roleField, fieldState }) => (
                          <FormItem>
                            <FormLabel>الدور</FormLabel>
                            <Select
                              value={roleField.value}
                              disabled={isRoleCatalogLoading}
                              onValueChange={roleField.onChange}
                            >
                              <FormControl>
                                <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                                  <SelectValue placeholder="اختر الدور" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {roles.map((role) => (
                                  <SelectItem key={role.roleId} value={role.roleId}>
                                    {role.nameAr}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ) : (
                      <div className="grid content-start gap-2">
                        <span className="text-sm font-medium text-foreground">الدور</span>
                        <p className="min-h-9 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                          {roleName}
                        </p>
                      </div>
                    )}
                    <FormField
                      control={form.control}
                      name={`assignments.${index}.scopeType`}
                      render={({ field: scopeTypeField, fieldState }) => (
                        <FormItem>
                          <FormLabel>النطاق</FormLabel>
                          <Select
                            value={scopeTypeField.value}
                            disabled={!canManage}
                            onValueChange={(value) => {
                              const nextScopeType = ROLE_SCOPE_TYPES.find(
                                (candidate) => candidate === value,
                              )
                              if (nextScopeType === undefined) return
                              scopeTypeField.onChange(nextScopeType)
                              if (nextScopeType === 'Enterprise') {
                                form.setValue(`assignments.${index}.scopeId`, '', {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                })
                              }
                            }}
                          >
                            <FormControl>
                              <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {ROLE_SCOPE_TYPES.map((candidate) => (
                                <SelectItem key={candidate} value={candidate}>
                                  {SCOPE_TYPE_LABELS[candidate]}
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
                      name={`assignments.${index}.scopeId`}
                      render={({ field: scopeIdField }) => (
                        <FormItem>
                          <FormLabel>معرّف النطاق</FormLabel>
                          <FormControl>
                            <Input
                              {...scopeIdField}
                              disabled={!canManage || scopeType === 'Enterprise'}
                              placeholder={scopeType === 'Enterprise' ? 'غير مطلوب' : 'UUID'}
                              dir="ltr"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="pt-7">
                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`إزالة تعيين ${roleName}`}
                          onClick={() => remove(index)}
                        >
                          <IconTrash aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </fieldset>
                )
              })}
            </div>
          )}

          {form.formState.errors.assignments?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.assignments.message}
            </p>
          ) : null}
          {form.formState.errors.root?.['serverError']?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root['serverError'].message}
            </p>
          ) : null}

          {canManage && !canSelectRoles ? (
            <p className="text-sm text-muted-foreground">
              يمكنك تعديل نطاقات الأدوار المعيّنة أو إزالتها. تتطلب إضافة دور أو تغييره صلاحية عرض
              الأدوار.
            </p>
          ) : null}

          {canManage ? (
            <div className="flex justify-end">
              <Button type="submit" loading={isPending}>
                <IconDeviceFloppy aria-hidden data-icon="inline-start" />
                حفظ التعيينات
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              عرض للقراءة فقط؛ لا تملك صلاحية تعديل أدوار المستخدم.
            </p>
          )}
        </form>
      </Form>
    </ContentCard>
  )
}
