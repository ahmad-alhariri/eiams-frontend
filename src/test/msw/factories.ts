import type {
  ActionAvailability,
  Asset,
  AssetCustody,
  AuditLog,
  AuditLogEntry,
  AuthTokenResponse,
  DocumentActionResult,
  DocumentActionType,
  DocumentAttachment,
  DocumentLifecycleEvent,
  DocumentLine,
  DocumentPolicy,
  DocumentStatus,
  Employee,
  ExternalParty,
  EffectiveRole,
  FieldError,
  InventoryBalance,
  LifecycleActorSnapshot,
  LifecycleEventType,
  Material,
  MaterialCategory,
  MaterialDomain,
  MaterialFamily,
  MaterialUnitConversion,
  NamedReference,
  OperationalAdvisory,
  PageMeta,
  PolicyBlocker,
  ProblemDetails,
  Permission,
  Role,
  ScopeContext,
  SessionResponse,
  Site,
  StockMovement,
  OrganizationalUnit,
  UnitOfMeasure,
  UserSummary,
  UserRoleScope,
  Warehouse,
  WarehouseCapability,
  WarehouseDocument,
  WarehouseMaterialSetting,
} from '@/shared/types/generated/eiams-v1'

/** Contract-backed fixture helpers for MSW tests.
 *
 * Keep factories here, instead of inside feature tests, so every mock payload
 * is checked against the generated OpenAPI surface. Factories deliberately
 * produce ordinary data only; endpoint-specific handlers remain owned by the
 * feature that exercises the endpoint.
 */
/**
 * Recursive override type: a full `T[K]` value (spread semantics), an explicit
 * `undefined` (clear an optional field), or — for plain objects only — a
 * partial nested override merged by `mergeDeep`. Arrays and non-object values
 * are always replaced wholesale.
 */
export type FixtureOverrides<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K] | undefined
    : T[K] extends object
      ? T[K] | FixtureOverrides<T[K]> | undefined
      : T[K] | undefined
}

const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z'

