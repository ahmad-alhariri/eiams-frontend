import { useState } from 'react'
import { useForm, type Resolver, type SubmitHandler } from 'react-hook-form'
import { FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import { Button } from '@/shared/ui/button'
import {
  documentHeaderSchema,
  DocumentHeaderSection,
  type DocumentHeaderContainer,
} from '@/shared/documents/document-header-form'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const DEMO_RESOLVER = z.object({ header: documentHeaderSchema })

function ReceivingPetalSlot() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
      <p className="text-sm font-medium text-foreground">بتلة إيصال الاستلام (مثال)</p>
      <p className="mt-1 text-xs text-muted-foreground">
        يقود هذا العرّض منطقة البتلة الخاصة بوحدة الاستلام: حقل المورد ورقم الفاتورة المرتبطة — ينتمي
        تنفيذها إلى وحدة الاستلام، وليس إلى قسم الرأس المشترك.
      </p>
      <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2 rounded border border-border bg-background px-2 py-1.5">
          <dt className="text-muted-foreground">المورد</dt>
          <dd className="font-medium text-foreground">الشركة العامة للتجهيز</dd>
        </div>
        <div dir="ltr" className="flex justify-between gap-2 rounded border border-border bg-background px-2 py-1.5">
          <dt className="text-muted-foreground">الفاتورة</dt>
          <dd className="font-medium text-foreground">INV-2026/0841</dd>
        </div>
      </dl>
    </div>
  )
}

function SubmittedDraft({ submitted, ready }: { submitted: unknown; ready: boolean }) {
  return (
    <pre
      dir="ltr"
      data-testid="draft-dump"
      className="max-h-44 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-start text-xs text-foreground"
    >
      {ready ? JSON.stringify(submitted, null, 2) : 'لا توجد مسودة بعد — اضغط «حفظ المسودة».'}
    </pre>
  )
}

function EditableSectionDemo() {
  const form = useForm<DocumentHeaderContainer>({
    resolver: zodResolver(DEMO_RESOLVER) as Resolver<DocumentHeaderContainer>,
    defaultValues: {
      header: { warehouseId: '', paperDocumentNumber: '' },
    },
  })
  const [draft, setDraft] = useState<object | null>(null)

  const onSubmit: SubmitHandler<DocumentHeaderContainer> = (values, event) => {
    event?.preventDefault()
    setDraft(values)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        القسم يعمل ضمن نموذج وحدة الاستلام: المستودع مرتبط بالنطاق النشط (يبحث في الخادم)، ويجري التحقق
        بالعربية عند الحفظ (أرقام إنجليزية فقط، سنة ضمن الحدود).
      </p>
      <FormProvider {...form}>
        <form
          className="flex flex-col gap-4"
          aria-label="نموذج رأس مستند استلام"
          onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}
        >
          <DocumentHeaderSection
            documentType="Receiving"
            petalSlot={<ReceivingPetalSlot />}
            initialValues={{ createdByDisplayName: 'مريم حمادة', rowVersion: 3 }}
          />
          <div className="flex items-center gap-2">
            <Button type="submit">حفظ المسودة</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void form.trigger()}
            >
              تحقق من الحقول
            </Button>
          </div>
        </form>
      </FormProvider>
      <SubmittedDraft submitted={draft} ready={draft !== null} />
    </div>
  )
}

function ReadOnlySectionDemo() {
  const form = useForm<DocumentHeaderContainer>({
    defaultValues: { header: { warehouseId: '', paperDocumentNumber: '' } },
  })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        وضع القراءة فقط لعرض مستند معتمد: صفوف نصية بدلاً من الحقول — لا يحدث أي تسجيل للحقول ولا
        جلب إضافي.
      </p>
      <FormProvider {...form}>
        <DocumentHeaderSection
          documentType="Receiving"
          readOnly
          initialValues={{
            warehouseDisplayName: 'المستودع الرئيسي — دمشق',
            createdByDisplayName: 'مريم حمادة',
            rowVersion: 3,
          }}
        />
      </FormProvider>
    </div>
  )
}

function DisabledSectionDemo() {
  const form = useForm<DocumentHeaderContainer>({
    defaultValues: { header: { warehouseId: '', paperDocumentNumber: '' } },
  })
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        حالة التعطيل: تبقى الحقول مسجلة لكنها معطّلة (تُستخدم أثناء انتظار إذن التحرير أو داخل
        سير عمل مقفول).
      </p>
      <FormProvider {...form}>
        <form onReset={(event) => event.preventDefault()}>
          <DocumentHeaderSection documentType="Issue" disabled />
        </form>
      </FormProvider>
    </div>
  )
}

export const documentHeaderGallerySections: GallerySection[] = [
  {
    id: 'document-header-section',
    titleAr: 'قسم رأس المستند المشترك (DocumentHeaderSection)',
    descriptionAr:
      'العمود الفقري المشترك لسندات المستودع: المستودع المصدر (محدد مرتبط بالنطاق)، رقم المستند الورقي وسنته، مع فتحة عرض بتلة النوع وحالات القراءة فقط والتعطيل.',
    render: () => (
      <div className="flex flex-col gap-8">
        <EditableSectionDemo />
        <ReadOnlySectionDemo />
        <DisabledSectionDemo />
      </div>
    ),
  },
]