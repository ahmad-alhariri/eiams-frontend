import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'

import {
  useAssignmentScopeLabel,
  useAssignmentScopeSelector,
} from '@/modules/admin/hooks/use-assignment-scope-selector'
import { ROLE_SCOPE_TYPES } from '@/modules/admin/schemas/user-role-scopes.schemas'
import {
  emptyUserForm,
  userFormSchema,
  type UserFormValues,
} from '@/modules/admin/schemas/user.schemas'
import type { UserDirectoryRow } from '@/modules/admin/types/user.types'
import { ROLE_SCOPE_TYPE_LABELS_AR } from '@/modules/admin/types/role.types'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { normalizeApiError } from '@/shared/services/api-error'
import { AsyncSelect } from '@/shared/ui/async-select'
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

export interface UserFormDialogProps {
  /** The account being edited, or null when creating one. */
  user: UserDirectoryRow | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserFormValues) => Promise<void>
  /** Role options for creation; the role of an existing account is not reassigned here. */
  roles: readonly { readonly id: string; readonly nameAr: string }[]
}

/**
 * Account creation and metadata editing.
 *
 * Two modes over one form, because the two operations overlap on four fields and
 * differ on three: creation adds `password` plus the role/scope assignment, which
 * D-SRS-01 requires inline; editing has neither, and the role is reassigned through
 * the separate role-scope replacement.
 *
 * The account's name is entered as the two fields the server actually stores
 * (`firstName`, `lastName`). The backend never composes a single display name.
 */
