import { IconAlertTriangle } from '@tabler/icons-react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/ui/alert-dialog'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'

describe('Dialog', () => {
  it('provides an accessible Arabic dialog with tokenized RTL-aware structure', async () => {
    const user = userEvent.setup()

    render(
      <Dialog>
        <DialogTrigger render={<Button />}>تعديل بيانات المستودع</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات المستودع</DialogTitle>
            <DialogDescription>حدّث البيانات ثم احفظ التغييرات.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button>حفظ التغييرات</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    )

    await user.click(screen.getByRole('button', { name: 'تعديل بيانات المستودع' }))

    const dialog = await screen.findByRole('dialog', { name: 'تعديل بيانات المستودع' })
    expect(dialog).toHaveAccessibleDescription('حدّث البيانات ثم احفظ التغييرات.')
    expect(dialog).toHaveClass('rounded-xl', 'bg-popover', 'shadow-modal')
    expect(dialog).toHaveClass('motion-reduce:data-open:animate-none')
    expect(dialog).not.toHaveClass('left-1/2', 'right-1/2')
    expect(screen.getByRole('button', { name: 'إغلاق النافذة' })).toBeInTheDocument()
    expect(dialog.querySelector('[data-slot="dialog-footer"]')).toHaveClass('sm:justify-start')

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog', { name: 'تعديل بيانات المستودع' })).not.toBeInTheDocument()
  })
})

describe('AlertDialog', () => {
  it('uses an explicit Arabic cancellation path and destructive confirmation treatment', async () => {
    const user = userEvent.setup()

    render(
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="destructive" />}>
          حذف المادة
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <IconAlertTriangle aria-hidden />
            </AlertDialogMedia>
            <AlertDialogTitle>تأكيد الإجراء</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع عن حذف هذه المادة.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>حذف المادة</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>,
    )

    await user.click(screen.getByRole('button', { name: 'حذف المادة' }))

    const alertDialog = await screen.findByRole('alertdialog', { name: 'تأكيد الإجراء' })
    expect(alertDialog).toHaveAccessibleDescription('لا يمكن التراجع عن حذف هذه المادة.')
    expect(alertDialog).toHaveClass('rounded-xl', 'bg-popover', 'shadow-modal')
    expect(screen.getByRole('button', { name: 'حذف المادة' })).toHaveClass('bg-destructive')
    expect(screen.getByRole('button', { name: 'إلغاء' })).toHaveClass('border-primary')
    expect(alertDialog.querySelector('[data-slot="alert-dialog-media"]')).toHaveClass(
      'bg-destructive/10',
      'text-destructive',
    )

    await user.click(screen.getByRole('button', { name: 'إلغاء' }))

    expect(screen.queryByRole('alertdialog', { name: 'تأكيد الإجراء' })).not.toBeInTheDocument()
  })
})
