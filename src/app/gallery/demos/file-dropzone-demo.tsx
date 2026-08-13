import { useState } from 'react'

import { FileDropzone } from '@/shared/feedback/file-dropzone'
import { formatFileSize } from '@/shared/utils/format'

export function FileDropzoneDemo() {
  const [signedOriginal, setSignedOriginal] = useState<File[]>([])
  const [supporting, setSupporting] = useState<File[]>([])

  const signed = signedOriginal[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <label
          htmlFor="file-dropzone-signed"
          className="mb-2 block text-base font-medium text-foreground"
        >
          النسخة الأصلية الموقعة
        </label>
        <FileDropzone
          inputId="file-dropzone-signed"
          files={signedOriginal}
          onFilesChange={setSignedOriginal}
          maxFiles={1}
        />
        {signed ? (
          <p className="mt-2 text-sm text-muted-foreground">
            المختار: {signed.name} — {formatFileSize(signed.size)}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="file-dropzone-supporting"
          className="mb-2 block text-base font-medium text-foreground"
        >
          ملفات داعمة (متعددة)
        </label>
        <FileDropzone
          inputId="file-dropzone-supporting"
          files={supporting}
          onFilesChange={setSupporting}
          maxFiles={5}
        />
        {supporting.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
            {supporting.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                {file.name} — {formatFileSize(file.size)}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
