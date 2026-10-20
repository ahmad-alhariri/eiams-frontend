import type {
  ActionAvailability,
  Asset,
  AssetCustody,
  AssetMovement,
  AuditLog,
  AuditLogEntry,
  DocumentActionResult,
  DocumentActionType,
  DocumentAttachment,
  DocumentLifecycleEvent,
  DocumentLine,
  DocumentPolicy,
  DocumentStatus,
  FieldError,
  LifecycleActorSnapshot,
  LifecycleEventType,
  NamedReference,
  OperationalAdvisory,
  PageMeta,
  PolicyBlocker,
  ProblemDetails,
  Permission,
  Role,
  WarehouseDocument,
} from '@/shared/types/generated/eiams-v1'
import type {
  AuthTokenResponse,
  SessionResponse,
  SessionRole,
  SessionScope,
  SessionUser,
} from '@/modules/auth/types/session.types'
import type {
  WarehouseCapability,
  WarehouseMaterialSetting,
  Warehouse,
} from '@/modules/warehouse/types/warehouse.api-types'
// txq4: Site / OrganizationalUnit / Employee / ExternalParty / Warehouse are
// typed against the handwritten contracts, NOT the frozen generated snapshot.
// Importing them from `@/shared/types/generated/eiams-v1` is what let these
// factories keep minting `warehouseId` / `nameAr` / nested `site` fixtures while
// production code had already moved to `id` / `name` — the suite validated
// fiction against itself. For ExternalParty the generated snapshot was worse
// than merely stale: it named the identifier `externalPartyId`, so a factory
// typed against it kept minting an id field the backend never sends.
import type {
  Site,
  OrganizationalUnit,
  Employee,
  ExternalParty,
  Organization,
} from '@/modules/organization/types/organization.api-types'
// StockMovement and InventoryBalance follow the same rule: the live wire is
// `postedBy: Uuid` per `Application/StockMovements/GetList/StockMovementResponse.cs`,
// NOT the generated `postedBy: NamedReference`, and both inventory projections
// are flat (no nested warehouse/material). The handwritten types live next to
// the service that reads them; using them here makes the factories mint the
// same shape the pages render.
import type {
  InventoryBalance,
  StockMovement,
} from '@/modules/inventory/types/inventory.api-types'
// The catalog master-data records are minted against the HANDWRITTEN contracts,
// not the frozen generated snapshot: the wire says `id` (never
// `domainId`/`categoryId`/`familyId`/`unitId`), `name` (never `nameAr`), and
// carries no `rowVersion` on any of them. `Material` is deliberately absent
// from the generated import above — it used to be pulled from it, which made
// every material fixture a fiction until the real DTO replaced it.
import type {
  Material,
  MaterialCategory,
  MaterialDomain,
  MaterialFamily,
  MaterialUnitConversion,
  UnitOfMeasure,
} from '@/modules/catalog/types/catalog.api-types'
import type {
  PermissionCatalogEntry,
  RoleProjection,
  UserRoleScopeProjection,
} from '@/modules/admin/types/role.types'
import type { UserDetailProjection, UserDirectoryRow } from '@/modules/admin/types/user.types'
import type { ScopeContext } from '@/shared/types/generated/eiams-v1'

