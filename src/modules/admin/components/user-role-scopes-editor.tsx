import { IconDeviceFloppy } from '@tabler/icons-react'
import { useMemo } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'

import {
  ROLE_SCOPE_TYPES,
  scopeTypeLabelAr,
  type UserRoleScopeFormValues,
} from '@/modules/admin/schemas/user-role-scopes.schemas'
import { ROLE_SCOPE_TYPE_LABELS_AR, type RoleScopeType } from '@/modules/admin/types/role.types'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/forms/form'
import { ContentCard } from '@/shared/layout/content-card'
import { AsyncSelect, type AsyncSelectOption } from '@/shared/ui/async-select'
import { Button } from '@/shared/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import type { ScopeTarget } from '@/modules/admin/hooks/use-assignment-scope-selector'

/**
 * The role labels this editor reads. Declared structurally rather than importing
 * the generated Role, which described a record the backend does not serve.
 */
export interface RoleOption {
  readonly id: string
  readonly nameAr: string
  /** Scopes this role may be assigned at; drives the scope-type choices. */
  readonly allowedScopeTypes: readonly RoleScopeType[]
}

interface UserRoleScopeEditorProps {
  canManage: boolean
  canSelectRoles: boolean
  form: UseFormReturn<UserRoleScopeFormValues>
  isPending: boolean
  isRoleCatalogLoading: boolean
  onSubmit: (values: UserRoleScopeFormValues) => Promise<void>
  roles: readonly RoleOption[]
  /** AsyncSelect-compatible Site/Warehouse loader for the selected scope type. */
  loadScopeOptions: (query: string) => Promise<AsyncSelectOption<ScopeTarget>[]>
  /** False until an active scope is known, so the picker stays disabled. */
  scopeSelectorReady: boolean
  /**
   * Pre-resolved Arabic label for the served scope target. Undefined while it is
   * still loading, when the target does not exist, or when the caller cannot view
   * it; the editor then shows the formatted identifier rather than a name.
   */
  readonly scopeLabelAr: string | undefined
}

/**
 * The user's single role-and-scope assignment (D-SRS-01).
 *
 * One role, one scope, one save. There is deliberately no add/remove affordance:
 * a collection editor would let an administrator hold more than one assignment,
 * which the backend would refuse and which the decision forbids. Enterprise has no
 * target resource, so its scope identifier is the contract's `null` and the
 * picker is hidden rather than disabled.
 */
