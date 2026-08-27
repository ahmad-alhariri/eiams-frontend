import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'

import {
  userSchema,
  type UserFormValues,
} from '@/modules/admin/schemas/user.schemas'
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
import type { UserSummary } from '@/shared/types/generated/eiams-v1'

const EMPTY_VALUES: UserFormValues = {
  displayName: '',
  username: '',
  status: 'Active',
}

export interface UserFormDialogProps {
  user: UserSummary | null
  open: boolean
  isPending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (values: UserFormValues) => Promise<void>
}

/** User upsert form backed only by the account fields the v1 contract exposes. */
export function UserFormDialog({
  user,
  open,
  isPending,
  onOpenChange,
  onSubmit,
}: UserFormDialogProps) {
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userSchema),
    defaultValues: EMPTY_VALUES,
  })

  useEffect(() => {
    if (!open) return
    form.reset({
      displayName: user?.displayName ?? '',
      username: user?.username ?? '',
      status: user?.status ?? 'Active',
    })
  }, [form, open, user])

  const submit = async (values: UserFormValues) => {
    form.clearErrors()
    try {
      await onSubmit(values)
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      setFormServerErrors(form, apiError.fieldErrors, {
        schemaKeys: ['displayName', 'username', 'status'],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{user ? 'تعديل المستخدم' : 'إضافة مستخدم'}</DialogTitle>
          <DialogDescription>
            أدخل بيانات حساب المستخدم. تُدار الصلاحيات والنطاق عبر شاشات الصلاحيات والأدوار.
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
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>اسم المستخدم</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isPending}
                      placeholder="مثال: أحمد محمد"
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
                      disabled={isPending}
                      placeholder="ahmad.mohammad"
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
                  <Select
                    value={field.value}
                    disabled={isPending}
                    onValueChange={(value) => field.onChange(value)}
                  >
                    <FormControl>
                      <SelectTrigger aria-invalid={fieldState.invalid || undefined}>
                        <SelectValue>
                          {field.value === 'Active' ? 'نشط' : 'موقوف'}
                        </SelectValue>
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
              <Button
                type="submit"
                loading={isPending}
              >
                {user ? 'حفظ التعديلات' : 'إضافة مستخدم'}
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
