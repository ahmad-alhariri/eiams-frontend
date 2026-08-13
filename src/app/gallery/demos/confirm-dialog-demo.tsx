import { useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { useConfirm, type ConfirmRequest, type ConfirmResult } from '@/shared/hooks/use-confirm'
import { Button } from '@/shared/ui/button'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

function ConfirmResultLine({ result }: { result: ConfirmResult | null }) {
  if (result === null) {
    return (
      <span className="text-sm text-muted-foreground">لا نتيجة بعد — جرّب الضغط على الزر.</span>
    )
  }
  if (!result.confirmed) {
    return <span className="text-sm text-muted-foreground">تم الإلغاء.</span>
  }
  return (
    <span className="text-sm text-foreground">
      تم التأكيد{result.reason ? ` — السبب: «${result.reason}»` : ''}.
    </span>
  )
}

function DemoConfirmRow({
  buttonLabel,
  buttonVariant,
  request,
}: {
  buttonLabel: string
  buttonVariant: 'default' | 'destructive' | 'outline'
  request: ConfirmRequest
}) {
  const { confirm, element } = useConfirm()
  const [result, setResult] = useState<ConfirmResult | null>(null)

  const handleClick = async () => {
    const outcome = await confirm(request)
    setResult(outcome)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant={buttonVariant} onClick={() => void handleClick()}>
        {buttonLabel}
      </Button>
      <ConfirmResultLine result={result} />
      {element}
    </div>
  )
}

function ConfirmDialogDemo() {
  return (
    <div className="flex flex-col gap-4">
      <DemoConfirmRow
        buttonLabel="تأكيد بسيط"
        buttonVariant="default"
        request={{ message: 'هل تريد تأكيد هذا الإجراء؟' }}
      />
      <DemoConfirmRow
        buttonLabel="حذف نهائي"
        buttonVariant="destructive"
        request={{
          message: 'لا يمكن التراجع عن الحذف النهائي لهذا السجل.',
          variant: 'destructive',
          confirmLabel: 'حذف نهائي',
        }}
      />
      <DemoConfirmRow
        buttonLabel="تتطلب سبباً"
        buttonVariant="outline"
        request={{
          message: 'يجب ذكر سبب الإجراء قبل المتابعة.',
          requireReason: true,
          reasonPlaceholder: 'اكتب سبب الإجراء هنا...',
        }}
      />
    </div>
  )
}

export const confirmDialogGallerySections: GallerySection[] = [
  {
    id: 'confirm-dialog',
    titleAr: 'حوار التأكيد (ConfirmDialog)',
    descriptionAr:
      'تأكيد الإجراءات العامة والحذف النهائي، مع إمكانية طلب سبب إلزامي قبل تنفيذ الإجراء.',
    render: () => <ConfirmDialogDemo />,
  },
]
