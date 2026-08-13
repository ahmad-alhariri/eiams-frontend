import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

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
import type { FieldError } from '@/shared/types/generated/eiams-v1'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'

const demoFieldSchema = z.object({
  fullName: z.string().min(2, 'الاسم حرفان على الأقل'),
  email: z.email('البريد الإلكتروني غير صحيح'),
})

type DemoFieldValues = z.infer<typeof demoFieldSchema>

const DEMO_SERVER_ERRORS: readonly FieldError[] = [
  { code: 'DuplicateEmail', field: 'email', messageAr: 'هذا البريد مسجل مسبقاً في النظام.' },
  { code: 'ReservedName', field: 'fullName', messageAr: 'هذا الاسم محجوز لموظف آخر.' },
]

/**
 * Small RHF + Zod form using the shared bridge: inline Arabic validation,
 * description/message wiring, and a simulated contract FieldError[] payload
 * to preview server-side field errors. No server calls happen here.
 */
export function FormBridgeDemo() {
  const [submitted, setSubmitted] = useState(false)
  const form = useForm<DemoFieldValues>({
    resolver: zodResolver(demoFieldSchema),
    defaultValues: { fullName: '', email: '' },
  })
  return (
    <div className="flex max-w-md flex-col gap-3">
      <Form {...form}>
        <form className="grid gap-5" onSubmit={form.handleSubmit(() => setSubmitted(true))}>
          <FormField
            control={form.control}
            name="fullName"
            rules={{ required: true }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>الاسم الكامل</FormLabel>
                <FormControl>
                  <Input placeholder="أدخل الاسم الكامل..." {...field} />
                </FormControl>
                <FormDescription>كما يظهر على بطاقة الهوية.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            rules={{ required: true }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>البريد الإلكتروني</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="name@example.gov.sy" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <Button type="submit">حفظ</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormServerErrors(form, DEMO_SERVER_ERRORS)}
            >
              محاكاة أخطاء الخادم
            </Button>
          </div>
        </form>
      </Form>
      {submitted ? (
        <p className="text-sm text-muted-foreground">
          قُبلت البيانات محلياً — لا يوجد اتصال بالخادم داخل المعرض.
        </p>
      ) : null}
    </div>
  )
}
