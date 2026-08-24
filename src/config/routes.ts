import type { PermissionCode } from '@/config/permissions'

/**
 * Application route constants + guard metadata (D-RBAC-01).
 *
 * Canonical source: docs/route-permission-scope-matrix.md. Every path below
 * carries the permission guard that a protected route must enforce via
 * `usePermission`/`RequireAuth` — never invent codes outside the typed
 * PermissionCode vocabulary. Pages arrive incrementally per epic; the lazy
 * registry in @/config/route-registry wires only implemented pages.
 */

export const ROUTE_PATHS = {
  /** Auth (public until e06 lands). */
  login: '/login',
  scopeSelect: '/session/scope',
  noAccess: '/session/no-access',
  /** Dashboard. */
  dashboard: '/',
  /** Catalog. */
  catalogDomains: '/catalog/domains',
  catalogCategories: '/catalog/categories',
  catalogFamilies: '/catalog/families',
  catalogMaterials: '/catalog/materials',
  catalogMaterialDetail: '/catalog/materials/:materialId',
  catalogUnits: '/catalog/units',
  /** Organization. */
  organizationSites: '/organization/sites',
  organizationSiteDetail: '/organization/sites/:siteId',
  organizationOrgUnits: '/organization/org-units',
  organizationEmployees: '/organization/employees',
  organizationEmployeeDetail: '/organization/employees/:employeeId',
  organizationExternalParties: '/organization/external-parties',
  /** Warehouses. */
  warehouses: '/warehouses',
  warehouseDetail: '/warehouses/:warehouseId',
  /** Inventory. */
  inventoryBalances: '/inventory/balances',
  inventoryBalanceDetail: '/inventory/balances/:balanceId',
  inventoryMovements: '/inventory/movements',
  inventoryMovementDetail: '/inventory/movements/:movementId',
  /** Documents (spine + petals). */
  documentReceiving: '/documents/receiving',
  documentReceivingNew: '/documents/receiving/new',
  documentReceivingDetail: '/documents/receiving/:documentId',
  documentIssue: '/documents/issue',
  documentIssueNew: '/documents/issue/new',
  documentIssueDetail: '/documents/issue/:documentId',
  documentTransfer: '/documents/transfer',
  documentTransferNew: '/documents/transfer/new',
  documentTransferDetail: '/documents/transfer/:documentId',
  documentOpening: '/documents/opening',
  documentOpeningNew: '/documents/opening/new',
  documentOpeningDetail: '/documents/opening/:documentId',
  documentReturn: '/documents/return',
  documentReturnNew: '/documents/return/new',
  documentReturnDetail: '/documents/return/:documentId',
  /** Adjustments. */
  adjustments: '/adjustments',
  adjustmentNew: '/adjustments/new',
  adjustmentDetail: '/adjustments/:adjustmentId',
  /** Inventory counts. */
  counts: '/counts',
  countNew: '/counts/new',
  countDetail: '/counts/:countId',
  /** Assets & custody. */
  assets: '/assets',
  assetDetail: '/assets/:assetId',
  custodyPending: '/custody/pending',
  custodyActive: '/custody/active',
  custodyDetail: '/custody/:custodyId',
  /** Audit & reports. */
  audit: '/audit',
  reports: '/reports',
  /** Admin. */
  adminUsers: '/admin/users',
  adminUserDetail: '/admin/users/:userId',
  adminRoles: '/admin/roles',
  adminRoleDetail: '/admin/roles/:roleId',
  /** Dev-only component gallery (never in production bundles). */
  devGallery: '/dev/gallery',
  /** Unlisted URLs — route to not-found, never to a permission experiment. */
  notFound: '/not-found',
} as const

export type RouteKey = keyof typeof ROUTE_PATHS

export type RouteGroup =
  | 'auth'
  | 'dashboard'
  | 'catalog'
  | 'organization'
  | 'warehouses'
  | 'inventory'
  | 'documents'
  | 'adjustments'
  | 'counts'
  | 'assets-custody'
  | 'audit'
  | 'reports'
  | 'admin'
  | 'dev'
  | 'system'

export interface RouteMeta {
  /** Arabic label used by breadcrumbs and document titles (never English). */
  labelAr: string
  group: RouteGroup
  /** Required guards — user must hold every listed code. */
  permissions?: readonly PermissionCode[]
  /** Alternative guards — user must hold at least one listed code. */
  permissionAny?: readonly PermissionCode[]
  /** True for login/scope/auth-only routes. */
  public?: boolean
  /** True for the dev-only gallery. */
  devOnly?: boolean
  /** Parent route key used to build breadcrumbs. */
  parent?: RouteKey
}

