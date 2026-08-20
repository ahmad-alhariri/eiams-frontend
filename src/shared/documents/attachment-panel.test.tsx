import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  AttachmentPanel,
  type AttachmentPanelProps,
  type PendingAttachmentUpload,
} from '@/shared/documents/attachment-panel'
import type { DocumentAttachment } from '@/shared/types/generated/eiams-v1'
import { formatDate, formatFileSize } from '@/shared/utils/format'

const UPLOADED_BY = { id: 'user-1', displayName: 'أحمد العطار' }

function makeAttachment(overrides: Partial<DocumentAttachment> = {}): DocumentAttachment {
  return {
    attachmentId: 'att-1',
    attachmentType: 'SignedOriginal',
    checksum: 'abc',
    documentId: 'doc-1',
    downloadUrl: null,
    fileSize: 2048,
    mimeType: 'application/pdf',
    originalFilename: 'signed.pdf',
    uploadedAt: '2026-08-10T09:30:00.000Z',
    uploadedBy: UPLOADED_BY,
    ...overrides,
  }
}

function makeFile(name: string, type = 'application/pdf', size = 1024) {
  return new File([new Uint8Array(size)], name, { type })
}

function createDataTransfer(files: File[]) {
  return {
    types: ['Files'],
    items: files.map((file) => ({
      kind: 'file',
      type: file.type,
      getAsFile: () => file,
    })),
  }
}

function dropFiles(area: HTMLElement, files: File[]) {
  fireEvent.drop(area, { dataTransfer: createDataTransfer(files) })
}

function renderPanel(overrides: Partial<AttachmentPanelProps> = {}) {
  const onUpload = vi.fn()
  const onRemove = vi.fn()
  const onCancelPending = vi.fn()
  const utils = render(
    <AttachmentPanel
      attachments={[]}
      pendingUploads={[]}
      isUploading={false}
      onUpload={onUpload}
      onRemove={onRemove}
      onCancelPending={onCancelPending}
      {...overrides}
    />,
  )
  return { ...utils, onUpload, onRemove, onCancelPending }
}

function sectionSigned(container: HTMLElement) {
  return within(container.querySelector('[data-testid="attachment-section-signed"]')!)
}

function sectionSupporting(container: HTMLElement) {
  return within(container.querySelector('[data-testid="attachment-section-supporting"]')!)
}

describe('AttachmentPanel — copy and existing attachments', () => {
  it('renders Arabic section titles and the signed-original helper line', () => {
    const { container } = renderPanel()

    expect(screen.getByRole('heading', { name: 'النسخة الأصلية الموقعة' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'ملفات داعمة' })).toBeInTheDocument()
    expect(sectionSigned(container).getByText(/نسخة واحدة فقط/)).toBeInTheDocument()
    expect(sectionSupporting(container).getByText(/ملفات إضافية/)).toBeInTheDocument()
  })

  it('renders existing attachments with name, size, date and uploader in Arabic', () => {
    const signed = makeAttachment()
    const supporting = makeAttachment({
      attachmentId: 'att-2',
      attachmentType: 'Supporting',
      originalFilename: 'فاتورة.pdf',
      fileSize: 4096,
    })
    const { container } = renderPanel({ attachments: [signed, supporting] })

    const signedSection = sectionSigned(container)
    const signedRow = signedSection.getByTestId('attachment-row')
    expect(within(signedRow).getByText('signed.pdf')).toBeInTheDocument()
    expect(within(signedRow).getByTestId('attachment-meta').textContent).toContain(
      formatFileSize(2048),
    )
    expect(within(signedRow).getByTestId('attachment-meta').textContent).toContain(
      formatDate(signed.uploadedAt),
    )
    expect(within(signedRow).getByTestId('attachment-meta').textContent).toContain(
      'بواسطة أحمد العطار',
    )

    const supportingSection = sectionSupporting(container)
    expect(supportingSection.getByText('فاتورة.pdf')).toBeInTheDocument()
    expect(supportingSection.getByTestId('attachment-meta').textContent).toContain(
      formatFileSize(4096),
    )
  })
})

