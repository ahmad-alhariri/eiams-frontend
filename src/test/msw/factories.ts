import type {
  AuthTokenResponse,
  EffectiveRole,
  FieldError,
  InventoryBalance,
  Material,
  MaterialCategory,
  MaterialDomain,
  MaterialFamily,
  NamedReference,
  PageMeta,
  ProblemDetails,
  ScopeContext,
  SessionResponse,
  UnitOfMeasure,
  UserSummary,
  Warehouse,
} from '@/shared/types/generated/eiams-v1'

/**
 * Contract-backed fixture helpers for MSW tests.
 *
 * Keep factories here, instead of inside feature tests, so every mock payload
 * is checked against the generated OpenAPI surface. Factories deliberately
 * produce ordinary data only; endpoint-specific handlers remain owned by the
 * feature that exercises the endpoint.
 */
export type FixtureOverrides<T> = Partial<T>

const FIXTURE_TIMESTAMP = '2026-01-01T00:00:00.000Z'

/** Returns a deterministic, syntactically valid UUID for readable test data. */
export function fixtureUuid(sequence = 1): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`
}

function withOverrides<T extends object>(defaults: T, overrides: FixtureOverrides<T>): T {
  return { ...defaults, ...overrides }
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
      baseUnit: createNamedReference({ id: fixtureUuid(23), displayName: 'قطعة' }),
      materialKind: 'Durable',
      requiresAssetNumber: false,
      trackingType: 'Quantity',
      rowVersion: 1,
      status: 'Active',
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
    },
    overrides,
  )
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
