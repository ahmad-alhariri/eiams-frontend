import type {
  ActionAvailability,
  DocumentActionType,
  DocumentAttachment,
  DocumentLine,
  DocumentPolicy,
  DocumentStatus,
  Material,
  NamedReference,
  PolicyBlocker,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'

/**
 * Fixture builders for the document-detail gallery demo, and nothing else.
 *
 * Why the gallery builds its own
 * ------------------------------
 * This used to import `createWarehouseDocument` & friends from
 * `@/test/msw/factories`. `src/test/**` is TEST SUPPORT — inline MSW handlers,
 * factories, the lifecycle engine — and a file under `src/app/` importing it is
 * the inverted dependency EPIC G7 exists to close: it points production-shaped
 * code at a tree that only runs under Vitest, and
 * `src/test/no-runtime-test-imports.test.ts` fails the build over it.
 * `factories.ts` said as much in its own header: it exists "for MSW TESTS".
 *
 * The fixture layer itself now lives outside the test tree
 * (`@/shared/fixtures/factories`), so a shared import would technically satisfy
 * the letter of that rule. It is still the wrong dependency here: the component
 * gallery is a dev-only showcase of read-only rendering, it must render when
 * there is no backend and no mock API, and bead `eiams-frontend-vi65.14.6`
 * deletes the mock layer wholesale. Six small pure functions — copied verbatim
 * from the factory so the rendered output is unchanged — cost far less coupling
 * than a live dependency on the harness that is being dismantled.
 *
 * What is deliberately NOT copied: the ~1200-line factory module. Only the six
 * builders the three demo documents need, plus the helpers they transitively
 * require (`withOverrides` / `mergeDeep`, a `NamedReference`, a `Material`, and
 * the status→action-availability table the policy needs).
 *
 * Rendered output is unchanged: same defaults, same Arabic copy, same
 * `fixtureUuid(n)` sequences as before the split. If the demo output ever
 * changes, change these bodies with it — the demo is the only consumer.
 */

/** Recursive override type: see `@/shared/fixtures/factories` for the contract. */
type FixtureOverrides<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K] | undefined
    : T[K] extends object
      ? T[K] | FixtureOverrides<T[K]> | undefined
      : T[K] | undefined
}

const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z'

