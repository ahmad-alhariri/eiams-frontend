import { describe, expect, it } from 'vitest'

import { issueResponsibilityPreview } from './responsibility-preview.model'

describe('issueResponsibilityPreview', () => {
  it('maps Employee to Personal custody with the holder name', () => {
    const preview = issueResponsibilityPreview('Employee', 'أحمد محمد')
    expect(preview.custodyKind).toBe('Personal')
    expect(preview.messageAr).toContain('حفظ شخصي')
    expect(preview.messageAr).toContain('أحمد محمد')
  })

  it('maps OrganizationalUnit and Site to Operational custody pending assignment', () => {
    for (const recipientType of ['OrganizationalUnit', 'Site']) {
      const preview = issueResponsibilityPreview(recipientType, 'مديرية المعلوماتية')
      expect(preview.custodyKind).toBe('Operational')
      expect(preview.messageAr).toContain('المسؤولية التشغيلية')
    }
  })

  it('maps External to Operational custody', () => {
    const preview = issueResponsibilityPreview('External', 'مؤسسة الشام')
    expect(preview.custodyKind).toBe('Operational')
    expect(preview.messageAr).toContain('مؤسسة الشام')
  })

  it('falls back to the recipient-type label when no display name is captured yet', () => {
    const preview = issueResponsibilityPreview('Employee', '')
    expect(preview.custodyKind).toBe('Personal')
    expect(preview.messageAr).toContain('موظف')
  })

  it('renders nothing before a recipient type is chosen or for unknown values', () => {
    expect(issueResponsibilityPreview('', 'أحمد')).toEqual({
      custodyKind: null,
      messageAr: null,
    })
    expect(issueResponsibilityPreview('LegacyType', 'أحمد')).toEqual({
      custodyKind: null,
      messageAr: null,
    })
  })
})
