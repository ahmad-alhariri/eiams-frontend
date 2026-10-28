import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http } from 'msw'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shared/ui/toaster'
import { errJson, okJson, okPageJson } from '@/test/msw/envelope'
import { createMaterialDomain, createWarehouseCapability, fixtureUuid } from '@/test/msw/factories'
import { server } from '@/test/msw/server'

import { WarehouseCapabilitiesEditor } from './warehouse-capabilities-editor'

const activeScope = vi.hoisted(() => ({ key: { kind: 'enterprise' as const } }))

vi.mock('@/modules/auth/hooks/use-active-scope-context', () => ({
  useActiveScopeContext: () => ({ activeScopeCacheKey: activeScope.key }),
}))

const API_BASE_URL = '/api/v1'
const WAREHOUSE_ID = fixtureUuid(30)

const IT_DOMAIN = createMaterialDomain({
  id: fixtureUuid(20),
  code: 'IT',
  name: 'تقنية المعلومات',
  status: 'Active',
})
const FINANCE_DOMAIN = createMaterialDomain({
  id: fixtureUuid(21),
  code: 'FIN',
  name: 'الشؤون المالية',
  status: 'Active',
})

// Reverse of the int ordinal the add-operation route binds, used by stateful
// mocks so the read (enum NAME strings) can be driven by a POST (int ordinal).
import { CAPABILITY_OPERATION_VALUES } from '@/modules/warehouse/types/warehouse.types'

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function DialogWrapper({ children }: PropsWithChildren) {
    return (
      <>
        <Toaster />
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </>
    )
  }
}

async function openEditor() {
  render(<WarehouseCapabilitiesEditor warehouseId={WAREHOUSE_ID} />, {
    wrapper: createWrapper(),
  })
  fireEvent.click(await screen.findByRole('button', { name: 'إدارة القدرات' }))
  return screen.findByRole('dialog', { name: 'إدارة قدرات المستودع' })
}

/** The editor self-fetches the matrix, so every test must serve the read. */
function serveCapabilities(...capabilities: ReturnType<typeof createWarehouseCapability>[]) {
  server.use(
    http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
      okPageJson(capabilities, { page: 1, pageSize: 100, totalCount: capabilities.length }),
    ),
  )
}

function serveDomains(...domains: ReturnType<typeof createMaterialDomain>[]) {
  server.use(http.get(`${API_BASE_URL}/catalog/domains`, () => okPageJson(domains)))
}

// Toasts render as `[data-slot="toast-root"]`, not `role="alert"`. Counting them
// is how the "exactly one toast" assertions prove a duplicate never shipped.
function toastRoots(): NodeListOf<Element> {
  return document.querySelectorAll('[data-slot="toast-root"]')
}