export function UserRoleScopeEditor({
  canManage,
  canSelectRoles,
  form,
  isPending,
  isRoleCatalogLoading,
  onSubmit,
  roles,
  loadScopeOptions,
  scopeSelectorReady,
  scopeLabelAr,
}: UserRoleScopeEditorProps) {
  const assignment = useWatch({ control: form.control, name: 'assignment' })
  const scopeType: RoleScopeType = assignment?.scopeType ?? 'Enterprise'
  const isEnterprise = scopeType === 'Enterprise'

  const roleNameById = useMemo(() => new Map(roles.map((role) => [role.id, role.nameAr])), [roles])
  const selectedRole = roles.find((role) => role.id === assignment?.roleId)
  const roleName = roleNameById.get(assignment?.roleId ?? '') ?? 'غير محدد'

  /**
   * Only the scope types the chosen role actually permits are offered. The backend
   * refuses the rest with 409 `RoleNotAllowedAtScope`, so this is defence in depth
   * that also explains the restriction rather than letting a save fail on it.
   */
  const availableScopeTypes = useMemo(() => {
    const allowed = selectedRole?.allowedScopeTypes
    if (allowed === undefined || allowed.length === 0) return [...ROLE_SCOPE_TYPES]
    return ROLE_SCOPE_TYPES.filter((candidate) => allowed.includes(candidate))
  }, [selectedRole])

  /**
   * Switching role can leave the current scope type unassignable for the new one.
   *
   * When that happens the scope type moves to the new role's first permitted value
   * AND the previously chosen target is cleared: a Site identifier is meaningless
   * under Warehouse, and Enterprise's target is the contract's `null`. Carrying the
   * old `scopeId` across would submit an id of the wrong scope type, which the
   * backend refuses as `ScopeTargetNotFound`.
   */
  const handleRoleChange = (roleId: string) => {
    form.setValue('assignment.roleId', roleId, { shouldDirty: true, shouldValidate: true })
    const nextRole = roles.find((role) => role.id === roleId)
    const allowed = nextRole?.allowedScopeTypes
    if (allowed === undefined || allowed.length === 0 || allowed.includes(scopeType)) {
      return
    }

    const fallback = allowed[0] ?? 'Enterprise'
    form.setValue('assignment.scopeType', fallback, { shouldDirty: true, shouldValidate: true })
    form.setValue('assignment.scopeId', '', { shouldDirty: true, shouldValidate: true })
  }

  /**
   * The role picker only mounts once the catalogue has loaded.
   *
   * Radix's trigger renders the raw `value` when no matching item is mounted, which
   * for a role id means the administrator sees a bare GUID. Mounting the picker only
   * after the catalogue resolves means its items always exist by the time the trigger
   * paints. An unassigned user still gets the picker — that is how the FIRST
   * assignment is made — and shows the placeholder until a role is chosen.
   */
  const showRolePicker = canManage && canSelectRoles && !isRoleCatalogLoading

  return (
    <ContentCard
      title="دور المستخدم ونطاقه"
      description="يُسند لكل مستخدم دور واحد ونطاق واحد فقط. الحفظ يستبدل التعيين بالكامل باستخدام إصداره الحالي."
    >
      <Form {...form}>
        <form
          noValidate
          aria-busy={isPending}
          className="grid gap-4"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <fieldset className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
            <legend className="sr-only">تعيين دور المستخدم ونطاقه</legend>

            <FormField
              control={form.control}
              name="assignment.roleId"
              render={({ field: roleField, fieldState }) => (
                <FormItem>
                  <FormLabel>الدور</FormLabel>
                  {showRolePicker ? (
                    <>
                      <Select
                        value={roleField.value === '' ? '' : roleField.value}
                        disabled={isRoleCatalogLoading}
                        onValueChange={(value) => {
                          // A selection is always a value here; a null would mean
                          // the trigger was cleared, which leaves the role unset
                          // rather than changing an existing one.
                          roleField.onChange(value ?? '')
                          if (value !== null) handleRoleChange(value)
                        }}
                      >
                        <FormControl>
                          {/* The trigger renders the raw `value` unless it is
                              given children, so the resolved Arabic label is
                              passed explicitly — otherwise the administrator
                              sees the role's UUID. */}
                          <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                            <SelectValue placeholder="اختر الدور">
                              {selectedRole?.nameAr ?? ''}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {roles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  ) : (
                    <p className="min-h-9 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                      {roleName}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="assignment.scopeType"
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
                      // Enterprise carries the contract's null identifier, and
                      // switching scope type invalidates the previously chosen target.
                      form.setValue('assignment.scopeId', '', {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableScopeTypes.map((candidate) => (
                        <SelectItem key={candidate} value={candidate}>
                          {ROLE_SCOPE_TYPE_LABELS_AR[candidate]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEnterprise ? (
              <FormField
                control={form.control}
                name="assignment.scopeId"
                render={({ field: scopeIdField }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>{scopeTypeLabelAr(scopeType)}</FormLabel>
                    {canManage ? (
                      <AsyncSelect
                        value={scopeIdField.value === '' ? null : (scopeIdField.value ?? null)}
                        onValueChange={(value) => scopeIdField.onChange(value ?? '')}
                        loadOptions={loadScopeOptions}
                        disabled={!scopeSelectorReady || isPending}
                        placeholder={`اختر ${scopeTypeLabelAr(scopeType)}...`}
                        initialOption={
                          scopeIdField.value === '' || scopeLabelAr === undefined
                            ? null
                            : { value: scopeIdField.value, label: scopeLabelAr }
                        }
                        inputProps={{ 'aria-label': scopeTypeLabelAr(scopeType) }}
                      />
                    ) : scopeIdField.value === '' ? (
                      <p className="min-h-9 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                        غير محدد
                      </p>
                    ) : (
                      <p className="min-h-9 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                        {scopeLabelAr ?? scopeIdField.value}
                      </p>
                    )}
                    <FormDescription>
                      تظهر هنا فقط المواقع والمستودعات التي تملك صلاحية عرضها.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                نطاق المؤسسة لا يتطلب تحديد موقع أو مستودع؛ يُرسَل معرّف النطاق فارغاً.
              </p>
            )}
          </fieldset>

          {form.formState.errors.root?.['serverError']?.message ? (
            <p role="alert" className="text-sm text-destructive">
              {form.formState.errors.root['serverError'].message}
            </p>
          ) : null}

          {canManage && !canSelectRoles ? (
            <p className="text-sm text-muted-foreground">
              يمكنك تعديل نطاق الدور الحالي. تتطلب تغيير الدور صلاحية عرض الأدوار.
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
