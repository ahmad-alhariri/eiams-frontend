import { z } from 'zod'

export const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'اسم المستخدم مطلوب.')
    .max(100, 'يجب ألا يتجاوز اسم المستخدم 100 محرف.'),
  password: z
    .string()
    .min(8, 'يجب أن تتكون كلمة المرور من 8 محارف على الأقل.')
    .max(200, 'يجب ألا تتجاوز كلمة المرور 200 محرف.'),
})

export type LoginFormValues = z.infer<typeof loginSchema>