beforeEach(() => {
  activeScope.key = { kind: 'enterprise' }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('WarehouseCapabilitiesEditor — lvtk.3 acceptance', () => {
  it('renders Arabic labels for all six operations (including Adjustment), no Latin enums', async () => {
    const capability = createWarehouseCapability({
      id: fixtureUuid(40),
      warehouseId: WAREHOUSE_ID,
      materialDomainId: IT_DOMAIN.id,
      materialDomainName: IT_DOMAIN.name,
      materialDomainCode: IT_DOMAIN.code,
      operations: ['Receiving', 'Issue', 'Transfer', 'Count', 'Return', 'Adjustment'],
      status: 'Active',
    })
    serveCapabilities(capability)
    serveDomains(IT_DOMAIN)

    const dialog = await openEditor()

    for (const arabic of ['استلام', 'صرف', 'تحويل', 'جرد', 'إرجاع', 'تسوية']) {
      expect(within(dialog).getByRole('button', { name: arabic })).toBeInTheDocument()
    }
    // Defect 3 (negative control): no raw enum name is user-visible. This
    // fails loudly if a future change renders `{operation}` instead of the map.
    for (const latin of ['Receiving', 'Issue', 'Transfer', 'Count', 'Return', 'Adjustment']) {
      expect(within(dialog).queryByText(latin)).not.toBeInTheDocument()
    }
  })

  it('shows no raw domain GUID and no Latin enum leaked anywhere (defect 5 + 3)', async () => {
    const capability = createWarehouseCapability({
      id: fixtureUuid(42),
      warehouseId: WAREHOUSE_ID,
      materialDomainId: IT_DOMAIN.id,
      materialDomainName: IT_DOMAIN.name,
      materialDomainCode: IT_DOMAIN.code,
      operations: ['Receiving'],
      status: 'Active',
    })
    serveCapabilities(capability)
    serveDomains(IT_DOMAIN)

    const dialog = await openEditor()
    expect(within(dialog).getByText(IT_DOMAIN.name)).toBeInTheDocument()
    expect(within(dialog).queryByText(IT_DOMAIN.id)).not.toBeInTheDocument()
    expect(within(dialog).queryByText(capability.id)).not.toBeInTheDocument()
  })

  it('exposes a Grant affordance with zero capabilities and grants {warehouseId, materialDomainId} (defect 1)', async () => {
    const grantRequests: unknown[] = []
    serveCapabilities()
    serveDomains(IT_DOMAIN, FINANCE_DOMAIN)
    server.use(
      http.post(`${API_BASE_URL}/warehouse-capabilities`, async ({ request }) => {
        grantRequests.push(await request.json())
        return okJson({ id: fixtureUuid(99) }, { status: 201 })
      }),
    )

    const dialog = await openEditor()
    expect(within(dialog).getByText('منح قدرة جديدة')).toBeInTheDocument()
    const grantButton = within(dialog).getByRole('button', { name: 'منح القدرة' })
    expect(grantButton).toBeEnabled()
    fireEvent.click(grantButton)

    await waitFor(() => expect(grantRequests.length).toBe(1))
    expect(grantRequests[0]).toEqual({ warehouseId: WAREHOUSE_ID, materialDomainId: IT_DOMAIN.id })
  })

  it('binds a toggle to optimistic per-row state, not the server prop (defect 2, non-vacuous)', async () => {
    // STATEFUL mock: the read reflects each add, so a committed toggle stays
    // checked after the re-read. A stale/non-optimistic binding cannot pass.
    const granted: string[] = []
    const addBodies: number[] = []
    const capability = createWarehouseCapability({
      id: fixtureUuid(41),
      warehouseId: WAREHOUSE_ID,
      materialDomainId: IT_DOMAIN.id,
      materialDomainName: IT_DOMAIN.name,
      materialDomainCode: IT_DOMAIN.code,
      operations: [],
      status: 'Active',
    })
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () =>
        okPageJson([{ ...capability, operations: [...granted] }], { page: 1, pageSize: 100 }),
      ),
      http.post(
        `${API_BASE_URL}/warehouse-capabilities/${capability.id}/operations`,
        async ({ request }) => {
          const body = (await request.json()) as { operationType: number }
          addBodies.push(body.operationType)
          const name = CAPABILITY_OPERATION_VALUES[body.operationType]
          if (name !== undefined) granted.push(name)
          return okJson({ id: `${capability.id}-op` }, { status: 201 })
        },
      ),
    )
    serveDomains(IT_DOMAIN)

    const dialog = await openEditor()
    const issueButton = within(dialog).getByRole('button', { name: 'صرف' })
    const transferButton = within(dialog).getByRole('button', { name: 'تحويل' })
    expect(issueButton).toHaveAttribute('aria-pressed', 'false')

    // Two toggles on ONE row must both land. The old editor recomputed the
    // baseline from the server prop on the second click and dropped the first.
    fireEvent.click(issueButton)
    // Immediately (before any server round-trip) the optimistic overlay flips
    // the chip. Bound to the server prop this stays 'false' and the test fails.
    expect(issueButton).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(transferButton)

    await waitFor(() => expect(transferButton).toHaveAttribute('aria-pressed', 'true'))
    // Both operations were sent, as distinct int ordinals (Issue=1, Transfer=2).
    expect(addBodies).toEqual([1, 2])
    // And both survive the post-mutation re-read (defect 2 non-vacuity).
    await waitFor(() => expect(issueButton).toHaveAttribute('aria-pressed', 'true'))
    expect(granted.sort()).toEqual(['Issue', 'Transfer'])
  })

  it('adds with an int ordinal and removes with the enum-name string in the path (wire asymmetry)', async () => {
    const removePath = { value: '' }
    const capability = createWarehouseCapability({
      id: fixtureUuid(43),
      warehouseId: WAREHOUSE_ID,
      materialDomainId: IT_DOMAIN.id,
      materialDomainName: IT_DOMAIN.name,
      materialDomainCode: IT_DOMAIN.code,
      operations: ['Adjustment'],
      status: 'Active',
    })
    serveCapabilities(capability)
    serveDomains(IT_DOMAIN)
    server.use(
      http.delete(
        `${API_BASE_URL}/warehouse-capabilities/${capability.id}/operations/Adjustment`,
        ({ request }) => {
          removePath.value = new URL(request.url).pathname
          return new Response(null, { status: 200 })
        },
      ),
    )

    const dialog = await openEditor()
    const adjustmentButton = within(dialog).getByRole('button', { name: 'تسوية' })
    expect(adjustmentButton).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(adjustmentButton)
    await waitFor(() => expect(removePath.value).not.toBe(''))
    // DELETE carries the enum NAME STRING, never the ordinal.
    expect(removePath.value).toMatch(/\/operations\/Adjustment$/)
  })

  it('requires an Arabic confirm before revoking, then revokes once (destructive action)', async () => {
    let revokeCalled = false
    const capability = createWarehouseCapability({
      id: fixtureUuid(44),
      warehouseId: WAREHOUSE_ID,
      materialDomainId: IT_DOMAIN.id,
      materialDomainName: IT_DOMAIN.name,
      materialDomainCode: IT_DOMAIN.code,
      operations: ['Receiving'],
      status: 'Active',
    })
    serveCapabilities(capability)
    serveDomains(IT_DOMAIN)
    server.use(
      http.delete(`${API_BASE_URL}/warehouse-capabilities/${capability.id}`, () => {
        revokeCalled = true
        return new Response(null, { status: 200 })
      }),
    )

    const dialog = await openEditor()
    fireEvent.click(within(dialog).getByRole('button', { name: /إبطال قدرة/ }))
    const alertDialog = await screen.findByRole('alertdialog', { name: 'تأكيد إبطال القدرة' })
    // Cancelling must NOT revoke (negative control for the confirm gate).
    fireEvent.click(within(alertDialog).getByRole('button', { name: 'إلغاء' }))
    expect(revokeCalled).toBe(false)

    fireEvent.click(within(dialog).getByRole('button', { name: /إبطال قدرة/ }))
    const second = await screen.findByRole('alertdialog', { name: 'تأكيد إبطال القدرة' })
    fireEvent.click(within(second).getByRole('button', { name: 'إبطال القدرة' }))
    await waitFor(() => expect(revokeCalled).toBe(true))

    // Exactly ONE success toast (the mutation's), never a duplicate.
    await screen.findByText('تم إبطال القدرة.')
    expect(toastRoots()).toHaveLength(1)
  })

  it('renders a revoked (Inactive) capability as inactive and offers reactivation, not a dead row', async () => {
    const revoked = createWarehouseCapability({
      id: fixtureUuid(45),
      warehouseId: WAREHOUSE_ID,
      materialDomainId: IT_DOMAIN.id,
      materialDomainName: IT_DOMAIN.name,
      materialDomainCode: IT_DOMAIN.code,
      operations: ['Receiving'],
      status: 'Inactive',
    })
    serveCapabilities(revoked)
    serveDomains(IT_DOMAIN)

    const dialog = await openEditor()
    expect(within(dialog).getByText(/غير نشطة/)).toBeInTheDocument()
    // A reactivate affordance exists, and the operation chips are disabled —
    // operations cannot be toggled on an inactive capability.
    expect(within(dialog).getByRole('button', { name: /تنشيط قدرة/ })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'استلام' })).toBeDisabled()
  })

  it('emits exactly one success toast on a successful grant (defect 8)', async () => {
    serveCapabilities()
    serveDomains(IT_DOMAIN)
    server.use(
      http.post(`${API_BASE_URL}/warehouse-capabilities`, () =>
        okJson({ id: fixtureUuid(99) }, { status: 201 }),
      ),
    )

    const dialog = await openEditor()
    fireEvent.click(within(dialog).getByRole('button', { name: 'منح القدرة' }))

    await screen.findByText('تم منح القدرة للمستودع.')
    // Non-vacuous: the pre-rebuild editor toasted a SECOND success here, so a
    // regression re-introducing that shows up as two toasts and fails.
    expect(toastRoots()).toHaveLength(1)
    // And the removed editor-side duplicate copy never reappears.
    expect(screen.queryByText('تم منح القدرة.')).not.toBeInTheDocument()
  })

  it('surfaces a 409 ALREADY_GRANTED with the approved Arabic reason, once', async () => {
    serveCapabilities()
    serveDomains(IT_DOMAIN)
    server.use(
      http.post(`${API_BASE_URL}/warehouse-capabilities`, () =>
        errJson(409, {
          code: 'WAREHOUSE_CAPABILITIES_ALREADY_GRANTED',
          message: 'The warehouse already has this material domain granted and active.',
        }),
      ),
    )

    const dialog = await openEditor()
    fireEvent.click(within(dialog).getByRole('button', { name: 'منح القدرة' }))

    // The Arabic is resolved by CODE from error-copy-ar, not from the wire
    // (the wire message is English). This exact string pins that mapping.
    // Base UI echoes the toast text into a screen-reader live region, so the
    // string appears more than once — `findAllByText` tolerates that while
    // `toastRoots()` still proves there is exactly ONE toast.
    expect(
      (await screen.findAllByText('هذه القدرة ممنوحة مسبقًا لهذا المستودع.')).length,
    ).toBeGreaterThan(0)
    expect(toastRoots()).toHaveLength(1)
  })

  it('renders a 400 rejection’s Arabic reason exactly once (no double surface)', async () => {
    serveCapabilities()
    serveDomains(IT_DOMAIN)
    server.use(
      http.post(`${API_BASE_URL}/warehouse-capabilities`, () =>
        errJson(400, {
          code: 'WAREHOUSE_CAPABILITIES_MATERIAL_DOMAIN_INACTIVE',
          message: 'The material domain is inactive and cannot be granted to a warehouse.',
        }),
      ),
    )

    const dialog = await openEditor()
    fireEvent.click(within(dialog).getByRole('button', { name: 'منح القدرة' }))

    expect(
      (await screen.findAllByText('لا يمكن منح مجال مواد غير نشط لهذا المستودع.')).length,
    ).toBeGreaterThan(0)
    expect(toastRoots()).toHaveLength(1)
  })

  it('keeps a FAILED capabilities read distinguishable from an EMPTY one (secondary read)', async () => {
    // STATEFUL mock: the matrix read fails once, then answers. A failed read
    // gets its own Arabic surface + retry and the grant stays closed — it must
    // never render as "no capability is granted yet".
    const capability = createWarehouseCapability({
      id: fixtureUuid(50),
      warehouseId: WAREHOUSE_ID,
      materialDomainId: IT_DOMAIN.id,
      materialDomainName: IT_DOMAIN.name,
      materialDomainCode: IT_DOMAIN.code,
      operations: ['Transfer'],
      status: 'Active',
    })
    let capabilityAttempts = 0
    server.use(
      http.get(`${API_BASE_URL}/warehouses/${WAREHOUSE_ID}/capabilities`, () => {
        capabilityAttempts += 1
        return capabilityAttempts === 1
          ? errJson(500)
          : okPageJson([capability], { page: 1, pageSize: 100, totalCount: 1 })
      }),
    )
    serveDomains(IT_DOMAIN)

    const dialog = await openEditor()

    expect(
      await within(dialog).findByRole('heading', { name: 'تعذّر تحميل قدرات المستودع' }),
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText('لا توجد قدرات ممنوحة بعد. استخدم النموذج أعلاه لمنح أول قدرة.'),
    ).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'منح القدرة' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(capabilityAttempts).toBe(2))
    expect(await within(dialog).findByText(IT_DOMAIN.name)).toBeInTheDocument()
    expect(
      within(dialog).queryByRole('heading', { name: 'تعذّر تحميل قدرات المستودع' }),
    ).not.toBeInTheDocument()
  })

  it('keeps a FAILED domains read distinguishable from an EMPTY one and retries it', async () => {
    // Same contract for the SECONDARY read: the domain catalogue failing once
    // gets its own Arabic surface; after the retry the grant opens with the
    // first still-ungranted domain preselected.
    serveCapabilities()
    let domainsAttempts = 0
    server.use(
      http.get(`${API_BASE_URL}/catalog/domains`, () => {
        domainsAttempts += 1
        return domainsAttempts === 1 ? errJson(500) : okPageJson([IT_DOMAIN])
      }),
    )

    const dialog = await openEditor()

    expect(
      await within(dialog).findByRole('heading', { name: 'تعذّر تحميل مجالات المواد' }),
    ).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'منح القدرة' })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'إعادة المحاولة' }))

    await waitFor(() => expect(domainsAttempts).toBe(2))
    expect(
      within(dialog).queryByRole('heading', { name: 'تعذّر تحميل مجالات المواد' }),
    ).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'منح القدرة' })).toBeEnabled()
  })

  it('shows NO error surface for a SUCCESSFUL EMPTY read (empty is not failed)', async () => {
    // The THIRD state, and the one a failed read must not be confused with:
    // the server answered, and the answer is "nothing granted" / "no domain
    // to grant". It renders the EMPTY copy and the productive grant form — no
    // Arabic error surface, no retry button, no spinner. Without this case a
    // failed read that renders as the empty state would pass the two failed
    // cases only by accident.
    serveCapabilities()
    serveDomains()

    const dialog = await openEditor()

    // The capabilities surface reads as EMPTY (answered), not as FAILED.
    expect(
      await within(dialog).findByText(
        'لا توجد قدرات ممنوحة بعد. استخدم النموذج أعلاه لمنح أول قدرة.',
      ),
    ).toBeInTheDocument()
    // The domains surface reads as EMPTY (answered), not as FAILED.
    expect(within(dialog).getByText('كل مجالات المواد المفعّلة ممنوحة بالفعل.')).toBeInTheDocument()
    // Neither surface shows its failure copy, its retry, or its spinner.
    expect(
      within(dialog).queryByRole('heading', { name: 'تعذّر تحميل قدرات المستودع' }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole('heading', { name: 'تعذّر تحميل مجالات المواد' }),
    ).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'إعادة المحاولة' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('جارٍ تحميل القدرات...')).not.toBeInTheDocument()
    // And with no domain left to grant, the grant action is closed for the
    // right reason (nothing to pick) rather than because a read failed.
    expect(within(dialog).getByRole('button', { name: 'منح القدرة' })).toBeDisabled()
  })
})