type RouteMetaMap = Record<RouteKey, RouteMeta>

export const ROUTE_METADATA: RouteMetaMap = {
  login: { labelAr: 'تسجيل الدخول', group: 'auth', public: true },
  scopeSelect: { labelAr: 'اختيار نطاق العمل', group: 'auth', public: true },
  noAccess: { labelAr: 'لا توجد صلاحية', group: 'auth', public: true },

  dashboard: {
    labelAr: 'لوحة المعلومات',
    group: 'dashboard',
    permissionAny: [
      'catalog.view',
      'organization.view',
      'warehouse.view',
      'inventory.view',
      'document.view',
      'count.view',
      'asset.view',
      'report.view',
    ],
  },

  catalogDomains: {
    labelAr: 'مجالات التصنيف',
    group: 'catalog',
    permissions: ['catalog.view'],
    parent: 'dashboard',
  },
  catalogCategories: {
    labelAr: 'التصنيفات',
    group: 'catalog',
    permissions: ['catalog.view'],
    parent: 'catalogDomains',
  },
  catalogFamilies: {
    labelAr: 'العائلات',
    group: 'catalog',
    permissions: ['catalog.view'],
    parent: 'catalogCategories',
  },
  catalogMaterials: {
    labelAr: 'الأصناف',
    group: 'catalog',
    permissions: ['catalog.view'],
    parent: 'catalogFamilies',
  },
  catalogMaterialDetail: {
    labelAr: 'تفاصيل المادة',
    group: 'catalog',
    permissions: ['catalog.view'],
    parent: 'catalogMaterials',
  },
  catalogUnits: {
    labelAr: 'وحدات القياس',
    group: 'catalog',
    permissions: ['catalog.view'],
    parent: 'dashboard',
  },

  organizationSites: {
    labelAr: 'المواقع',
    group: 'organization',
    permissions: ['organization.view'],
    parent: 'dashboard',
  },
  organizationSiteDetail: {
    labelAr: 'تفاصيل الموقع',
    group: 'organization',
    permissions: ['organization.view'],
    parent: 'organizationSites',
  },
  organizationOrgUnits: {
    labelAr: 'الوحدات التنظيمية',
    group: 'organization',
    permissions: ['organization.view'],
    parent: 'organizationSites',
  },
  organizationEmployees: {
    labelAr: 'الموظفون',
    group: 'organization',
    permissions: ['organization.view'],
    parent: 'organizationOrgUnits',
  },
  organizationEmployeeDetail: {
    labelAr: 'تفاصيل الموظف',
    group: 'organization',
    permissions: ['organization.view'],
    parent: 'organizationEmployees',
  },
  organizationExternalParties: {
    labelAr: 'الجهات الخارجية',
    group: 'organization',
    permissions: ['organization.view'],
    parent: 'dashboard',
  },

  warehouses: {
    labelAr: 'المستودعات',
    group: 'warehouses',
    permissions: ['warehouse.view'],
    parent: 'dashboard',
  },
  warehouseDetail: {
    labelAr: 'تفاصيل المستودع',
    group: 'warehouses',
    permissions: ['warehouse.view'],
    parent: 'warehouses',
  },

  inventoryBalances: {
    labelAr: 'أرصدة المخزون',
    group: 'inventory',
    permissions: ['inventory.view'],
    parent: 'dashboard',
  },
  inventoryBalanceDetail: {
    labelAr: 'تفاصيل الرصيد',
    group: 'inventory',
    permissions: ['inventory.view'],
    parent: 'inventoryBalances',
  },
  inventoryMovements: {
    labelAr: 'حركات المخزون',
    group: 'inventory',
    permissions: ['inventory.view'],
    parent: 'inventoryBalances',
  },
  inventoryMovementDetail: {
    labelAr: 'تفاصيل حركة المخزون',
    group: 'inventory',
    permissions: ['inventory.view'],
    parent: 'inventoryMovements',
  },

  documentReceiving: {
    labelAr: 'سندات الاستلام',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'dashboard',
  },
  documentReceivingNew: {
    labelAr: 'سند استلام جديد',
    group: 'documents',
    permissions: ['document.view', 'document.create'],
    parent: 'documentReceiving',
  },
  documentReceivingDetail: {
    labelAr: 'تفاصيل سند الاستلام',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'documentReceiving',
  },
  documentIssue: {
    labelAr: 'سندات الصرف',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'dashboard',
  },
  documentIssueNew: {
    labelAr: 'سند صرف جديد',
    group: 'documents',
    permissions: ['document.view', 'document.create'],
    parent: 'documentIssue',
  },
  documentIssueDetail: {
    labelAr: 'تفاصيل سند الصرف',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'documentIssue',
  },
  documentTransfer: {
    labelAr: 'سندات التحويل',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'dashboard',
  },
  documentTransferNew: {
    labelAr: 'سند تحويل جديد',
    group: 'documents',
    permissions: ['document.view', 'document.create'],
    parent: 'documentTransfer',
  },
  documentTransferDetail: {
    labelAr: 'تفاصيل سند التحويل',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'documentTransfer',
  },
  documentOpening: {
    labelAr: 'سندات الافتتاح',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'dashboard',
  },
  documentOpeningNew: {
    labelAr: 'سند فتح افتتاحي جديد',
    group: 'documents',
    permissions: ['document.view', 'document.create'],
    parent: 'documentOpening',
  },
  documentOpeningDetail: {
    labelAr: 'تفاصيل سند الفتح الافتتاحي',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'documentOpening',
  },
  documentReturn: {
    labelAr: 'سندات الإرجاع',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'dashboard',
  },
  documentReturnNew: {
    labelAr: 'سند إرجاع جديد',
    group: 'documents',
    permissions: ['document.view', 'document.create'],
    parent: 'documentReturn',
  },
  documentReturnDetail: {
    labelAr: 'تفاصيل سند الإرجاع',
    group: 'documents',
    permissions: ['document.view'],
    parent: 'documentReturn',
  },

  adjustments: {
    labelAr: 'سندات التسوية',
    group: 'adjustments',
    permissions: ['document.view'],
    parent: 'dashboard',
  },
  adjustmentNew: {
    labelAr: 'سند تسوية جديد',
    group: 'adjustments',
    permissions: ['document.view', 'document.create'],
    parent: 'adjustments',
  },
  adjustmentDetail: {
    labelAr: 'تفاصيل سند التسوية',
    group: 'adjustments',
    permissions: ['document.view'],
    parent: 'adjustments',
  },

  counts: {
    labelAr: 'جلسات الجرد',
    group: 'counts',
    permissions: ['count.view'],
    parent: 'dashboard',
  },
  countNew: {
    labelAr: 'جلسة جرد جديدة',
    group: 'counts',
    permissions: ['count.view', 'count.plan'],
    parent: 'counts',
  },
  countDetail: {
    labelAr: 'تفاصيل جلسة الجرد',
    group: 'counts',
    permissions: ['count.view'],
    parent: 'counts',
  },

  assets: {
    labelAr: 'سجل الأصول',
    group: 'assets-custody',
    permissions: ['asset.view'],
    parent: 'dashboard',
  },
  assetDetail: {
    labelAr: 'تفاصيل الأصل',
    group: 'assets-custody',
    permissions: ['asset.view'],
    parent: 'assets',
  },
  custodyPending: {
    labelAr: 'الأصول بانتظار التكليف',
    group: 'assets-custody',
    permissions: ['asset.view', 'custody.assign'],
    parent: 'assets',
  },
  custodyActive: {
    labelAr: 'العهد النشطة',
    group: 'assets-custody',
    permissions: ['asset.view'],
    parent: 'assets',
  },
  custodyDetail: {
    labelAr: 'تفاصيل العهدة',
    group: 'assets-custody',
    permissions: ['asset.view'],
    parent: 'custodyActive',
  },

  audit: {
    labelAr: 'سجل التدقيق',
    group: 'audit',
    permissions: ['audit.view'],
    parent: 'dashboard',
  },
  reports: {
    labelAr: 'التقارير',
    group: 'reports',
    permissions: ['report.view'],
    parent: 'dashboard',
  },

  adminUsers: {
    labelAr: 'المستخدمون',
    group: 'admin',
    permissions: ['admin.user.view'],
    parent: 'dashboard',
  },
  adminUserDetail: {
    labelAr: 'تفاصيل المستخدم',
    group: 'admin',
    permissions: ['admin.user.view'],
    parent: 'adminUsers',
  },
  adminRoles: {
    labelAr: 'الأدوار',
    group: 'admin',
    permissions: ['admin.role.view'],
    parent: 'dashboard',
  },
  adminRoleDetail: {
    labelAr: 'تفاصيل الدور',
    group: 'admin',
    permissions: ['admin.role.view'],
    parent: 'adminRoles',
  },

  devGallery: { labelAr: 'معرض المكونات', group: 'dev', devOnly: true, public: true },
  notFound: { labelAr: 'الصفحة غير موجودة', group: 'system', public: true },
} as const