describe('AttachmentPanel — single signed-original slot', () => {
  it('uploads only one signed file on selection and replaces a previous pending one', async () => {
    const previous = makeFile('previous.jpg', 'image/jpeg')
    const next = makeFile('next.jpg', 'image/jpeg')
    const pending: PendingAttachmentUpload = { file: previous, attachmentType: 'SignedOriginal' }
    const { onUpload, onCancelPending, container } = renderPanel({
      attachments: [makeAttachment()],
      pendingUploads: [pending],
    })

    dropFiles(sectionSigned(container).getByRole('button', { name: /اسحب وأفلت/ }), [
      next,
      previous,
    ])

    await waitFor(() => expect(onCancelPending).toHaveBeenCalledWith(previous))
    expect(onUpload).toHaveBeenCalledTimes(1)
    expect(onUpload.mock.calls[0]?.[0]).toHaveLength(1)
    expect(onUpload.mock.calls[0]?.[0][0]).toBe(next)
    expect(onUpload.mock.calls[0]?.[1]).toBe('SignedOriginal')
  })

  it('passes supporting selection with the Supporting type', async () => {
    const file = makeFile('note.pdf')
    const { onUpload, onCancelPending, container } = renderPanel()

    dropFiles(sectionSupporting(container).getByRole('button', { name: /اسحب وأفلت/ }), [file])

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith([file], 'Supporting'))
    expect(onCancelPending).not.toHaveBeenCalled()
  })
})

describe('AttachmentPanel — pending upload rows', () => {
  it('shows a spinner while uploading and cancels instantly without a confirm', async () => {
    const file = makeFile('scan.jpg', 'image/jpeg')
    const pending: PendingAttachmentUpload = { file, attachmentType: 'Supporting' }
    const user = userEvent.setup()
    const { onCancelPending } = renderPanel({ pendingUploads: [pending], isUploading: true })

    const row = screen.getByTestId('pending-upload-row')
    expect(within(row).getByText('scan.jpg')).toBeInTheDocument()
    expect(within(row).getByText(formatFileSize(file.size))).toBeInTheDocument()
    expect(screen.getByText('جارٍ الرفع...')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'إلغاء رفع scan.jpg' }))
    expect(onCancelPending).toHaveBeenCalledWith(file)
  })

  it('shows the failed state with the Arabic error and retries the upload', async () => {
    const file = makeFile('broken.pdf')
    const pending: PendingAttachmentUpload = {
      file,
      attachmentType: 'SignedOriginal',
      failed: true,
    }
    const user = userEvent.setup()
    const { onUpload } = renderPanel({ pendingUploads: [pending], uploadError: 'تعذر الرفع — 413' })

    const row = screen.getByTestId('pending-upload-row')
    expect(row).toHaveAttribute('data-failed', 'true')
    expect(within(row).getByRole('alert')).toHaveTextContent('تعذر الرفع — 413')

    await user.click(screen.getByTestId('pending-upload-retry'))
    expect(onUpload).toHaveBeenCalledWith([file], 'SignedOriginal')
  })
})

describe('AttachmentPanel — remove flow', () => {
  it('requires a destructive confirm before removing an existing attachment', async () => {
    const attachment = makeAttachment({ originalFilename: 'فاتورة.pdf' })
    const user = userEvent.setup()
    const { onRemove } = renderPanel({ attachments: [attachment] })

    await user.click(screen.getByRole('button', { name: 'حذف المرفق فاتورة.pdf' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'حذف المرفق' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(/سيتم حذف المرفق «فاتورة.pdf» نهائياً/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'إلغاء' }))
    await waitFor(() => expect(onRemove).not.toHaveBeenCalled())

    await user.click(screen.getByRole('button', { name: 'حذف المرفق فاتورة.pdf' }))
    const dialogAgain = await screen.findByRole('alertdialog', { name: 'حذف المرفق' })
    await user.click(within(dialogAgain).getByRole('button', { name: 'حذف' }))

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith(attachment))
  })
})