/** Returns a deterministic, syntactically valid UUID for readable test data. */
export function fixtureUuid(sequence = 1): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`
}

function withOverrides<T extends object>(defaults: T, overrides: FixtureOverrides<T>): T {
  return { ...defaults, ...overrides }
}

/**
 * Recursive merge used by factories that spawn nested entities (document
 * policy, lines, actor snapshots, ...). Callers keep overriding one nested
 * field without re-supplying the whole subtree; arrays replace wholesale and
 * an explicit `undefined` clears an optional field, mirroring spread
 * semantics.
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

export function createNamedReference(
  overrides: FixtureOverrides<NamedReference> = {},
): NamedReference {
  return withOverrides(
    { id: fixtureUuid(1), displayName: 'مرجع تجريبي', code: 'REF-001', status: 'Active' },
    overrides,
  )
}

export function createPageMeta(overrides: FixtureOverrides<PageMeta> = {}): PageMeta {
  return withOverrides({ pageIndex: 1, pageSize: 20, totalItems: 0, totalPages: 0 }, overrides)
}

export function createFieldError(overrides: FixtureOverrides<FieldError> = {}): FieldError {
  return withOverrides(
    { field: 'nameAr', code: 'validation.required', messageAr: 'هذا الحقل مطلوب.' },
    overrides,
  )
}

export function createProblemDetails(
  overrides: FixtureOverrides<ProblemDetails> = {},
): ProblemDetails {
  return withOverrides(
    {
      code: 'validation.failed',
      detailAr: 'تعذر التحقق من البيانات المدخلة.',
      fieldErrors: [],
      status: 422,
      titleAr: 'تعذر إتمام الطلب',
      traceId: 'fixture-trace-id',
      type: 'https://eiams.example/problems/validation.failed',
    },
    overrides,
  )
}

export function createUserSummary(overrides: FixtureOverrides<UserSummary> = {}): UserSummary {
  return withOverrides(
    {
      userId: fixtureUuid(10),
      username: 'fixture.user',
      displayName: 'مستخدم تجريبي',
      status: 'Active',
      rowVersion: 1,
    },
    overrides,
  )
}

export function createPermission(overrides: FixtureOverrides<Permission> = {}): Permission {
  return withOverrides(
    {
      permissionId: fixtureUuid(13),
      code: 'admin.user.view',
      nameAr: 'عرض المستخدمين',
      descriptionAr: 'عرض دليل حسابات المستخدمين.',
    },
    overrides,
  )
}

export function createRole(overrides: FixtureOverrides<Role> = {}): Role {
  return withOverrides(
    {
      roleId: fixtureUuid(14),
      code: 'SYSTEM_ADMIN',
      nameAr: 'مدير النظام',
      permissionCodes: ['admin.user.view', 'admin.user.manage'],
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createUserRoleScope(
  overrides: FixtureOverrides<UserRoleScope> = {},
): UserRoleScope {
  return withOverrides(
    {
      userRoleScopeId: fixtureUuid(15),
      userId: fixtureUuid(10),
      role: createRole(),
      scope: createScopeContext({
        scopeType: 'Enterprise',
        scopeId: null,
        displayName: 'الهيئة العامة للرقابة والتفتيش',
      }),
    },
    overrides,
  )
}

export function createEffectiveRole(
  overrides: FixtureOverrides<EffectiveRole> = {},
): EffectiveRole {
  return withOverrides(
    { roleId: fixtureUuid(11), code: 'WH_KEEPER', nameAr: 'أمين المستودع' },
    overrides,
  )
}

export function createScopeContext(overrides: FixtureOverrides<ScopeContext> = {}): ScopeContext {
  return withOverrides(
    { scopeType: 'Warehouse', scopeId: fixtureUuid(12), displayName: 'المستودع المركزي' },
    overrides,
  )
}

export function createSession(overrides: FixtureOverrides<SessionResponse> = {}): SessionResponse {
  const activeScope = createScopeContext()
  return withOverrides(
    {
      user: createUserSummary(),
      permissionCodes: ['document.view'],
      availableScopes: [activeScope],
      activeScope,
      scopeState: 'Selected',
      activeRoles: [createEffectiveRole()],
    },
    overrides,
  )
}

export function createAuthTokenResponse(
  overrides: FixtureOverrides<AuthTokenResponse> = {},
): AuthTokenResponse {
  return withOverrides(
    {
      accessToken: 'fixture-access-token',
      expiresInSeconds: 900,
      session: createSession(),
      tokenType: 'Bearer',
    },
    overrides,
  )
}

export function createMaterialDomain(
  overrides: FixtureOverrides<MaterialDomain> = {},
): MaterialDomain {
  return withOverrides(
    {
      domainId: fixtureUuid(20),
      code: 'IT',
      nameAr: 'تقنية المعلومات',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createMaterialCategory(
  overrides: FixtureOverrides<MaterialCategory> = {},
): MaterialCategory {
  return withOverrides(
    {
      categoryId: fixtureUuid(21),
      code: 'IT-HW',
      domain: createNamedReference({ id: fixtureUuid(20), displayName: 'تقنية المعلومات' }),
      nameAr: 'الأجهزة',
      pathDisplay: 'تقنية المعلومات / الأجهزة',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createMaterialFamily(
  overrides: FixtureOverrides<MaterialFamily> = {},
): MaterialFamily {
  return withOverrides(
    {
      familyId: fixtureUuid(22),
      code: 'IT-HW-PC',
      domain: createNamedReference({ id: fixtureUuid(20), displayName: 'تقنية المعلومات' }),
      category: createNamedReference({ id: fixtureUuid(21), displayName: 'الأجهزة' }),
      nameAr: 'الحواسيب',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createUnitOfMeasure(
  overrides: FixtureOverrides<UnitOfMeasure> = {},
): UnitOfMeasure {
  return withOverrides(
    {
      unitId: fixtureUuid(23),
      code: 'EA',
      nameAr: 'قطعة',
      symbolAr: 'قطعة',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createMaterial(overrides: FixtureOverrides<Material> = {}): Material {
  return withOverrides(
    {
      materialId: fixtureUuid(24),
      code: 'IT-HW-PC-001',
      nameAr: 'حاسوب مكتبي',
      descriptionAr: 'مادة تجريبية',
      domain: createNamedReference({ id: fixtureUuid(20), displayName: 'تقنية المعلومات' }),
      category: createNamedReference({ id: fixtureUuid(21), displayName: 'الأجهزة' }),
      family: createNamedReference({ id: fixtureUuid(22), displayName: 'الحواسيب' }),
      baseUnit: createNamedReference({ id: fixtureUuid(23), displayName: 'قطعة', code: 'EA' }),
      materialKind: 'Durable',
      requiresAssetNumber: false,
      trackingType: 'Quantity',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createMaterialUnitConversion(
  overrides: FixtureOverrides<MaterialUnitConversion> = {},
): MaterialUnitConversion {
  return withOverrides(
    {
      baseUnit: createNamedReference({ id: fixtureUuid(23), displayName: 'قطعة', code: 'EA' }),
      conversionId: fixtureUuid(25),
      factor: '12',
      fromUnit: createNamedReference({ id: fixtureUuid(26), displayName: 'كرتونة', code: 'CTN' }),
      material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
      rowVersion: 1,
      status: 'Active',
      usedInPostedDocuments: false,
    },
    overrides,
  )
}

export function createWarehouse(overrides: FixtureOverrides<Warehouse> = {}): Warehouse {
  return withOverrides(
    {
      warehouseId: fixtureUuid(30),
      code: 'WH-CENTRAL',
      nameAr: 'المستودع المركزي',
      locationAr: 'دمشق',
      site: createNamedReference({ id: fixtureUuid(31), displayName: 'المقر الرئيسي' }),
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createWarehouseCapability(
  overrides: FixtureOverrides<WarehouseCapability> = {},
): WarehouseCapability {
  return withOverrides(
    {
      capabilityId: fixtureUuid(32),
      warehouseId: fixtureUuid(30),
      domain: createNamedReference({ id: fixtureUuid(20), displayName: 'تقنية المعلومات' }),
      operations: ['Receiving', 'Issue'],
      rowVersion: 1,
    },
    overrides,
  )
}

export function createWarehouseMaterialSetting(
  overrides: FixtureOverrides<WarehouseMaterialSetting> = {},
): WarehouseMaterialSetting {
  return withOverrides(
    {
      settingId: fixtureUuid(33),
      warehouseId: fixtureUuid(30),
      material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
      minQuantity: 2,
      maxQuantity: 10,
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createSite(overrides: FixtureOverrides<Site> = {}): Site {
  return withOverrides(
    {
      siteId: fixtureUuid(50),
      organizationId: fixtureUuid(51),
      code: 'DAM-HQ',
      nameAr: 'المقر الرئيسي',
      address: 'دمشق',
      governorate: 'دمشق',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createOrganizationalUnit(
  overrides: FixtureOverrides<OrganizationalUnit> = {},
): OrganizationalUnit {
  return withOverrides(
    {
      orgUnitId: fixtureUuid(52),
      siteId: fixtureUuid(50),
      code: 'DAM-ADMIN',
      nameAr: 'الإدارة',
      pathDisplay: 'المقر الرئيسي / الإدارة',
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createEmployee(overrides: FixtureOverrides<Employee> = {}): Employee {
  return withOverrides(
    {
      employeeId: fixtureUuid(53),
      employeeNumber: 'EMP-001',
      fullNameAr: 'موظف تجريبي',
      jobTitleAr: 'أمين مستودع',
      orgUnit: createNamedReference({ id: fixtureUuid(52), displayName: 'الإدارة' }),
      site: createNamedReference({ id: fixtureUuid(50), displayName: 'المقر الرئيسي' }),
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createExternalParty(
  overrides: FixtureOverrides<ExternalParty> = {},
): ExternalParty {
  return withOverrides(
    {
      externalPartyId: fixtureUuid(54),
      code: 'EXT-001',
      contactInfo: '011-0000000',
      nameAr: 'جهة خارجية تجريبية',
      notes: null,
      rowVersion: 1,
      status: 'Active',
    },
    overrides,
  )
}

export function createInventoryBalance(
  overrides: FixtureOverrides<InventoryBalance> = {},
): InventoryBalance {
  return withOverrides(
    {
      balanceId: fixtureUuid(40),
      warehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
      material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
      quantity: 10,
      lastUpdated: FIXTURE_TIMESTAMP,
      rowVersion: 1,
      lowStock: {
        state: 'Sufficient',
        thresholdQuantity: 5,
      },
    },
    overrides,
  )
}

/** Immutable, server-redacted audit entry fixture. */
export function createAuditLogEntry(
  overrides: FixtureOverrides<AuditLogEntry> = {},
): AuditLogEntry {
  return withOverrides(
    {
      entryId: fixtureUuid(80),
      fieldName: 'status',
      oldValue: 'Draft',
      newValue: 'Submitted',
      redacted: false,
      redactionReasonAr: null,
    },
    overrides,
  )
}

/** Immutable audit header fixture; list handlers may expose it without entries. */
export function createAuditLog(overrides: FixtureOverrides<AuditLog> = {}): AuditLog {
  return withOverrides(
    {
      action: 'Update',
      auditLogId: fixtureUuid(81),
      entityDisplay: 'سند استلام تجريبي',
      entityId: fixtureUuid(200),
      entityType: 'WarehouseDocument',
      entries: [createAuditLogEntry()],
      occurredAt: FIXTURE_TIMESTAMP,
      occurredBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مدقق تجريبي' }),
      summaryAr: 'تم تحديث السند.',
      traceId: 'fixture-audit-trace-id',
    },
    overrides,
  )
}

/** Asset registry read model with server-derived status (e18-t01). */
export function createAsset(overrides: FixtureOverrides<Asset> = {}): Asset {
  return withOverrides(
    {
      assetId: fixtureUuid(50),
      assetNumber: 'AST-2026-0001',
      serialNumber: 'SN-889900',
      derivedStatus: 'InStock',
      material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
      currentWarehouse: createNamedReference({
        id: fixtureUuid(30),
        displayName: 'المستودع المركزي',
      }),
      rowVersion: 1,
    },
    overrides,
  )
}

/** One custody timeline row (active or historical) for an asset. */
export function createAssetCustody(overrides: FixtureOverrides<AssetCustody> = {}): AssetCustody {
  return withOverrides(
    {
      assetId: fixtureUuid(50),
      assetNumber: 'AST-2026-0001',
      custodyId: fixtureUuid(51),
      custodyKind: 'Operational',
      fromTs: FIXTURE_TIMESTAMP,
      holder: {
        displayName: 'مديرية المعلوماتية',
        id: fixtureUuid(20),
        secondaryLabelAr: null,
        status: 'Active',
        type: 'OrganizationalUnit',
      },
      issueDocumentId: fixtureUuid(151),
      rowVersion: 1,
      status: 'Active',
      subjectType: 'Asset',
      toTs: null,
    },
    overrides,
  )
}

/**
 * Immutable inventory-ledger read model. This is deliberately a standalone
 * projection: it does not derive a balance or mutate a warehouse document.
 */
export function createStockMovement(
  overrides: FixtureOverrides<StockMovement> = {},
): StockMovement {
  return withOverrides(
    {
      documentId: fixtureUuid(150),
      documentLineId: fixtureUuid(160),
      documentReference: 'EIAMS-RCV-2026-0001',
      material: createNamedReference({ id: fixtureUuid(24), displayName: 'حاسوب مكتبي' }),
      movementId: fixtureUuid(70),
      movementType: 'Receipt',
      postedAt: FIXTURE_TIMESTAMP,
      postedBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مدير المستودع' }),
      quantityDelta: 5,
      warehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
    },
    overrides,
  )
}

/**
 * --- Document engine fixtures -------------------------------------------------
 *
 * Shared mock-data spine for the document engine: attachment/line/policy/event
 * fixtures plus the canonical lifecycle transition table that both the mock
 * API (src/mocks/handlers.ts) and the scenario handlers
 * (src/test/msw/warehouse-document-handlers.ts) replay.
 */

export type DocumentTransition = Readonly<{
  eventType: LifecycleEventType
  /** Every status the action may legally originate from (D-LIFE-01 transition table). */
  from: readonly DocumentStatus[]
  to: DocumentStatus
}>

/**
 * Canonical action → state-transition table; non-transition actions map to
 * undefined. D-LIFE-01 §86: Cancel is permitted from Draft, Submitted, and
 * Rejected — all converge on the Cancelled terminal state.
 */
export const DOCUMENT_TRANSITIONS: Readonly<
  Record<DocumentActionType, DocumentTransition | undefined>
> = {
  Cancel: { from: ['Draft', 'Submitted', 'Rejected'], to: 'Cancelled', eventType: 'Cancelled' },
  DeleteAttachment: undefined,
  Edit: undefined,
  Post: { from: ['Submitted'], to: 'Posted', eventType: 'Posted' },
  Reject: { from: ['Submitted'], to: 'Rejected', eventType: 'Rejected' },
  Reverse: { from: ['Posted'], to: 'Reversed', eventType: 'Reversed' },
  Revise: { from: ['Rejected'], to: 'Draft', eventType: 'RevisionStarted' },
  Submit: { from: ['Draft'], to: 'Submitted', eventType: 'Submitted' },
  UploadAttachment: undefined,
}

const ACTIONS_REQUIRING_REASON: ReadonlySet<DocumentActionType> = new Set([
  'Cancel',
  'Reject',
  'Reverse',
])

/** Draft edits and attachment uploads carry no lifecycle reason; reject/cancel/reverse do. */
export function actionRequiresReason(action: DocumentActionType): boolean {
  return ACTIONS_REQUIRING_REASON.has(action)
}

const DOCUMENT_ACTOR: LifecycleActorSnapshot = {
  userId: fixtureUuid(10),
  displayName: 'مستخدم تجريبي',
  roleNameAr: 'أمين المستودع',
}

/** Lengthy default policy: every action is available so a bare factory call never blocks. */
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
export function actionsForDocumentStatus(status: DocumentStatus): ActionAvailability[] {
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

export function createActionAvailability(
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

/** D-ATT-01 refinement of the status map for the server-owned signed-original gate. */
export function actionsForDocumentPolicy(
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

export function createOperationalAdvisory(
  overrides: FixtureOverrides<OperationalAdvisory> = {},
): OperationalAdvisory {
  return withOverrides(
    {
      code: 'ActiveSoftFreeze',
      messageAr: 'هناك جرد نشط يغطي نطاق هذا المستودع.',
      severity: 'Warning',
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

export function createLifecycleEvent(
  overrides: FixtureOverrides<DocumentLifecycleEvent> = {},
): DocumentLifecycleEvent {
  return mergeDeep(
    {
      correlationId: null,
      documentId: fixtureUuid(200),
      documentRowVersion: 1,
      eventId: fixtureUuid(203),
      eventType: 'Created',
      occurredAt: FIXTURE_TIMESTAMP,
      occurredBy: DOCUMENT_ACTOR,
      reason: null,
      toStatus: 'Draft',
    },
    overrides,
  )
}

/**
 * Synthesizes the canonical immutable lifecycle chain implied by a document's
 * current status. Seed fixtures only — real transitions run through the action
 * engine which appends one event per accepted action.
 *
 * The Cancelled terminal is ambiguous (D-LIFE-01 §86: it may originate from
 * Draft, Submitted, or Rejected); pass `cancelledFrom` to request a specific
 * chain for a Cancelled fixture document. Defaults to 'Draft'.
 */
export function deriveLifecycleEvents(
  document: WarehouseDocument,
  options: { cancelledFrom?: DocumentStatus } = {},
): DocumentLifecycleEvent[] {
  const events: DocumentLifecycleEvent[] = [
    createLifecycleEvent({
      documentId: document.documentId,
      documentRowVersion: 1,
      eventId: fixtureUuid(203),
      eventType: 'Created',
      occurredAt: document.createdAt,
      occurredBy: {
        userId: document.createdBy.id,
        displayName: document.createdBy.displayName,
        roleNameAr: null,
      },
      toStatus: 'Draft',
    }),
  ]
  const step = (
    eventType: LifecycleEventType,
    from: DocumentStatus,
    to: DocumentStatus,
    index: number,
  ): void => {
    events.push(
      createLifecycleEvent({
        documentId: document.documentId,
        documentRowVersion: index + 2,
        eventId: fixtureUuid(204 + index),
        eventType,
        fromStatus: from,
        occurredAt: document.createdAt,
        toStatus: to,
      }),
    )
  }
  switch (document.documentStatus) {
    case 'Submitted':
      step('Submitted', 'Draft', 'Submitted', 0)
      break
    case 'Rejected':
      step('Submitted', 'Draft', 'Submitted', 0)
      step('Rejected', 'Submitted', 'Rejected', 1)
      break
    case 'Posted':
      step('Submitted', 'Draft', 'Submitted', 0)
      step('Posted', 'Submitted', 'Posted', 1)
      break
    case 'Reversed':
      step('Submitted', 'Draft', 'Submitted', 0)
      step('Posted', 'Submitted', 'Posted', 1)
      step('Reversed', 'Posted', 'Reversed', 2)
      break
    case 'Cancelled':
      switch (options.cancelledFrom ?? 'Draft') {
        case 'Draft':
          step('Cancelled', 'Draft', 'Cancelled', 0)
          break
        case 'Submitted':
          step('Submitted', 'Draft', 'Submitted', 0)
          step('Cancelled', 'Submitted', 'Cancelled', 1)
          break
        case 'Rejected':
          step('Submitted', 'Draft', 'Submitted', 0)
          step('Rejected', 'Submitted', 'Rejected', 1)
          step('Cancelled', 'Rejected', 'Cancelled', 2)
          break
      }
      break
    case 'Draft':
      break
  }
  return events
}

export function createDocumentActionResult(
  actionType: DocumentActionType,
  overrides: FixtureOverrides<DocumentActionResult> = {},
): DocumentActionResult {
  const transition = DOCUMENT_TRANSITIONS[actionType]
  if (transition === undefined) {
    throw new Error(
      `createDocumentActionResult: '${actionType}' is not a lifecycle transition action; use one of Submit, Post, Reject, Revise, Cancel, Reverse.`,
    )
  }
  const documentId = fixtureUuid(200)
  const nextRowVersion = 2
  const defaults: DocumentActionResult = {
    document: createWarehouseDocument({
      documentId,
      documentStatus: transition.to,
      rowVersion: nextRowVersion,
    }),
    lifecycleEvent: createLifecycleEvent({
      documentId,
      documentRowVersion: nextRowVersion,
      eventId: fixtureUuid(203),
      eventType: transition.eventType,
      fromStatus: transition.from[0]!,
      reason: actionRequiresReason(actionType) ? 'سبب تجريبي' : null,
      toStatus: transition.to,
    }),
  }
  return mergeDeep(defaults, overrides)
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

/** Produces the shared `{ items, meta }` page shape used by v1 list responses. */
export function createPage<T>(items: readonly T[] = [], meta: FixtureOverrides<PageMeta> = {}) {
  return {
    items,
    meta: createPageMeta({
      totalItems: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      ...meta,
    }),
  }
}