export function UserFormDialog({
  user,
  open,
  isPending,
  onOpenChange,
  onSubmit,
  roles,
}: UserFormDialogProps) {
  const isCreate = user === null
  const form = useForm<UserFormValues>({
    // One resolver for both modes: `isCreateUserFormValues` narrows the submitted
    // values, and the create schema is a superset of the edit schema.
    resolver: zodResolver(userFormSchema(isCreate)),
    defaultValues: emptyUserForm(),
    mode: 'onChange',
  })

  // Read back out of the role list rather than trusting the form to remember a label:
  // the form holds only the id, and the id is not a label.
  const selectedRoleId = useWatch({ control: form.control, name: 'roleId' })
  const selectedRoleNameAr = roles.find((role) => role.id === selectedRoleId)?.nameAr

  useEffect(() => {
    if (!open) return
    if (user === null) {
      form.reset(emptyUserForm())
      return
    }
    // The login is shown read-only on edit: the backend serves it on reads and the
    // update body no longer accepts it, so it can neither be lost nor renamed here.
    form.reset({
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
    })
  }, [form, open, user])

  const submit = async (values: UserFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['email', 'username', 'firstName', 'lastName', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'إضافة مستخدم' : 'تعديل المستخدم'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'أنشئ الحساب مع دوره ونطاقه في عملية واحدة؛ لا يمكن إنشاء حساب بلا إسناد.'
              : 'عدّل بيانات الحساب. الدور والنطاق يُداران عبر شاشة تعيين الدور والنطاق.'}
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>البريد الإلكتروني</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="ltr"
                      disabled={isPending}
                      placeholder="user@eiams.local"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم الدخول</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      dir="ltr"
                      disabled={isPending || !isCreate}
                      placeholder="ahmad.mohammad"
                    />
                  </FormControl>
                  <FormMessage />
                  {/* The login is fixed at creation: it identifies the account in
                      audit trails and cannot be renamed through this form. */}
                  {!isCreate ? (
                    <p className="text-sm text-muted-foreground">
                      اسم الدخول ثابت بعد الإنشاء ولا يمكن تغييره.
                    </p>
                  ) : null}
                </FormItem>
              )}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الاسم الأول</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="أحمد" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>اسم العائلة</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={isPending} placeholder="محمد" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {isCreate ? (
              <>
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمة المرور الأولية</FormLabel>
                      <FormControl>
                        <Input {...field} dir="ltr" type="password" disabled={isPending} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="roleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الدور</FormLabel>
                      <Select
                        value={field.value === '' ? '' : field.value}
                        disabled={isPending || roles.length === 0}
                        onValueChange={(value) => field.onChange(value ?? '')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            {/* The trigger must be given the label explicitly. Without a
                                child, `SelectValue` falls back to rendering the selected
                                item's raw `value`, so the closed control showed the role
                                GUID while the open list showed the Arabic name. */}
                            <SelectValue placeholder="اختر الدور">
                              {selectedRoleNameAr ?? ''}
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <CreateAssignmentFields form={form} isPending={isPending} />
              </>
            ) : null}
            <FormField
              control={form.control}
              name="status"
              render={({ field, fieldState }) => (
                <FormItem>
                  <FormLabel>الحالة</FormLabel>
                  <Select
                    value={field.value}
                    disabled={isPending}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue>{field.value === 'Active' ? 'نشط' : 'موقوف'}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Active">نشط</SelectItem>
                      <SelectItem value="Suspended">موقوف</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit" loading={isPending}>
                {isCreate ? 'إضافة مستخدم' : 'حفظ التعديلات'}
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

/**
 * The creation-only scope half of the assignment.
 *
 * A separate component because the form is typed over the union of create and edit
 * values, and these two fields exist only on the create branch. It takes the form
 * instance rather than a context hook so the field paths stay tied to the same form
 * that submitted them.
 */
function CreateAssignmentFields({
  form,
  isPending,
}: {
  readonly form: UseFormReturn<UserFormValues>
  readonly isPending: boolean
}) {
  const scopeType = useWatch({ control: form.control, name: 'scopeType' }) ?? 'Enterprise'
  const scopeId = useWatch({ control: form.control, name: 'scopeId' }) ?? ''
  const isEnterprise = scopeType === 'Enterprise'

  // Choosing "Warehouse" is not yet a mistake: the administrator still has to pick
  // a target. The form validates on change, so without this the required-field error
  // appeared the instant the scope type was chosen — before the picker was ever
  // touched. Only report it once the picker itself has been used.
  const scopeTouched = form.formState.touchedFields.scopeId === true

  // The same server-backed picker the role/scope editor uses, so an administrator
  // recognises a site or warehouse by name instead of transcribing a UUID. Enterprise
  // has no target resource, so the hook resolves an empty option list and the field is
  // not rendered at all.
  const { loadOptions, scopeReady } = useAssignmentScopeSelector(scopeType)
  const scopeLabelAr = useAssignmentScopeLabel(scopeType, scopeId === '' ? null : scopeId)

  return (
    <>
      <FormField
        control={form.control}
        name="scopeType"
        render={({ field }) => (
          <FormItem>
            <FormLabel>النطاق</FormLabel>
            <Select
              value={field.value}
              disabled={isPending}
              onValueChange={(value) => {
                field.onChange(value)
                // Enterprise carries the contract's null identifier, and switching
                // scope type invalidates any previously chosen target.
                form.setValue('scopeId', '', { shouldDirty: true, shouldValidate: true })
              }}
            >
              <FormControl>
                <SelectTrigger>
                  {/* Same reason as the role trigger: without an explicit child
                        `SelectValue` renders the raw `value`, which here is the English
                        enum member. The open list shows Arabic, so the closed control must
                        too. */}
                  <SelectValue>{ROLE_SCOPE_TYPE_LABELS_AR[field.value]}</SelectValue>
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {ROLE_SCOPE_TYPES.map((candidate) => (
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
          name="scopeId"
          render={({ field }) => {
            const scopeTypeLabelAr = ROLE_SCOPE_TYPE_LABELS_AR[scopeType]
            return (
              <FormItem>
                <FormLabel>{scopeTypeLabelAr}</FormLabel>
                <AsyncSelect
                  value={field.value === '' ? null : field.value}
                  onValueChange={(value) => field.onChange(value ?? '')}
                  loadOptions={loadOptions}
                  disabled={!scopeReady || isPending}
                  placeholder={`اختر ${scopeTypeLabelAr}...`}
                  emptyMessage={`لا يوجد ${scopeTypeLabelAr} متاح`}
                  initialOption={
                    field.value === '' || scopeLabelAr === undefined
                      ? null
                      : { value: field.value, label: scopeLabelAr }
                  }
                  inputProps={{
                    'aria-label': scopeTypeLabelAr,
                    onBlur: () =>
                      void form.setValue('scopeId', form.getValues('scopeId'), {
                        shouldTouch: true,
                        shouldValidate: true,
                      }),
                  }}
                />
                <FormDescription>
                  يُختار {scopeTypeLabelAr} من القائمة، ولا يُقبل إدخال معرّفه يدوياً.
                </FormDescription>
                {scopeTouched ? <FormMessage /> : null}
              </FormItem>
            )
          }}
        />
      ) : null}
    </>
  )
}