describe('AttachmentPanel — readOnly', () => {
  it('hides remove, cancel and picker actions but keeps the list readable', () => {
    const attachment = makeAttachment()
    const file = makeFile('scan.jpg', 'image/jpeg')
    const pending: PendingAttachmentUpload = { file, attachmentType: 'Supporting' }
    renderPanel({ attachments: [attachment], pendingUploads: [pending], readOnly: true })

    expect(screen.getByText('signed.pdf')).toBeInTheDocument()
    expect(screen.getByText('scan.jpg')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'حذف المرفق signed.pdf' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'إلغاء رفع scan.jpg' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /اسحب وأفلت/ })).not.toBeInTheDocument()
  })
})

describe('AttachmentPanel — signed-original gate status row', () => {
  it('shows the warning hint when no signed original exists', () => {
    renderPanel()

    const gate = screen.getByTestId('attachment-gate-missing')
    expect(gate).toHaveTextContent('النسخة الأصلية الموقعة مطلوبة للترحيل')
    expect(screen.queryByTestId('attachment-gate-satisfied')).not.toBeInTheDocument()
  })

  it('shows the satisfied badge when policy reports signedOriginalSatisfied', () => {
    renderPanel({
      policy: { signedOriginalSatisfied: true, blockers: [] },
    })

    const gate = screen.getByTestId('attachment-gate-satisfied')
    expect(gate).toHaveTextContent('النسخة الأصلية الموقعة مرفوعة')
    expect(screen.queryByTestId('attachment-gate-missing')).not.toBeInTheDocument()
  })

  it('mirrors the server gate even when an attachment list row exists', () => {
    renderPanel({
      attachments: [makeAttachment()],
      policy: { signedOriginalSatisfied: false, blockers: [] },
    })

    expect(screen.getByTestId('attachment-gate-missing')).toHaveTextContent(
      'النسخة الأصلية الموقعة مطلوبة للترحيل',
    )
    expect(screen.queryByTestId('attachment-gate-satisfied')).not.toBeInTheDocument()
  })

  it('renders the Arabic blocker reason from policy when the gate is missing', () => {
    renderPanel({
      policy: {
        signedOriginalSatisfied: false,
        blockers: [{ code: 'signed_original_missing', messageAr: 'لا توجد نسخة أصلية موقعة بعد' }],
      },
    })

    expect(screen.getByText('لا توجد نسخة أصلية موقعة بعد')).toBeInTheDocument()
  })

  it('falls back to attachment presence when no policy is provided', () => {
    renderPanel({ attachments: [makeAttachment()] })

    expect(screen.getByTestId('attachment-gate-satisfied')).toHaveTextContent(
      'النسخة الأصلية الموقعة مرفوعة',
    )
  })

  it('reports the gate as moot on a Posted document even when the policy is unsatisfied', () => {
    renderPanel({
      documentStatus: 'Posted',
      policy: { signedOriginalSatisfied: false, blockers: [] },
    })

    expect(screen.getByTestId('attachment-gate-moot')).toHaveTextContent(
      'النسخة الموقعة غير مطلوبة بعد الآن',
    )
    expect(screen.queryByTestId('attachment-gate-missing')).not.toBeInTheDocument()
    expect(screen.queryByTestId('attachment-gate-satisfied')).not.toBeInTheDocument()
  })

  it('reports the gate as moot on Reversed and Cancelled documents', () => {
    const first = renderPanel({ documentStatus: 'Reversed' })
    expect(first.getByTestId('attachment-gate-moot')).toBeInTheDocument()
    first.unmount()

    const second = renderPanel({ documentStatus: 'Cancelled' })
    expect(second.getByTestId('attachment-gate-moot')).toBeInTheDocument()
    second.unmount()
  })

  it('still warns on Draft and Submitted documents', () => {
    const first = renderPanel({ documentStatus: 'Draft' })
    expect(first.getByTestId('attachment-gate-missing')).toBeInTheDocument()
    first.unmount()

    const second = renderPanel({ documentStatus: 'Submitted' })
    expect(second.getByTestId('attachment-gate-missing')).toBeInTheDocument()
    second.unmount()
  })
})