/** Contract-backed fixture helpers for MSW tests.
 *
 * Keep factories here, instead of inside feature tests, so every mock payload
 * is checked against the generated OpenAPI surface. Factories deliberately
 * produce ordinary data only; endpoint-specific handlers remain owned by the
 * feature that exercises the endpoint.
 *
 * Why this stays in the test tree, and did NOT move to `src/shared/`
 * -----------------------------------------------------------------
 * `eiams-frontend-vs8p` (EPIC G7) briefly moved this file to
 * `src/shared/fixtures/factories.ts` with a re-export shim here, to satisfy
 * "no file under `src/` outside `src/test/` imports `@/test/**`" without waiting
 * for the mock layer to be deleted. That was reverted, and the reasoning is
 * worth keeping because the move looks reasonable and is still wrong.
 *
 * `src/shared/` is the PRODUCTION shared layer: it is inside the app TypeScript
 * project and inside the browser module graph. Parking 1300 lines of Arabic
 * fixture data and the canonical `DOCUMENT_TRANSITIONS` table there means any
 * production component can `import { createWarehouseDocument } from
 * '@/shared/fixtures/factories'` and ship seed records, and the only thing
 * standing between that and a 40 kB fixture bundle in `dist/` is a developer
 * noticing. `production-artifact-purity.test.ts` would catch the resulting
 * artifact, but "safe because nothing imports it yet" is precisely the posture
 * that rots: this epic exists because a fixture layer nobody was importing
 * still shipped.
 *
 * The other consumer was `src/mocks/` — the development mock API. `eiams-frontend-m4jm`
 * deleted that directory, which is why the two remaining runtime imports
 * (`src/mocks/db.ts`, `src/mocks/handlers.ts`) were never a structural problem
 * to be engineered around: they were two lines that stopped existing when the
 * directory did. `src/test/no-runtime-test-imports.test.ts` named exactly those
 * two files and stayed red until then, which was the honest state — the guard
 * reported what was still true rather than being satisfied by moving the problem
 * somewhere it could not see. It is green now, and it is green because nothing
 * outside `src/test/` imports this file at all: which makes the reasoning above
 * the only thing standing between it and the next well-meaning relocation.
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
    { id: fixtureUuid(1), displayName: 'مرجع تجريبي', code: 'REF-001' },
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

/**
 * One row of the administration directory, in the served shape.
 *
 * Distinct from `createUserDetail` below because the backend serves two different
 * records: the directory row additionally carries the user's sole role-and-scope
 * assignment, while the single-user read omits it.
 */
export function createUserDirectoryRow(
  overrides: FixtureOverrides<UserDirectoryRow> = {},
): UserDirectoryRow {
  return withOverrides(
    {
      id: fixtureUuid(10),
      email: 'fixture.user@eiams.local',
      username: 'fixture.user',
      firstName: 'مستخدم',
      lastName: 'اختباري',
      status: 'Active',
      createdAtUtc: '2026-01-01T00:00:00Z',
      rowVersion: 1,
      roleId: fixtureUuid(14),
      roleName: 'SYSTEM_ADMIN',
      scopeType: 'Enterprise',
      scopeId: null,
    },
    overrides,
  )
}

