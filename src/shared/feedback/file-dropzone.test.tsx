import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  DROPZONE_ACCEPT,
  DROPZONE_MAX_SIZE_BYTES,
  FileDropzone,
} from '@/shared/feedback/file-dropzone'
import { formatFileSize } from '@/shared/utils/format'

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

function makeFile(name: string, type: string, size = 1) {
  return new File([new Uint8Array(size)], name, { type })
}

describe('FileDropzone copy and layout', () => {
  it('renders Arabic copy with the helper line using formatFileSize', () => {
    render(<FileDropzone />)

    expect(screen.getByText('اسحب وأفلت الملف هنا أو انقر للاختيار')).toBeInTheDocument()
    const helper = screen.getByText(/يدعم JPG و PNG و PDF/)
    expect(helper).toHaveTextContent('م.ب')
    expect(screen.getByRole('button', { name: /اسحب وأفلت الملف هنا/ })).toHaveAttribute(
      'data-slot',
      'file-dropzone',
    )
  })

  it('exposes the documented contract mirror constants', () => {
    expect(DROPZONE_ACCEPT).toEqual({
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
    })
    expect(DROPZONE_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024)
  })
})

describe('FileDropzone acceptance and rejection', () => {
  it('accepts a valid jpeg drop and reports it through onFilesChange', async () => {
    const onFilesChange = vi.fn()
    render(<FileDropzone onFilesChange={onFilesChange} />)

    const file = makeFile('photo.jpg', 'image/jpeg')
    dropFiles(screen.getByRole('button', { name: /اسحب وأفلت الملف هنا/ }), [file])

    await waitFor(() => expect(onFilesChange).toHaveBeenCalledTimes(1))
    const next = onFilesChange.mock.calls[0]?.[0] ?? []
    expect(next).toHaveLength(1)
    expect(next[0]).toBe(file)
  })

  it('rejects an unsupported type with an Arabic alert', async () => {
    render(<FileDropzone />)

    dropFiles(screen.getByRole('button', { name: /اسحب وأفلت الملف هنا/ }), [
      makeFile('note.txt', 'application/txt'),
    ])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'file-dropzone-error')
    expect(alert).toHaveTextContent('نوع الملف غير مدعوم — يُقبل JPG و PNG و PDF فقط')
  })

  it('rejects a file above the max size with a formatted Arabic message', async () => {
    render(<FileDropzone />)

    dropFiles(screen.getByRole('button', { name: /اسحب وأفلت الملف هنا/ }), [
      makeFile('big.pdf', 'application/pdf', DROPZONE_MAX_SIZE_BYTES + 1),
    ])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/حجم الملف يتجاوز الحد المسموح/)
    expect(alert).toHaveTextContent(`(${formatFileSize(DROPZONE_MAX_SIZE_BYTES)})`)
  })

  it('rejects a second file dropped at once when maxFiles is 1', async () => {
    render(<FileDropzone />)

    dropFiles(screen.getByRole('button', { name: /اسحب وأفلت الملف هنا/ }), [
      makeFile('a.pdf', 'application/pdf'),
      makeFile('b.pdf', 'application/pdf'),
    ])

    expect(await screen.findByRole('alert')).toHaveTextContent('تجاوز العدد المسموح من الملفات')
  })
})

describe('FileDropzone preview', () => {
  it('renders filename, Arabic size, preview slot, and removes the file', () => {
    const onFilesChange = vi.fn()
    const file = makeFile('report.pdf', 'application/pdf', 2048)
    render(<FileDropzone files={[file]} onFilesChange={onFilesChange} />)

    const preview = screen.getByText('report.pdf')
    expect(preview).toBeInTheDocument()
    expect(screen.getByText(formatFileSize(file.size))).toBeInTheDocument()
    expect(preview.closest('[data-slot="file-dropzone-preview"]')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'إزالة الملف' }))

    expect(onFilesChange).toHaveBeenCalledTimes(1)
    expect(onFilesChange.mock.calls[0]?.[0]).toEqual([])
  })
})

describe('FileDropzone disabled state', () => {
  it('marks the area aria-disabled and ignores drops', async () => {
    const onFilesChange = vi.fn()
    render(<FileDropzone disabled onFilesChange={onFilesChange} />)

    const area = screen.getByRole('button', { name: /اسحب وأفلت الملف هنا/ })
    expect(area).toHaveAttribute('aria-disabled', 'true')

    dropFiles(area, [makeFile('photo.jpg', 'image/jpeg')])

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onFilesChange).not.toHaveBeenCalled()
  })
})
