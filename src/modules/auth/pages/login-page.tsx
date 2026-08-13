import { zodResolver } from '@hookform/resolvers/zod'
import { IconBuildingWarehouse, IconLock, IconShieldCheck, IconUser } from '@tabler/icons-react'
import { useForm } from 'react-hook-form'

import { useLoginMutation } from '@/modules/auth/hooks/use-login-mutation'
import { loginSchema, type LoginFormValues } from '@/modules/auth/schemas/auth.schemas'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/shared/forms/form'
import { setFormServerErrors } from '@/shared/forms/server-errors'
import { normalizeApiError } from '@/shared/services/api-error'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { toast } from '@/shared/ui/toast-manager'

const LOGIN_FIELD_KEYS = ['username', 'password'] as const

/**
 * Public, standalone institutional entry surface. Authentication lifecycle
 * routing remains with the anonymous/protected guards (e06-t05); this page
 * only validates credentials, invokes the contract service, and gives the
 * successful token response to the adapter-owned session store.
 */
function LoginPage() {
  const loginMutation = useLoginMutation()
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  const onSubmit = async (values: LoginFormValues) => {
    form.clearErrors()

    try {
      await loginMutation.mutateAsync(values)
      form.resetField('password')
      toast.success({ title: 'تم التحقق من بيانات الدخول.' })
    } catch (error: unknown) {
      const apiError = normalizeApiError(error)
      // Credentials must not remain in the form after either outcome. Reset
      // before mapping server feedback so a contract field error stays visible.
      form.resetField('password')
      setFormServerErrors(form, apiError.fieldErrors, { schemaKeys: LOGIN_FIELD_KEYS })
      toast.error({
        title: apiError.titleAr,
        ...(apiError.detailAr === null ? {} : { description: apiError.detailAr }),
      })
    } finally {
      // Removes the observer's completed mutation state, including variables.
      loginMutation.reset()
    }
  }

  return (
    <main
      dir="rtl"
      aria-labelledby="login-page-title"
      className="min-h-dvh bg-background p-4 sm:p-8 lg:p-12"
    >
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-6xl overflow-hidden rounded-2xl border border-border bg-popover shadow-modal sm:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.15fr_0.85fr]">
        <section
          aria-labelledby="login-page-title"
          className="relative flex flex-col justify-between bg-primary p-7 text-primary-foreground sm:p-10 lg:p-12"
        >
          <div className="absolute inset-inline-start-0 top-0 h-1 w-full bg-warning" aria-hidden />
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-lg border border-primary-foreground/25 bg-primary-foreground/10">
              <IconBuildingWarehouse className="size-6" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-wide text-ivory">
                الجمهورية العربية السورية
              </p>
              <p className="text-xs text-ivory/75">الجهاز المركزي للرقابة والتفتيش</p>
            </div>
          </div>

          <div className="my-12 max-w-xl lg:my-0">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-antique-sand">
              <IconShieldCheck className="size-5" aria-hidden />
              بوابة النفاذ المؤسسية
            </p>
            <h1
              id="login-page-title"
              className="font-arabic text-3xl font-bold leading-tight sm:text-4xl"
            >
              نظام إدارة المخزون والأصول
            </h1>
            <p className="mt-4 max-w-md text-base leading-7 text-ivory/80 sm:text-lg">
              دخول موثّق لإدارة المواد والأصول وسندات المستودعات ضمن نطاق عملك المعتمد.
            </p>
          </div>

          <p className="hidden border-t border-primary-foreground/20 pt-5 text-sm leading-6 text-ivory/75 sm:block">
            تُسجّل كل عملية دخول وفق ضوابط الصلاحيات والنطاق المؤسسي.
          </p>
        </section>

        <section className="flex items-center bg-popover p-7 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-8">
              <p className="text-sm font-semibold text-primary">تسجيل الدخول</p>
              <h2 className="mt-2 text-2xl font-bold text-foreground">أدخل بياناتك المعتمدة</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                استخدم اسم المستخدم وكلمة المرور المخصصين لك.
              </p>
            </div>

            <Form {...form}>
              <form
                noValidate
                aria-busy={loginMutation.isPending}
                className="grid gap-5"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <FormField
                  control={form.control}
                  name="username"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم المستخدم</FormLabel>
                      <div className="relative">
                        <IconUser
                          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-muted-foreground"
                          aria-hidden
                        />
                        <FormControl>
                          <Input
                            {...field}
                            disabled={loginMutation.isPending}
                            autoComplete="username"
                            placeholder="أدخل اسم المستخدم"
                            className="border-secondary ps-11"
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>كلمة المرور</FormLabel>
                      <div className="relative">
                        <IconLock
                          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-muted-foreground"
                          aria-hidden
                        />
                        <FormControl>
                          <Input
                            {...field}
                            disabled={loginMutation.isPending}
                            type="password"
                            autoComplete="current-password"
                            placeholder="أدخل كلمة المرور"
                            className="border-secondary ps-11"
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  size="lg"
                  className="mt-2 w-full"
                  loading={loginMutation.isPending}
                >
                  تسجيل الدخول
                </Button>
              </form>
            </Form>
          </div>
        </section>
      </div>
    </main>
  )
}

export default LoginPage
