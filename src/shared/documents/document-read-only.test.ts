import { describe, expect, it } from 'vitest'

import { documentReadOnlyReasonAr, isDocumentMutable } from '@/shared/documents/document-read-only'

describe('isDocumentMutable', () => {
  it('treats only Draft as mutable — post-Revise Draft is still Draft', () => {
    expect(isDocumentMutable('Draft')).toBe(true)
    expect(isDocumentMutable('Submitted')).toBe(false)
    expect(isDocumentMutable('Rejected')).toBe(false)
    expect(isDocumentMutable('Posted')).toBe(false)
    expect(isDocumentMutable('Reversed')).toBe(false)
    expect(isDocumentMutable('Cancelled')).toBe(false)
    expect(isDocumentMutable(undefined)).toBe(false)
  })
})

describe('documentReadOnlyReasonAr', () => {
  it('explains the read-only window in Arabic per status', () => {
    expect(documentReadOnlyReasonAr('Submitted')).toBe('المستند مُرسل ولا يمكن تعديله')
    expect(documentReadOnlyReasonAr('Rejected')).toBe(
      'المستند مرفوض — استخدم «مراجعة» لإعادة فتح التعديل',
    )
    expect(documentReadOnlyReasonAr('Posted')).toBe('المستند مُرصد وهو غير قابل للتعديل')
    expect(documentReadOnlyReasonAr('Reversed')).toBe('المستند معكوس وهو غير قابل للتعديل')
    expect(documentReadOnlyReasonAr('Cancelled')).toBe('المستند ملغى ولا يمكن تعديله')
  })

  it('is null for a mutable Draft and for a not-yet-loaded status', () => {
    expect(documentReadOnlyReasonAr('Draft')).toBeNull()
    expect(documentReadOnlyReasonAr(undefined)).toBeNull()
  })
})
