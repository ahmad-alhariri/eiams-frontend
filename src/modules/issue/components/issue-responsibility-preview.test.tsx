import { QueryClientProvider } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen } from '@testing-library/react'
import type { Resolver } from 'react-hook-form'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'

import {
  issuePetalFormSchema,
  type IssuePetalFormValues,
} from '@/modules/issue/components/issue-recipient-section'
import { IssueResponsibilityPreview } from '@/modules/issue/components/issue-responsibility-preview'
import { createQueryClient } from '@/shared/services/query.client'

function createWrapperWith(recipientType: string, displayName: string) {
  const client = createQueryClient()
  function Wrapper() {
    const form = useForm<IssuePetalFormValues>({
      resolver: zodResolver(issuePetalFormSchema) as Resolver<IssuePetalFormValues>,
      defaultValues: {
        petal: {
          // The preview is read-only and the harness seeds a valid petal
          // directly (empty recipientId is fine — nothing submits here).
          issueTo: {
            recipientType,
            recipientId: '11111111-1111-4111-8111-111111111111',
            issueReason: 'تجهيز مكتب إدارة التقنية',
          } as unknown as IssuePetalFormValues['petal']['issueTo'],
          issueToDisplayName: displayName,
        },
      },
    })
    return (
      <QueryClientProvider client={client}>
        <FormProvider {...form}>
          <IssueResponsibilityPreview />
        </FormProvider>
      </QueryClientProvider>
    )
  }
  return Wrapper
}

describe('IssueResponsibilityPreview', () => {
  it('renders nothing before a recipient type is chosen', () => {
    const Wrapper = createWrapperWith('', 'أحمد محمد')
    render(<Wrapper />)
    expect(document.querySelector('[data-slot="issue-responsibility-preview"]')).toBeNull()
  })

  it('previews personal custody for an Employee recipient with the holder name', () => {
    const Wrapper = createWrapperWith('Employee', 'أحمد محمد')
    render(<Wrapper />)
    const node = screen.getByText(/حفظ شخصي/)
    expect(node).toBeInTheDocument()
    expect(node).toHaveTextContent('أحمد محمد')
  })

  it('previews operational custody for an OrganizationalUnit recipient', () => {
    const Wrapper = createWrapperWith('OrganizationalUnit', 'مديرية المعلوماتية')
    render(<Wrapper />)
    expect(screen.getByText(/المسؤولية التشغيلية/)).toBeInTheDocument()
    expect(screen.getByText(/مديرية المعلوماتية/)).toBeInTheDocument()
  })
})