/** The single-user read: no `username`, no `rowVersion`, and no assignment. */
export function createUserDetail(
  overrides: FixtureOverrides<UserDetailProjection> = {},
): UserDetailProjection {
  return withOverrides(
    {
      id: fixtureUuid(10),
      email: 'fixture.user@eiams.local',
      username: 'fixture.user',
      firstName: 'مستخدم',
      lastName: 'اختباري',
      status: 'Active',
      createdAtUtc: '2026-01-01T00:00:00Z',
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

/**
 * The role administration projection. Distinct from `createRole` above because the
 * assignment surface still carries the stale generated shape (`roleId`, `code`,
 * `status`), while the role catalogue and permission matrix consume the handwritten
 * `RoleProjection`. Migrating the assignment projection is tracked separately.
 */
export function createRoleProjection(
  overrides: FixtureOverrides<RoleProjection> = {},
): RoleProjection {
  return withOverrides(
    {
      id: fixtureUuid(14),
      name: 'SYSTEM_ADMIN',
      nameAr: 'مدير النظام',
      description: 'Enterprise structural administration.',
      allowedScopeTypes: ['Enterprise'],
      permissionCodes: ['admin.user.view', 'admin.user.manage'],
      rowVersion: 1,
    },
    overrides,
  )
}

/** One entry of the server-owned permission catalogue, in its served shape. */
export function createPermissionCatalogEntry(
  overrides: FixtureOverrides<PermissionCatalogEntry> = {},
): PermissionCatalogEntry {
  return withOverrides(
    {
      id: fixtureUuid(13),
      code: 'admin.user.view',
      nameAr: 'عرض المستخدمين',
      descriptionAr: 'عرض دليل حسابات المستخدمين.',
      description: 'View users.',
      allowedScopeTypes: ['Enterprise'],
    },
    overrides,
  )
}

/**
 * The user's sole role-and-scope assignment, in the shape the backend serves.
 *
 * Deliberately NOT the generated `UserRoleScope` (`{role, scope, userId,
 * userRoleScopeId}`): that describes a record the backend never returned, and a
 * collection of them would contradict D-SRS-01's one-assignment invariant.
 */
export function createUserRoleScope(
  overrides: FixtureOverrides<UserRoleScopeProjection> = {},
): UserRoleScopeProjection {
  return withOverrides(
    {
      id: fixtureUuid(15),
      roleId: fixtureUuid(14),
      roleName: 'SYSTEM_ADMIN',
      scopeType: 'Enterprise',
      scopeId: null,
      rowVersion: 1,
    },
    overrides,
  )
}

export function createScopeContext(overrides: FixtureOverrides<ScopeContext> = {}): ScopeContext {
  return withOverrides(
    { scopeType: 'Warehouse', scopeId: fixtureUuid(12), displayName: 'المستودع المركزي' },
    overrides,
  )
}

export function createSessionUser(overrides: FixtureOverrides<SessionUser> = {}): SessionUser {
  return withOverrides(
    {
      id: fixtureUuid(10),
      email: 'fixture.user@eiams.local',
      firstName: 'مستخدم',
      lastName: 'اختباري',
      employeeId: null,
      employeeName: null,
    },
    overrides,
  )
}

/**
 * The session's SINGLE role. `nameAr` is what the UI renders; keeping it in the fixture is
 * what catches a consumer that silently reads `name` instead.
 */
export function createSessionRole(overrides: FixtureOverrides<SessionRole> = {}): SessionRole {
  return withOverrides(
    {
      id: fixtureUuid(11),
      name: 'WarehouseKeeper',
      nameAr: 'أمين مستودع',
      description: null,
    },
    overrides,
  )
}

/**
 * The active scope as the session endpoint sends it: `scopeName`, not `displayName`.
 * `scopeId` is null only for Enterprise.
 */
export function createSessionScope(overrides: FixtureOverrides<SessionScope> = {}): SessionScope {
  return withOverrides(
    {
      scopeType: 'Warehouse',
      scopeId: fixtureUuid(12),
      scopeName: 'مستودع اختباري',
    },
    overrides,
  )
}

export function createSession(overrides: FixtureOverrides<SessionResponse> = {}): SessionResponse {
  return withOverrides(
    {
      user: createSessionUser(),
      role: createSessionRole(),
      permissionCodes: ['document.view'],
      activeScope: createSessionScope(),
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

/**
 * `GET /catalog/domains` — `{ id, name, code, status }`.
 *
 * `id`, not `domainId`; `name`, not `nameAr`; and NO `rowVersion`:
 * MaterialDomain is not a versioned aggregate, and an update route that binds
 * `Name` alone would refuse the field.
 */
export function createMaterialDomain(
  overrides: FixtureOverrides<MaterialDomain> = {},
): MaterialDomain {
  return withOverrides(
    {
      id: fixtureUuid(20),
      name: 'تقنية المعلومات',
      code: 'IT',
      status: 'Active',
    },
    overrides,
  )
}

/**
 * `GET /catalog/categories` — `{ id, materialDomainId, parentCategoryId, name,
 * code, status }`, flat. There is no nested `materialDomain` reference, so a
 * category's domain label is resolved from the domains list, never from the
 * category itself.
 */
export function createMaterialCategory(
  overrides: FixtureOverrides<MaterialCategory> = {},
): MaterialCategory {
  return withOverrides(
    {
      id: fixtureUuid(21),
      materialDomainId: fixtureUuid(20),
      parentCategoryId: null,
      name: 'الأجهزة',
      code: 'IT-HW',
      status: 'Active',
    },
    overrides,
  )
}

/**
 * `GET /catalog/families` — `{ id, categoryId, name, code, status }`. The
 * parent key is `categoryId`, NOT `materialCategoryId`, and there is no
 * nested `category`/`domain` reference.
 */
export function createMaterialFamily(
  overrides: FixtureOverrides<MaterialFamily> = {},
): MaterialFamily {
  return withOverrides(
    {
      id: fixtureUuid(22),
      categoryId: fixtureUuid(21),
      name: 'الحواسيب',
      code: 'IT-HW-PC',
      status: 'Active',
    },
    overrides,
  )
}

/**
 * `GET /catalog/units-of-measure` — `{ id, name, symbol, unitType, status }`.
 *
 * `name`/`symbol`, not `nameAr`/`symbolAr`; no `code`, no `descriptionAr`, no
 * `nominalConversionFactor`, no `baseUnitId`. `unitType` is a free-form string
 * on the wire, deliberately not narrowed to a union.
 */
export function createUnitOfMeasure(
  overrides: FixtureOverrides<UnitOfMeasure> = {},
): UnitOfMeasure {
  return withOverrides(
    {
      id: fixtureUuid(23),
      name: 'قطعة',
      symbol: 'EA',
      unitType: 'Quantity',
      status: 'Active',
    },
    overrides,
  )
}

/**
 * THE document-engine material, and deliberately still typed against the
 * frozen generated `Material`.
 *
 * The document ledger types that embed it — `DocumentLine.material`,
 * `InventoryBalance.material`, `StockMovement.material`, `Asset.material` — are
 * all still generated-snapshot shapes, so re-pointing this factory would mint a
 * record whose consumers are typed against fields it no longer carries.
 * Migrating that engine is its own epic, and a half-migrated factory would
 * just move the fiction.
 *
 * What that means in practice: NEVER serve this from a `/catalog/materials`
 * handler. `wireMaterial` in `./catalog-wire-fixtures` mints the real
 * `catalog.api-types.Material` for every catalog-list consumer.
 */
export function createMaterial(overrides: FixtureOverrides<Material> = {}): Material {
  return withOverrides(
    {
      id: fixtureUuid(24),
      familyId: fixtureUuid(22),
      nameAr: 'الأصل الثابت للاختبار',
      nameEn: null,
      code: 'IT-HW-PC-001',
      materialKind: 'Consumable',
      trackingType: 'Quantity',
      hasExpiry: false,
      requiresAssetNumber: false,
      catalogVersion: 1,
      attributes: null,
      status: 'Active',
      materialDomainId: fixtureUuid(20),
      materialDomainName: 'أجهزة الحاسوب',
      baseUnitId: fixtureUuid(23),
      baseUnitSymbol: 'حبة',
    },
    overrides,
  )
}

/**
 * `GET /catalog/materials/{materialId}/unit-conversions` — `{ id, materialId,
 * fromUnitId, toBaseUnitId, factor }`.
 *
 * `factor` is a JSON NUMBER on the wire even though the column is
 * `DECIMAL(18,6)`; the old string `'12'` was the snapshot's fiction. No
 * `status`, no `material`/`unit`/`baseUnit` references, no `rowVersion`.
 */
export function createMaterialUnitConversion(
  overrides: FixtureOverrides<MaterialUnitConversion> = {},
): MaterialUnitConversion {
  return withOverrides(
    {
      id: fixtureUuid(25),
      materialId: fixtureUuid(24),
      fromUnitId: fixtureUuid(26),
      toBaseUnitId: fixtureUuid(23),
      factor: 12,
    },
    overrides,
  )
}

export function createWarehouse(overrides: FixtureOverrides<Warehouse> = {}): Warehouse {
  return withOverrides(
    {
      id: fixtureUuid(30),
      siteId: fixtureUuid(50),
      organizationalUnitId: fixtureUuid(52),
      code: 'WH-CENTRAL',
      name: 'المستودع المركزي',
      warehouseType: 'Storage',
      canHoldStock: true,
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
      id: fixtureUuid(70),
      warehouseId: fixtureUuid(30),
      materialDomainId: fixtureUuid(20),
      materialDomainCode: 'IT',
      materialDomainName: 'تقنية المعلومات',
      status: 'Active',
      operations: ['Receiving', 'Issue'],
    },
    overrides,
  )
}

export function createWarehouseMaterialSetting(
  overrides: FixtureOverrides<WarehouseMaterialSetting> = {},
): WarehouseMaterialSetting {
  return withOverrides(
    {
      id: fixtureUuid(71),
      warehouseId: fixtureUuid(30),
      materialId: fixtureUuid(24),
      materialCode: 'MAT-PC-001',
      materialNameAr: 'حاسوب مكتبي',
      minQuantity: 2,
      maxQuantity: 10,
      status: 'Active',
    },
    overrides,
  )
}

export function createOrganization(overrides: FixtureOverrides<Organization> = {}): Organization {
  return withOverrides(
    {
      id: fixtureUuid(51),
      code: 'ORG-001',
      name: 'الهيئة العامة للرقابة والتفتيش',
      status: 'Active',
    },
    overrides,
  )
}

export function createSite(overrides: FixtureOverrides<Site> = {}): Site {
  return withOverrides(
    {
      id: fixtureUuid(50),
      organizationId: fixtureUuid(51),
      code: 'DAM-HQ',
      name: 'المقر الرئيسي',
      location: 'دمشق',
      governorateCode: 'DIM',
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
      id: fixtureUuid(52),
      siteId: fixtureUuid(50),
      parentId: null,
      name: 'الإدارة',
      unitType: 'Department',
      status: 'Active',
    },
    overrides,
  )
}

export function createEmployee(overrides: FixtureOverrides<Employee> = {}): Employee {
  return withOverrides(
    {
      id: fixtureUuid(53),
      orgUnitId: fixtureUuid(52),
      employeeNumber: 'EMP-001',
      fullName: 'موظف تجريبي',
      jobTitle: 'أمين مستودع',
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
      id: fixtureUuid(54),
      code: 'EXT-001',
      contactInfo: '011-0000000',
      nameAr: 'جهة خارجية تجريبية',
      notes: null,
      rowVersion: 1,
      status: 'Active',
      createdAtUtc: '2026-10-05T08:00:00Z',
      updatedAtUtc: '2026-10-05T08:00:00Z',
    },
    overrides,
  )
}

export function createInventoryBalance(
  overrides: FixtureOverrides<InventoryBalance> = {},
): InventoryBalance {
  return withOverrides(
    {
      id: fixtureUuid(40),
      warehouseId: fixtureUuid(30),
      warehouseCode: 'WH-CENTRAL',
      warehouseName: 'المستودع المركزي',
      materialId: fixtureUuid(24),
      materialCode: 'IT-HW-PC-001',
      materialNameAr: 'حاسوب مكتبي',
      quantity: 10,
      lastUpdatedUtc: FIXTURE_TIMESTAMP,
      rowVersion: 1,
      lowStock: {
        state: 1,
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
 * Immutable asset-movement ledger read model (e18-t05). Same standing as
 * `createStockMovement`: a standalone provenance projection that never derives
 * an asset status or mutates a document. Defaults describe a receipt into a
 * warehouse, so an issue/return/disposal row only has to override `eventType`
 * and the warehouse references it actually moved between.
 */
export function createAssetMovement(
  overrides: FixtureOverrides<AssetMovement> = {},
): AssetMovement {
  return withOverrides(
    {
      assetId: fixtureUuid(50),
      documentId: fixtureUuid(150),
      documentLineId: fixtureUuid(160),
      documentReference: 'EIAMS-RCV-2026-0001',
      eventType: 'Received',
      movementId: fixtureUuid(52),
      occurredAt: FIXTURE_TIMESTAMP,
      occurredBy: createNamedReference({ id: fixtureUuid(10), displayName: 'مدير المستودع' }),
      toWarehouse: createNamedReference({ id: fixtureUuid(30), displayName: 'المستودع المركزي' }),
    },
    overrides,
  )
}

/**
 * Immutable inventory-ledger read model. This is deliberately a standalone
 * projection: it does not derive a balance or mutate a warehouse document.
 *
 * The wire record is flat and carries `postedBy` as a UUID STRING (see
 * `src/test/msw/inventory-wire-fixtures.ts`), matching the consumer baseline.
 */
export function createStockMovement(
  overrides: FixtureOverrides<StockMovement> = {},
): StockMovement {
  const warehouseId = fixtureUuid(30)
  const materialId = fixtureUuid(24)
  return withOverrides(
    {
      id: fixtureUuid(70),
      warehouseId,
      warehouseCode: 'WH-CENTRAL',
      warehouseName: 'المستودع المركزي',
      materialId,
      materialCode: 'IT-HW-PC-001',
      materialNameAr: 'حاسوب مكتبي',
      documentId: fixtureUuid(150),
      documentReferenceNumber: 'EIAMS-RCV-2026-0001',
      lineId: fixtureUuid(160),
      movementType: 'Receipt',
      quantityDelta: 5,
      postedAtUtc: FIXTURE_TIMESTAMP,
      postedBy: fixtureUuid(10),
    },
    overrides,
  )
}

/**
 * --- Document engine fixtures -------------------------------------------------
 *
 * Shared mock-data spine for the document engine: attachment/line/policy/event
 * fixtures plus the canonical lifecycle transition table that the scenario
 * handlers (src/test/msw/warehouse-document-handlers.ts) replay. The deleted
 * development mock (src/mocks/handlers.ts) replayed the same table.
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

/**
 * Projects the REAL catalog record into the material the document engine still
 * embeds in a line.
 *
 * `DocumentLine.material` is one of the shapes the frozen snapshot invented: it
 * nests `baseUnit` / `category` / `domain` / `family` `NamedReference`s, calls
 * the identity `materialId`, carries a `rowVersion`, and pins `materialKind` +
 * `requiresAssetNumber` to a discriminator. The wire record (`Material`) is flat
 * and carries none of that. Only `nameAr` and `code` are ever read off the
 * embedding in production, so those two travel verbatim; every reference below
 * is derived from an identifier the record DOES carry rather than being
 * re-invented, and the enum fields are narrowed to the discriminator that
 * matches the record's own kind.
 *
 * This is a boundary adapter, not a contract — it is deleted when the document
 * engine gets a handwritten line type instead of the generated one. Until then
 * it exists so a line's embedded material is derived from a real material
 * rather than being a second, parallel fiction.
 */
export function toDocumentLineMaterial(material: Material): DocumentLine['material'] {
  const domain = createNamedReference({
    id: material.materialDomainId,
    displayName: material.materialDomainName,
  })
  const family = createNamedReference({
    id: material.familyId,
    displayName: material.materialDomainName,
  })
  const shared = {
    attributes: material.attributes,
    baseUnit: createNamedReference({
      id: material.baseUnitId,
      displayName: material.baseUnitSymbol,
    }),
    baseUnitId: material.baseUnitId,
    baseUnitSymbol: material.baseUnitSymbol,
    catalogVersion: material.catalogVersion,
    category: domain,
    code: material.code,
    descriptionAr: null,
    domain,
    family,
    familyId: material.familyId,
    hasExpiry: material.hasExpiry,
    id: material.id,
    materialDomainId: material.materialDomainId,
    materialDomainName: material.materialDomainName,
    materialId: material.id,
    nameAr: material.nameAr,
    nameEn: material.nameEn,
    rowVersion: 1,
    // The generated embedding has no `Archived` state, and an archived material
    // is terminal — it is never the material of a live document line.
    status: material.status === 'Archived' ? ('Inactive' as const) : material.status,
    trackingType: material.trackingType,
  }
  if (material.materialKind === 'Asset') {
    return {
      ...shared,
      materialKind: 'Asset' as const,
      requiresAssetNumber: true,
      trackingType: 'Serial' as const,
    }
  }
  if (material.materialKind === 'Consumable') {
    return {
      ...shared,
      materialKind: 'Consumable' as const,
      requiresAssetNumber: false,
      trackingType: 'Quantity' as const,
    }
  }
  return { ...shared, materialKind: 'Durable' as const, requiresAssetNumber: false }
}

/** Line overrides whose `material` is the REAL catalog DTO, not the generated
 *  material the document engine still embeds — see {@link toDocumentLineMaterial}. */
type WarehouseDocumentLineOverrides = Omit<FixtureOverrides<DocumentLine>, 'material'> & {
  readonly material?: Material
}

export function createWarehouseDocumentLine(
  overrides: WarehouseDocumentLineOverrides = {},
): DocumentLine {
  const { material: materialOverride, ...rest } = overrides
  const material = materialOverride ?? createMaterial()
  const defaults: DocumentLine = {
    availableBalance: null,
    baseQuantity: rest.quantity ?? 5,
    conversionFactor: '1.000000',
    conversionId: null,
    lineId: fixtureUuid(201),
    lineType: 'Normal',
    material: toDocumentLineMaterial(material),
    quantity: 5,
    unit: createNamedReference({
      id: material.baseUnitId,
      displayName: material.baseUnitSymbol,
    }),
    unitPrice: null,
  }
  return mergeDeep(defaults, rest)
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
