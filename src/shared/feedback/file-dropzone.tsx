import { IconFileText, IconUpload, IconX } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useDropzone } from 'react-dropzone'

import { cn } from '@/shared/utils/class-names'
import { formatFileSize } from '@/shared/utils/format'

/** MIME → extension map for the native picker accept filter. */
// eslint-disable-next-line react-refresh/only-export-components
export const DROPZONE_ACCEPT: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
}

/**
 * UI mirror of the D-ATT-01 attachment transport contract; the authoritative
 * rejection is the server response (413/415/422), never this constant.
 */
export const DROPZONE_MAX_SIZE_BYTES = 5 * 1024 * 1024

/**
 * Preview object URLs keyed by File identity. Kept outside component state so
 * the renderer can resolve thumbnails without effects or refs; entries are
 * revoked when a file leaves a dropzone or the dropzone unmounts.
 */
const previewUrlsByFile = new Map<File, string>()

function objectUrlFor(file: File) {
  if (!file.type.startsWith('image/')) return undefined
  const cached = previewUrlsByFile.get(file)
  if (cached) return cached
  const url = URL.createObjectURL(file)
  previewUrlsByFile.set(file, url)
  return url
}

export type FileDropzoneProps = {
  /** Selected files; the calling feature owns the transient upload state. */
  files?: File[]
  /** Emits the next file list; invoked only for accepted files. */
  onFilesChange?: (files: File[]) => void
  /** Maximum selectable files; values > 1 enable `multiple` selection. */
  maxFiles?: number
  /** MIME → extension map for the native picker accept filter. */
  accept?: Record<string, string[]>
  /** UX-only size gate; server 413/415/422 is authoritative (D-ATT-01). */
  maxSizeBytes?: number
  /** Disables the picker, keyboard activation, and drops. */
  disabled?: boolean
  /** Forwarded to the hidden file input for `<label htmlFor>` association. */
  inputId?: string
  className?: string
}

function rejectionMessage(code: string, maxSizeBytes: number) {
  switch (code) {
    case 'file-invalid-type':
      return 'نوع الملف غير مدعوم — يُقبل JPG و PNG و PDF فقط'
    case 'file-too-large':
      return `حجم الملف يتجاوز الحد المسموح (${formatFileSize(maxSizeBytes)})`
    case 'too-many-files':
      return 'تجاوز العدد المسموح من الملفات'
    default:
      return 'تعذر رفع الملف'
  }
}

function FileDropzone({
  accept = DROPZONE_ACCEPT,
  className,
  disabled = false,
  files,
  inputId,
  maxFiles = 1,
  maxSizeBytes = DROPZONE_MAX_SIZE_BYTES,
  onFilesChange,
}: FileDropzoneProps) {
  const [error, setError] = useState<string | null>(null)

  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept,
    disabled,
    maxFiles,
    maxSize: maxSizeBytes,
    multiple: maxFiles !== 1,
    onDrop: (accepted, fileRejections) => {
      const next = [...(files ?? []), ...accepted].slice(0, maxFiles)
      onFilesChange?.(next)
      setError(
        fileRejections.length > 0
          ? rejectionMessage(fileRejections[0]?.errors[0]?.code ?? '', maxSizeBytes)
          : null,
      )
    },
  })

  useEffect(() => {
    const displayed = new Set(files ?? [])
    for (const [file, url] of previewUrlsByFile) {
      if (!displayed.has(file)) {
        URL.revokeObjectURL(url)
        previewUrlsByFile.delete(file)
      }
    }
  }, [files])

  useEffect(() => {
    const owned = new Set(files ?? [])
    return () => {
      for (const [file, url] of previewUrlsByFile) {
        if (owned.has(file)) {
          URL.revokeObjectURL(url)
          previewUrlsByFile.delete(file)
        }
      }
    }
  }, [files])

  return (
    <div className={className}>
      <div
        {...getRootProps({
          role: 'button',
          className: cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-input bg-ivory p-8 text-center outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            isDragActive && 'border-ring',
            error && 'border-destructive',
            disabled && 'pointer-events-none opacity-50',
          ),
          'data-slot': 'file-dropzone',
        })}
      >
        <input {...getInputProps({ id: inputId, disabled: disabled || undefined })} />
        <IconUpload className="size-12 text-golden-wheat" aria-hidden />
        <p className="mt-2 text-base text-foreground">اسحب وأفلت الملف هنا أو انقر للاختيار</p>
        <p className="mt-1 text-xs text-muted-foreground">
          يدعم JPG و PNG و PDF — حتى {formatFileSize(maxSizeBytes)}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          data-slot="file-dropzone-error"
          className="mt-2 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}

      {files && files.length > 0 ? (
        <ul data-slot="file-dropzone-preview" className="mt-3 flex flex-col gap-2">
          {files.map((file, index) => {
            const previewUrl = objectUrlFor(file)
            return (
              <li key={`${file.name}-${index}`} className="flex items-center gap-3 py-1">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    className="size-10 shrink-0 rounded-md border border-border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-ivory"
                  >
                    <IconFileText className="size-5 text-stone" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  aria-label="إزالة الملف"
                  onClick={() => onFilesChange?.(files.filter((f) => f !== file))}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-stone transition-colors outline-none hover:bg-ivory hover:text-charcoal focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <IconX className="size-4" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export { FileDropzone }
