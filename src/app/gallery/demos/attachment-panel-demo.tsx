import { useEffect, useRef, useState } from 'react'

import type { GallerySection } from '@/app/gallery/gallery-sections'
import {
  AttachmentPanel,
  type AttachmentPanelPolicy,
  type PendingAttachmentUpload,
} from '@/shared/documents/attachment-panel'
import type { AttachmentType, DocumentAttachment } from '@/shared/types/generated/eiams-v1'
import { Button } from '@/shared/ui/button'

/* eslint-disable react-refresh/only-export-components -- dev-only gallery demo
   that intentionally exports its sections registry alongside local components. */

const DEMO_UPLOADER = { id: 'user-demo', displayName: 'خالد الصباغ' }

const INITIAL_ATTACHMENTS: DocumentAttachment[] = [
  {
    attachmentId: 'a1000000-0000-0000-0000-000000000001',
    attachmentType: 'SignedOriginal',
    checksum: 'demo-checksum-1',
    documentId: 'd1000000-0000-0000-0000-000000000001',
    downloadUrl: null,
    fileSize: 2 * 1024 * 1024,
    mimeType: 'application/pdf',
    originalFilename: 'النسخة الموقعة من أمر الاستلام.pdf',
    uploadedAt: '2026-08-10T09:30:00.000Z',
    uploadedBy: DEMO_UPLOADER,
  },
  {
    attachmentId: 'a2000000-0000-0000-0000-000000000001',
    attachmentType: 'Supporting',
    checksum: 'demo-checksum-2',
    documentId: 'd1000000-0000-0000-0000-000000000001',
    downloadUrl: null,
    fileSize: 512 * 1024,
    mimeType: 'image/jpeg',
    originalFilename: 'صورة تغليف.jpg',
    uploadedAt: '2026-08-10T09:31:00.000Z',
    uploadedBy: DEMO_UPLOADER,
  },
  {
    attachmentId: 'a3000000-0000-0000-0000-000000000001',
    attachmentType: 'Supporting',
    checksum: 'demo-checksum-3',
    documentId: 'd1000000-0000-0000-0000-000000000001',
    downloadUrl: null,
    fileSize: 64 * 1024,
    mimeType: 'image/png',
    originalFilename: 'شهادة الفحص.png',
    uploadedAt: '2026-08-10T09:32:00.000Z',
    uploadedBy: DEMO_UPLOADER,
  },
]

function AttachmentPanelDemo() {
  const [attachments, setAttachments] = useState<DocumentAttachment[]>(INITIAL_ATTACHMENTS)
  const [pendingUploads, setPendingUploads] = useState<PendingAttachmentUpload[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [satisfied, setSatisfied] = useState(true)
  const timersRef = useRef<number[]>([])

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  const policy: AttachmentPanelPolicy = satisfied
    ? { signedOriginalSatisfied: true, blockers: [] }
    : {
        signedOriginalSatisfied: false,
        blockers: [
          { code: 'signed_original_missing', messageAr: 'لا توجد نسخة أصلية موقعة معتمدة بعد' },
        ],
      }

  const completeUpload = (file: File, attachmentType: AttachmentType) => {
    setPendingUploads((current) => current.filter((pending) => pending.file !== file))
    const attachment: DocumentAttachment = {
      attachmentId: crypto.randomUUID(),
      attachmentType,
      checksum: 'demo-checksum-uploaded',
      documentId: 'd1000000-0000-0000-0000-000000000001',
      downloadUrl: null,
      fileSize: file.size,
      mimeType: file.type,
      originalFilename: file.name,
      uploadedAt: new Date().toISOString(),
      uploadedBy: DEMO_UPLOADER,
    }
    setAttachments((current) =>
      attachmentType === 'SignedOriginal'
        ? [...current.filter((item) => item.attachmentType !== 'SignedOriginal'), attachment]
        : [...current, attachment],
    )
    if (attachmentType === 'SignedOriginal') {
      setSatisfied(true)
    }
  }

  const handleUpload = (files: File[], attachmentType: AttachmentType) => {
    const selected = files[0]
    if (!selected) return
    setUploadError(null)
    setPendingUploads((current) => [
      ...current.filter((pending) => pending.file !== selected),
      { file: selected, attachmentType },
    ])
    setIsUploading(true)
    const timer = window.setTimeout(() => {
      setIsUploading(false)
      completeUpload(selected, attachmentType)
    }, 500)
    timersRef.current.push(timer)
  }

  const handleRemove = (attachment: DocumentAttachment) => {
    setAttachments((current) =>
      current.filter((item) => item.attachmentId !== attachment.attachmentId),
    )
    if (attachment.attachmentType === 'SignedOriginal') {
      setSatisfied(false)
    }
  }

  const handleCancelPending = (file: File) => {
    setPendingUploads((current) => current.filter((pending) => pending.file !== file))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setSatisfied((value) => !value)}
        >
          تبديل حالة النسخة الموقعة (محاكاة تقييم الخادم)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setAttachments(INITIAL_ATTACHMENTS)
            setPendingUploads([])
            setUploadError(null)
            setIsUploading(false)
            setSatisfied(true)
          }}
        >
          إعادة التعيين
        </Button>
      </div>

      <AttachmentPanel
        attachments={attachments}
        pendingUploads={pendingUploads}
        isUploading={isUploading}
        uploadError={uploadError}
        policy={policy}
        onUpload={handleUpload}
        onRemove={handleRemove}
        onCancelPending={handleCancelPending}
      />

      <p className="text-xs text-muted-foreground">
        محاكاة فقط: الرفع يتم عبر الأب (والد مكوّن) بانتظار مصطنع ٥٠٠ مللي ثانية، وحالة النسخة
        الموقعة تُدار من تقييم الخادم المقلّد (D-ATT-01).
      </p>
    </div>
  )
}

export const attachmentPanelGallerySections: GallerySection[] = [
  {
    id: 'attachment-panel',
    titleAr: 'لوحة المرفقات (AttachmentPanel)',
    descriptionAr:
      'لوحة مرفقات موحدة لكل نماذج المستندات: فتحة واحدة للنسخة الأصلية الموقعة (الاستبدال عند الرفع الجديد) وملفات داعمة متعددة، مع صف حالة البوابة من سياسة المستند دون أي تحقق محلي.',
    render: () => <AttachmentPanelDemo />,
  },
]