/** Returns a deterministic, syntactically valid UUID for readable demo data. */
export function fixtureUuid(sequence = 1): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`
}

function withOverrides<T extends object>(defaults: T, overrides: FixtureOverrides<T>): T {
  return { ...defaults, ...overrides }
}

/**
 * Recursive merge for the builders that spawn nested entities (document
 * policy, lines, actor snapshots, ...): arrays replace wholesale and an
 * explicit `undefined` clears an optional field, mirroring spread semantics.
 */
function mergeDeep<T extends object>(defaults: T, overrides: FixtureOverrides<T>): T {
  const merged: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
  for (const [key, value] of Object.entries(overrides)) {
    const baseValue = (defaults as Record<string, unknown>)[key]
    if (isMergeableObject(baseValue) && isMergeableObject(value)) {
      merged[key] = mergeDeep(baseValue as unknown as T, value as unknown as Partial<T>)
    } else {
      merged[key] = value
    }
  }
  return merged as T
}

function isMergeableObject(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function createNamedReference(overrides: FixtureOverrides<NamedReference> = {}): NamedReference {
  return withOverrides(
    { id: fixtureUuid(1), displayName: 'مرجع تجريبي', code: 'REF-001' },
    overrides,
  )
}

function createMaterial(overrides: FixtureOverrides<Material> = {}): Material {
  return withOverrides(
    {
      materialId: fixtureUuid(24),
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      descriptionAr: 'مادة تجريبية',
      baseUnit: createNamedReference({ id: fixtureUuid(23), displayName: 'قطعة', code: 'EA' }),
      category: createNamedReference({ id: fixtureUuid(21), displayName: 'الأجهزة' }),
      domain: createNamedReference({ id: fixtureUuid(20), displayName: 'تقنية المعلومات' }),
      family: createNamedReference({ id: fixtureUuid(22), displayName: 'الحواسيب' }),
      materialKind: 'Consumable',
      requiresAssetNumber: false,
      trackingType: 'Quantity',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

function createActionAvailability(
  actionType: DocumentActionType,
  overrides: FixtureOverrides<ActionAvailability> = {},
): ActionAvailability {
  return withOverrides(
    {
      action: actionType,
      allowed: true,
      confirmationRequired: false,
      presentation: 'Enabled',
      reasonAr: null,
      reasonCode: null,
      reasonRequired: false,
    },
    overrides,
  )
}

/** Lengthy default policy: every action is available so a bare call never blocks. */
const LENIENT_ACTIONS: readonly ActionAvailability[] = [
  createActionAvailability('Edit'),
  createActionAvailability('Submit'),
  createActionAvailability('Post'),
  createActionAvailability('Reject'),
  createActionAvailability('Revise'),
  createActionAvailability('Cancel'),
  createActionAvailability('Reverse'),
  createActionAvailability('UploadAttachment'),
  createActionAvailability('DeleteAttachment'),
]

/** Status-aware action availability: only transitions the lifecycle actually permits. */
function actionsForDocumentStatus(status: DocumentStatus): ActionAvailability[] {
  switch (status) {
    case 'Draft':
      return [
        createActionAvailability('Edit'),
        createActionAvailability('Submit'),
        createActionAvailability('Cancel', { confirmationRequired: true, reasonRequired: true }),
        createActionAvailability('UploadAttachment'),
        createActionAvailability('DeleteAttachment'),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'يجب إرسال المستند أولاً قبل رصده.',
          reasonCode: 'document.not_submitted',
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'لا يمكن عكس مستند غير مُرصد.',
          reasonCode: 'document.not_posted',
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Submitted':
      return [
        createActionAvailability('Post'),
        createActionAvailability('Reject', { confirmationRequired: true, reasonRequired: true }),
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مُرسل ولا يمكن تعديله.',
          reasonCode: 'document.submitted',
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مُرسل بالفعل.',
          reasonCode: 'document.submitted',
        }),
        createActionAvailability('Cancel', {
          confirmationRequired: true,
          reasonRequired: true,
        }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'لا يمكن عكس مستند غير مُرصد.',
          reasonCode: 'document.not_posted',
        }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Posted':
      return [
        createActionAvailability('Reverse', { confirmationRequired: true, reasonRequired: true }),
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مُرصد ولا يمكن تعديله.',
          reasonCode: 'document.posted',
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مُرصد بالفعل.',
          reasonCode: 'document.posted',
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مُرصد بالفعل.',
          reasonCode: 'document.posted',
        }),
        createActionAvailability('Cancel', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مُرصد ولا يمكن إلغاؤه.',
          reasonCode: 'document.posted',
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Reversed':
      return [
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند معكوس.',
          reasonCode: 'document.reversed',
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند معكوس.',
          reasonCode: 'document.reversed',
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند معكوس.',
          reasonCode: 'document.reversed',
        }),
        createActionAvailability('Cancel', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند معكوس.',
          reasonCode: 'document.reversed',
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند معكوس بالفعل.',
          reasonCode: 'document.reversed',
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Cancelled':
      return [
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند ملغي.',
          reasonCode: 'document.cancelled',
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند ملغي.',
          reasonCode: 'document.cancelled',
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند ملغي.',
          reasonCode: 'document.cancelled',
        }),
        createActionAvailability('Cancel', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند ملغي بالفعل.',
          reasonCode: 'document.cancelled',
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند ملغي.',
          reasonCode: 'document.cancelled',
        }),
        createActionAvailability('Reject', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('Revise', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
    case 'Rejected':
      return [
        createActionAvailability('Revise'),
        createActionAvailability('Cancel', {
          confirmationRequired: true,
          reasonRequired: true,
        }),
        createActionAvailability('Edit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'أعد المستند إلى مسودة قبل تعديله.',
          reasonCode: 'document.rejected',
        }),
        createActionAvailability('Submit', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'أعد المستند إلى مسودة قبل إعادة الإرسال.',
          reasonCode: 'document.rejected',
        }),
        createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مرفوض.',
          reasonCode: 'document.rejected',
        }),
        createActionAvailability('Reverse', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'لا يمكن عكس مستند مرفوض.',
          reasonCode: 'document.rejected',
        }),
        createActionAvailability('Reject', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'المستند مرفوض بالفعل.',
          reasonCode: 'document.rejected',
        }),
        createActionAvailability('UploadAttachment', { allowed: false, presentation: 'Hidden' }),
        createActionAvailability('DeleteAttachment', { allowed: false, presentation: 'Hidden' }),
      ]
  }
}

/** D-ATT-01 refinement of the status map for the server-owned signed-original gate. */
function actionsForDocumentPolicy(
  status: DocumentStatus,
  signedOriginalSatisfied: boolean,
): ActionAvailability[] {
  const actions = actionsForDocumentStatus(status)
  if (status !== 'Submitted' || signedOriginalSatisfied) return actions

  return actions.map((availability) =>
    availability.action === 'Post'
      ? createActionAvailability('Post', {
          allowed: false,
          presentation: 'Disabled',
          reasonAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.',
          reasonCode: 'document.signed_original_missing',
        })
      : availability,
  )
}

export function createPolicyBlocker(
  overrides: FixtureOverrides<PolicyBlocker> = {},
): PolicyBlocker {
  return withOverrides(
    {
      code: 'document.signed_original_missing',
      field: 'attachmentType',
      messageAr: 'يجب إرفاق النسخة الموقعة من المستند قبل الرصد.',
    },
    overrides,
  )
}

export function createDocumentPolicy(
  overrides: FixtureOverrides<DocumentPolicy> = {},
): DocumentPolicy {
  const documentStatus = overrides.documentStatus ?? 'Draft'
  const signedOriginalSatisfied = overrides.signedOriginalSatisfied ?? false
  const actions =
    overrides.actions ??
    (overrides.documentStatus === undefined
      ? LENIENT_ACTIONS
      : actionsForDocumentPolicy(documentStatus, signedOriginalSatisfied))
  const blockers =
    overrides.blockers ??
    (documentStatus === 'Submitted' && !signedOriginalSatisfied ? [createPolicyBlocker()] : [])
  return withOverrides(
    {
      actions,
      advisories: [],
      blockers,
      documentId: fixtureUuid(200),
      documentStatus,
      evaluatedAt: FIXTURE_TIMESTAMP,
      policyKind: 'Generic',
      rowVersion: 1,
      signedOriginalSatisfied,
    },
    overrides,
  )
}

export function createDocumentAttachment(
  overrides: FixtureOverrides<DocumentAttachment> = {},
): DocumentAttachment {
  return mergeDeep(
    {
      attachmentId: fixtureUuid(202),
      attachmentType: 'SignedOriginal',
      checksum: 'sha256:fixture-checksum',
      documentId: fixtureUuid(200),
      downloadUrl: null,
      fileSize: 2048,
      mimeType: 'application/pdf',
      originalFilename: 'document-original.pdf',
      uploadedAt: FIXTURE_TIMESTAMP,
      uploadedBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مستخدم تجريبي' }),
    },
    overrides,
  )
}

export function createWarehouseDocumentLine(
  overrides: FixtureOverrides<DocumentLine> = {},
): DocumentLine {
  const material = createMaterial()
  return mergeDeep(
    {
      availableBalance: null,
      baseQuantity: overrides.quantity ?? 5,
      conversionFactor: '1.000000',
      conversionId: null,
      lineId: fixtureUuid(201),
      lineType: 'Normal',
      material,
      quantity: 5,
      unit: material.baseUnit,
      unitPrice: null,
    },
    overrides,
  )
}

export function createWarehouseDocument(
  overrides: FixtureOverrides<WarehouseDocument> = {},
): WarehouseDocument {
  const documentId = overrides.documentId ?? fixtureUuid(200)
  const documentStatus = overrides.documentStatus ?? 'Draft'
  const rowVersion = overrides.rowVersion ?? 1
  const defaults: WarehouseDocument = {
    attachments: [],
    createdAt: FIXTURE_TIMESTAMP,
    createdBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مستخدم تجريبي' }),
    documentId,
    documentStatus,
    documentType: 'Receiving',
    lines: [createWarehouseDocumentLine({ lineId: fixtureUuid(201) })],
    paperDocumentNumber: '2024/123',
    paperDocumentYear: 2024,
    policy: createDocumentPolicy({
      documentId,
      documentStatus,
      rowVersion,
    }),
    postedAt: null,
    receivingInfo: {
      receivingType: 'Purchase',
      supplierInvoiceRef: 'INV-2024-001',
      supplierRef: 'SUP-001',
    },
    rowVersion,
    site: createNamedReference({ id: fixtureUuid(31), displayName: 'المقر الرئيسي' }),
    systemReferenceNumber: 'EIAMS-DOC-2024-0001',
    warehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
  }
  return mergeDeep(defaults, overrides)
}
