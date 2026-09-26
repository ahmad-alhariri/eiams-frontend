import { IconDeviceFloppy } from '@tabler/icons-react'
import { useMemo } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'

import type { Site } from '@/modules/organization/types/organization.api-types'
import type { Warehouse } from '@/modules/warehouse/types/warehouse.api-types'
import type { OptionLoader } from '@/shared/selectors/selector-adapter'

import {
  ROLE_SCOPE_TYPES,
  type UserRoleScopeFormValues,
} from '@/modules/admin/schemas/user-role-scopes.schemas'
import type { RoleRef, ScopeType } from '@/modules/admin/types/admin.api-types'
import { useScopedSiteSelector } from '@/modules/organization/hooks/use-scoped-site-selector'
import { useScopedWarehouseSelector } from '@/modules/warehouse/hooks/use-scoped-warehouse-selector'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '@/shared/forms/form'
import { ContentCard } from '@/shared/layout/content-card'
import { AsyncSelect } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'

const SCOPE_TYPE_LABELS: Readonly<Record<ScopeType, string>> = {
  Enterprise: 'المؤسسة',
  Site: 'موقع',
  Warehouse: 'مستودع',
}

interface UserRoleScopesEditorProps {
  canManage: boolean
  canSelectRoles: boolean
  form: UseFormReturn<UserRoleScopeFormValues>
  isPending: boolean
  isRoleCatalogLoading: boolean
  onSubmit: (values: UserRoleScopeFormValues) => Promise<void>
  roles: readonly RoleRef[]
}

/**
 * Scope picker for the singular assignment (D-SRS-01). Enterprise carries no
 * picker; Site and Warehouse resolve through the scoped Arabic async
 * selectors so only scopes visible to the current administrator are offered.
 */
function ScopePicker({
  scopeType,
  disabled,
  onChange,
  value,
}: {
  scopeType: ScopeType
  disabled: boolean
  onChange: (scopeId: string | null) => void
  value: string | null
}) {
  const { formItemId } = useFormField()
  const siteSelector = useScopedSiteSelector()
  const warehouseSelector = useScopedWarehouseSelector()

  if (scopeType === 'Enterprise') {
    return (
      <p className="min-h-9 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        يشمل هذا التعيين المؤسسة بالكامل ولا يتطلب اختيار موقع أو مستودع.
      </p>
    )
  }

  const isSite = scopeType === 'Site'
  const selector = isSite ? siteSelector : warehouseSelector
  const loadOptions = selector.loadOptions as OptionLoader<Site | Warehouse>
  return (
    <AsyncSelect<Site | Warehouse>
      value={value}
      loadOptions={loadOptions}
      onValueChange={(next) => onChange(next)}
      disabled={disabled || !selector.scopeReady}
      inputProps={{ id: formItemId }}
      placeholder={
        selector.scopeReady
          ? isSite
            ? 'ابحث عن الموقع...'
            : 'ابحث عن المستودع...'
          : 'بانتظار اختيار النطاق...'
      }
      emptyMessage={
        isSite ? 'لا توجد مواقع مطابقة ضمن نطاقك.' : 'لا توجد مستودعات مطابقة ضمن نطاقك.'
      }
      errorMessage={
        isSite ? 'تعذر البحث عن المواقع ضمن نطاقك.' : 'تعذر البحث عن المستودعات ضمن نطاقك.'
      }
    />
  )
}

/** Singular role/scope editor for a user's one persistent assignment (D-SRS-01). */
export function UserRoleScopesEditor({
  canManage,
  canSelectRoles,
  form,
  isPending,
  isRoleCatalogLoading,
  onSubmit,
  roles,
}: UserRoleScopesEditorProps) {
  const scopeType = useWatch({ control: form.control, name: 'scopeType' })
  const canEditRole = canManage && canSelectRoles
  const roleNameById = useMemo(
    () => new Map(roles.map((role) => [role.roleId, role.nameAr])),
    [roles],
  )
  const selectedRoleName = roleNameById.get(form.getValues('roleId')) ?? 'غير محدد'

  return (
    <ContentCard
      title="دور المستخدم ونطاقه"
      description="تعيين واحد يربط الدور بالنطاق. الحفظ يستبدل التعيين الحالي بالكامل."
    >
      <Form {...form}>
        <form
          noValidate
          aria-busy={isPending}
          className="grid gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-start">
            {canEditRole ? (
              <FormField
                control={form.control}
                name="roleId"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>الدور</FormLabel>
                    <Select
                      value={field.value}
                      disabled={isRoleCatalogLoading}
                      onValueChange={field.onChange}
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
                  {selectedRoleName}
                </p>
              </div>
            )}
            <FormField
              control={form.control}
              name="scopeType"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>النطاق</FormLabel>
                  <Select
                    value={field.value}
                    disabled={!canManage}
                    onValueChange={(value) => {
                      const nextScopeType = ROLE_SCOPE_TYPES.find(
                        (candidate) => candidate === value,
                      )
                      if (nextScopeType === undefined) return
                      field.onChange(nextScopeType)
                      form.setValue('scopeId', null, { shouldDirty: true, shouldValidate: true })
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
              name="scopeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {scopeType === 'Site'
                      ? 'الموقع'
                      : scopeType === 'Warehouse'
                        ? 'المستودع'
                        : 'النطاق'}
                  </FormLabel>
                  <ScopePicker
                    scopeType={scopeType}
                    disabled={!canManage}
                    value={field.value}
                    onChange={(next) => field.onChange(next)}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {form.formState.errors.root?.['serverError']?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root['serverError'].message}
            </p>
          ) : null}

          {canManage && !canSelectRoles ? (
            <p className="text-sm text-muted-foreground">
              يمكنك تعديل النطاق. يتطلب تغيير الدور صلاحية عرض الأدوار.
            </p>
          ) : null}

          {canManage ? (
            <div className="flex justify-end">
              <Button type="submit" loading={isPending}>
                <IconDeviceFloppy aria-hidden data-icon="inline-start" />
                حفظ التعيين
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              عرض للقراءة فقط؛ لا تملك صلاحية تعديل دور المستخدم.
            </p>
          )}
        </form>
      </Form>
    </ContentCard>
  )
}
