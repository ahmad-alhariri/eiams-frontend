/**
 * Arabic user-facing copy for backend error codes.
 *
 * WHY THIS FILE EXISTS. D-AUTH-01 and D-OAS-01 assumed the server supplies
 * Arabic (`ProblemDetails.titleAr` / `detailAr`). The real API does not: it
 * returns an English `message` alongside a machine code. Since the product is
 * Arabic-first and `SAD.md` forbids surfacing raw server internals, the mapping
 * is owned here, in the frontend, keyed by code.
 *
 * This deliberately inverts an approved decision and is recorded as such in
 * `docs/backend-contract-reconciliation.md` §5. The alternative — asking the API
 * to carry Arabic — would couple user-facing language to the API and still leave
 * the frontend unable to speak about a code it has not seen.
 *
 * Keys are UPPER_SNAKE_CASE because `normalizeWireErrorCode` reduces the
 * backend's code to that form before lookup.
 *
 * SECURITY. Anything authentication-related must be indistinguishable between
 * "no such user" and "wrong password". The API returns a distinct
 * `404 USERS_NOT_FOUND` for an unknown username, which is a username-enumeration
 * oracle, so that code resolves to the same neutral copy as a generic miss.
 */

export interface ArabicErrorCopy {
  titleAr: string
  detailAr: string | null
}

const AUTH: Readonly<Record<string, ArabicErrorCopy>> = {
  AUTHENTICATION_REQUIRED: {
    titleAr: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.',
    detailAr: null,
  },
  AUTHORIZATION_FORBIDDEN: {
    titleAr: 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.',
    detailAr: null,
  },
  REFRESH_TOKEN_ORIGIN_REJECTED: {
    titleAr: 'تعذر إتمام الطلب من هذا المصدر.',
    detailAr: 'افتح التطبيق من عنوانه المعتمد ثم حاول مجدداً.',
  },
  USERS_INVALID_REFRESH_TOKEN: {
    titleAr: 'انتهت الجلسة. يرجى تسجيل الدخول مجدداً.',
    detailAr: null,
  },
  USERS_SUSPENDED: {
    titleAr: 'الحساب موقوف. راجع مسؤول النظام لتفعيله.',
    detailAr: null,
  },
  USERS_ADMINISTRATION_REQUIRES_ENTERPRISE_SCOPE: {
    titleAr: 'إدارة المستخدمين تتطلب نطاق المؤسسة.',
    detailAr: null,
  },
  // Deliberately identical to a generic miss: the API's distinct 404 must not
  // become a confirmation that a username exists.
  USERS_NOT_FOUND: {
    titleAr: 'لم يتم العثور على البيانات المطلوبة.',
    detailAr: null,
  },
  USERS_NOT_FOUND_BY_EMAIL: {
    titleAr: 'لم يتم العثور على البيانات المطلوبة.',
    detailAr: null,
  },
  USERS_UNAUTHORIZED: {
    titleAr: 'لا تملك الصلاحية اللازمة لتنفيذ هذا الإجراء.',
    detailAr: null,
  },
}

const REQUEST: Readonly<Record<string, ArabicErrorCopy>> = {
  REQUEST_INVALID: {
    titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
    detailAr: null,
  },
  REQUEST_VALIDATION_FAILED: {
    titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
    detailAr: null,
  },
  VALIDATION_GENERAL: {
    titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
    detailAr: null,
  },
  UNPROCESSABLE_ENTITY: {
    titleAr: 'تعذر تنفيذ الطلب. راجع البيانات المدخلة.',
    detailAr: null,
  },
  METHOD_NOT_ALLOWED: {
    titleAr: 'طريقة الطلب غير مدعومة.',
    detailAr: null,
  },
  REQUEST_BODY_TOO_LARGE: {
    titleAr: 'حجم الملف يتجاوز الحد المسموح.',
    detailAr: null,
  },
  UNSUPPORTED_MEDIA_TYPE: {
    titleAr: 'نوع الملف غير مدعوم.',
    detailAr: null,
  },
  RESOURCE_NOT_FOUND: {
    titleAr: 'لم يتم العثور على البيانات المطلوبة.',
    detailAr: null,
  },
  RESOURCE_CONFLICT: {
    titleAr: 'تعارض في البيانات. راجع القيم المدخلة.',
    detailAr: null,
  },
  // Row-version conflicts share one message on purpose: a stale version and a
  // genuine state conflict are both "reload and look again", and distinguishing
  // them would leak whether another user's write actually landed.
  CUSTODIES_ROW_VERSION_MISMATCH: {
    titleAr: 'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    detailAr: null,
  },
  INVENTORY_COUNTS_ROW_VERSION_MISMATCH: {
    titleAr: 'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    detailAr: null,
  },
  USERS_EMAIL_NOT_UNIQUE: {
    titleAr: 'البريد الإلكتروني مستخدم مسبقاً.',
    detailAr: null,
  },
  USERS_USERNAME_NOT_UNIQUE: {
    titleAr: 'اسم المستخدم مستخدم مسبقاً.',
    detailAr: null,
  },
  RATE_LIMIT_EXCEEDED: {
    titleAr: 'توجد طلبات كثيرة. حاول مجدداً بعد قليل.',
    detailAr: null,
  },
  SERVER_FAILURE: {
    titleAr: 'تعذر إتمام العملية حالياً.',
    detailAr: 'حاول مجدداً بعد قليل، أو تواصل مع الدعم الفني إذا استمرت المشكلة.',
  },
  SERVICE_UNAVAILABLE: {
    titleAr: 'الخدمة غير متاحة مؤقتاً. حاول مجدداً بعد قليل.',
    detailAr: null,
  },
  REQUEST_TIMEOUT: {
    titleAr: 'استغرق الطلب وقتاً طويلاً. حاول مجدداً.',
    detailAr: null,
  },
  REQUEST_FAILED: {
    titleAr: 'تعذر إتمام الطلب.',
    detailAr: null,
  },
}

const DOMAIN: Readonly<Record<string, ArabicErrorCopy>> = {
  // --- Uniqueness conflicts. The API raises these as a 409 code on the whole
  // request, NOT as a per-field error, so the message is a dialog-level title
  // and no `fieldErrors` entry is produced. Each key is the normalized form of
  // the dotted code in the matching `*Errors.cs`.
  MATERIAL_DOMAINS_CODE_NOT_UNIQUE: {
    titleAr: 'رمز المجال مستخدم مسبقاً.',
    detailAr: null,
  },
  SITES_CODE_NOT_UNIQUE: {
    titleAr: 'رمز الموقع مستخدم مسبقاً.',
    detailAr: null,
  },
  WAREHOUSES_CODE_NOT_UNIQUE: {
    titleAr: 'رمز المستودع مستخدم مسبقاً.',
    detailAr: null,
  },
  ROLES_NAME_NOT_UNIQUE: {
    titleAr: 'اسم الدور مستخدم مسبقاً.',
    detailAr: null,
  },
  // `Permissions.NotFound` — the requested permission id is not in the
  // catalog, so the submitted matrix cannot be saved as-is.
  PERMISSIONS_NOT_FOUND: {
    titleAr: 'إحدى الصلاحيات غير متاحة.',
    detailAr: 'حدّث قائمة الصلاحيات ثم أعد المحاولة.',
  },
  ROLES_BUILT_IN_ROLE_IMMUTABLE: {
    titleAr: 'لا يمكن تعديل الأدوار المدمجة في النظام.',
    detailAr: null,
  },
  ROLES_ORGANIZATIONAL_UNIT_ASSIGNMENT_NOT_ALLOWED: {
    titleAr: 'لا يمكن إسناد هذا الدور إلى وحدة تنظيمية.',
    detailAr: null,
  },
  ROLES_ALLOWED_SCOPE_TYPES_CONFLICT_WITH_ASSIGNMENTS: {
    titleAr: 'أنواع النطاق المسموحة للدور تتعارض مع إسناداته الحالية.',
    detailAr: 'راجع إسنادات الدور ثم أعد المحاولة.',
  },
  USERS_SELF_SUSPENSION_NOT_ALLOWED: {
    titleAr: 'لا يمكنك إيقاف حسابك بنفسك.',
    detailAr: null,
  },
  // --- Role grants. The API raises these on the grant as a whole, so there is
  // no field for the message to land on.
  USER_ROLE_SCOPES_ROW_VERSION_MISMATCH: {
    titleAr: 'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_RESOURCE_OUTSIDE_SCOPE: {
    titleAr: 'المورد المطلوب خارج نطاق صلاحيتك.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_ASSIGNMENT_OUTSIDE_ADMINISTRATOR_SCOPE: {
    titleAr: 'الإسناد المطلوب خارج نطاق صلاحيتك الإدارية.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_ROLE_NOT_ALLOWED_AT_SCOPE: {
    titleAr: 'لا يمكن إسناد هذا الدور في النطاق المحدد.',
    detailAr: 'اختر دوراً مسموحاً في هذا النطاق.',
  },
  USER_ROLE_SCOPES_ALREADY_GRANTED: {
    titleAr: 'هذا الدور ممنوح بالفعل في هذا النطاق.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_ORGANIZATIONAL_UNIT_ASSIGNMENT_NOT_ALLOWED: {
    titleAr: 'لا يمكن إسناد وحدة تنظيمية كنطاق للمستخدم.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_SCOPE_ID_REQUIRED: {
    titleAr: 'معرّف النطاق مطلوب لإسنادات الموقع والمستودع.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_SCOPE_ID_MUST_BE_NULL: {
    titleAr: 'لا يمكن تحديد نطاق مع إسناد على مستوى المؤسسة.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_SCOPE_TARGET_INACTIVE: {
    titleAr: 'النطاق المحدّد غير نشط.',
    detailAr: null,
  },
  USER_ROLE_SCOPES_CANNOT_REMOVE_LAST_ENTERPRISE_ADMINISTRATOR: {
    titleAr: 'لا يمكن إزالة آخر إسناد لمدير المؤسسة.',
    detailAr: null,
  },
  USERS_EMPLOYEE_ALREADY_LINKED: {
    titleAr: 'هذا الموظف مرتبط بحساب مستخدم آخر.',
    detailAr: null,
  },
  WAREHOUSES_SITE_INACTIVE: {
    titleAr: 'الموقع المحدّد غير نشط.',
    detailAr: null,
  },
  WAREHOUSE_CAPABILITY_OPERATIONS_OPERATION_NOT_GRANTED: {
    titleAr: 'إحدى العمليات غير مسموح بها في هذه القدرة.',
    detailAr: 'أزل العملية من التحديد، أو راجع قدرات المستودع.',
  },
  WAREHOUSE_CAPABILITY_OPERATIONS_ALREADY_GRANTED: {
    titleAr: 'هذه العملية ممنوحة بالفعل في القدرة.',
    detailAr: null,
  },
  WAREHOUSE_CAPABILITY_OPERATIONS_CAPABILITY_INACTIVE: {
    titleAr: 'يمكن تعديل القدرات النشطة فقط.',
    detailAr: null,
  },
  TRANSFER_POLICIES_CROSS_GOVERNORATE_BLOCKED: {
    titleAr: 'التحويل بين محافظتين مختلفتين ممنوع وفق السياسة.',
    detailAr: null,
  },
  TRANSFER_POLICIES_GOVERNORATE_REQUIRED: {
    titleAr: 'يجب تحديد رمز المحافظة لكلا الموقعين قبل تقييم سياسة التحويل.',
    detailAr: null,
  },
  WAREHOUSES_ORGANIZATIONAL_UNIT_INACTIVE: {
    titleAr: 'الوحدة التنظيمية المحدّدة غير نشطة.',
    detailAr: null,
  },
  WAREHOUSES_ORGANIZATIONAL_UNIT_IN_DIFFERENT_SITE: {
    titleAr: 'الوحدة التنظيمية المحدّدة لا تتبع الموقع المحدّد.',
    detailAr: null,
  },
  WAREHOUSES_CANNOT_HOLD_STOCK: {
    titleAr: 'لا يمكن لهذا المستودع الاحتفاظ بالمخزون.',
    detailAr: null,
  },
  SITES_GOVERNORATE_CODE_INVALID: {
    titleAr: 'رمز المحافظة غير صالح.',
    detailAr: null,
  },
  DOCUMENT_SEQUENCES_INVALID_DOCUMENT_TYPE: {
    titleAr: 'نوع المستند غير صالح.',
    detailAr: null,
  },
  DOCUMENT_SEQUENCES_REFERENCE_NUMBER_TOO_LONG: {
    titleAr: 'الرقم المرجعي أطول من الحد المسموح.',
    detailAr: null,
  },
  DOCUMENT_SEQUENCES_SITE_CODE_CONTAINS_SEPARATOR: {
    titleAr: 'رمز الموقع يحتوي على فاصل غير مسموح.',
    detailAr: null,
  },
  DOCUMENT_SEQUENCES_SITE_INACTIVE: {
    titleAr: 'الموقع المحدّد غير نشط.',
    detailAr: null,
  },
  // --- Opening balances. `AlreadyInitialized` is the recurring one: it fires
  // whenever a warehouse/material pair already has stock history.
  OPENING_DOCUMENTS_ALREADY_INITIALIZED: {
    titleAr: 'سبق تهيئة الرصيد الافتتاحي لهذا المستودع.',
    detailAr: 'استخدم مستند تسوية لتصحيح الرصيد.',
  },
  OPENING_DOCUMENTS_DUPLICATE_MATERIAL: {
    titleAr: 'لا يمكن تكرار نفس المادة في مستند الافتتاح.',
    detailAr: null,
  },
  OPENING_DOCUMENTS_CORRECTION_REQUIRES_ADJUSTMENT: {
    titleAr: 'تصحيح الرصيد الافتتاحي يتم عبر مستند تسوية.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_ROW_VERSION_MISMATCH: {
    titleAr: 'تغيرت البيانات من قبل مستخدم آخر. حدّث الصفحة ثم أعد المحاولة.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_INVALID_TRANSITION: {
    titleAr: 'لا يمكن نقل المستند إلى هذه الحالة.',
    detailAr: 'حدّث الصفحة ثم أعد المحاولة.',
  },
  WAREHOUSE_DOCUMENTS_NOT_EDITABLE: {
    titleAr: 'لا يمكن تعديل المستند إلا في حالة المسودة.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_SIGNED_COPY_REQUIRED: {
    titleAr: 'يجب إرفاق النسخة الموقعة قبل الترحيل.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_PAPER_REFERENCE_REQUIRED: {
    titleAr: 'يجب إدخال رقم المستند الورقي وسنته قبل التقديم.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_LINES_REQUIRED: {
    titleAr: 'يجب إضافة بند واحد على الأقل قبل التقديم.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_ALREADY_REVERSED: {
    titleAr: 'سبق التراجع عن هذا المستند.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_NOT_ELIGIBLE_FOR_REVERSAL: {
    titleAr: 'لا يمكن التراجع عن هذا المستند في حالته الحالية.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_REVERSAL_LINE_MISMATCH: {
    titleAr: 'بنود سند التراجع لا تطابق بنود المستند الأصلي.',
    detailAr: null,
  },
  WAREHOUSE_DOCUMENTS_REVERSAL_LINES_IMMUTABLE: {
    titleAr: 'بنود سند التراجع غير قابلة للتعديل.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_SIGNED_ORIGINAL_ALREADY_EXISTS: {
    titleAr: 'يوجد بالفعل مرفق نسخة موقعة نشطة لهذا المستند.',
    detailAr: 'أرشف النسخة الموقعة الحالية ثم أعد المحاولة.',
  },
  DOCUMENT_ATTACHMENTS_ARCHIVED_CANNOT_BE_REMOVED: {
    titleAr: 'لا يمكن حذف نسخة موقعة مؤرشفة.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_ALREADY_ARCHIVED: {
    titleAr: 'المرفق مؤرشف مسبقاً.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_FILE_TOO_LARGE: {
    titleAr: 'حجم الملف يتجاوز الحد المسموح.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_FILE_EMPTY: {
    titleAr: 'الملف فارغ.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_MIME_TYPE_NOT_ALLOWED: {
    titleAr: 'نوع الملف غير مسموح.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_FILE_SIGNATURE_MISMATCH: {
    titleAr: 'محتوى الملف لا يطابق نوعه المعلن.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_MALWARE_SCAN_REJECTED: {
    titleAr: 'لم يجتز الملف الفحص الأمني.',
    detailAr: 'اختر ملفاً آخر ثم حاول مجدداً.',
  },
  DOCUMENT_ATTACHMENTS_MALWARE_SCAN_REQUIRED: {
    titleAr: 'المرفق غير متاح حتى يجتاز الفحص الأمني.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_MALWARE_SCANNER_UNAVAILABLE: {
    titleAr: 'خدمة الفحص الأمني غير متاحة مؤقتاً.',
    detailAr: 'حاول مجدداً بعد قليل.',
  },
  DOCUMENT_ATTACHMENTS_NOT_EDITABLE: {
    titleAr: 'لا يمكن إرفاح أو حذف المرفقات إلا في حالة المسودة.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_STORAGE_FAILURE: {
    titleAr: 'تعذر حفظ الملف.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_INVALID_REPLACEMENT: {
    titleAr: 'لا يمكن استبدال نسخة موقيعتها بنفسها.',
    detailAr: null,
  },
  DOCUMENT_ATTACHMENTS_ONLY_SIGNED_ORIGINAL_CAN_BE_ARCHIVED: {
    titleAr: 'يمكن أرشفة النسخة الموقعة فقط.',
    detailAr: null,
  },
  CUSTODIES_NOT_ACTIVE: { titleAr: 'العهدة غير نشطة.', detailAr: null },
  CUSTODIES_ACTIVE_CUSTODY_EXISTS: {
    titleAr: 'توجد عهدة نشطة لهذه الوحدة بالفعل.',
    detailAr: null,
  },
  CUSTODIES_HOLDER_NOT_FOUND: { titleAr: 'لم يتم العثور على الجهة المحددة.', detailAr: null },
  CUSTODIES_HOLDER_INACTIVE: { titleAr: 'الجهة المحددة غير نشطة.', detailAr: null },
  CUSTODIES_NO_ACTIVE_CUSTODY: { titleAr: 'لا توجد عهدة نشطة لهذه الوحدة.', detailAr: null },
  INVENTORY_ADJUSTMENTS_ALREADY_EXISTS_FOR_COUNT: {
    titleAr: 'توجد سند تسوية مرتبط بهذه الجرد.',
    detailAr: null,
  },
  INVENTORY_COUNTS_POSTING_BLOCKED: {
    titleAr: 'لا يمكن ترحيل سند التسوية حالياً.',
    detailAr: null,
  },
  INVENTORY_COUNTS_ACTUALS_INCOMPLETE: {
    titleAr: 'لم تكتمل الكميات الفعلية للجرد بعد.',
    detailAr: null,
  },
  INVENTORY_COUNTS_ANOTHER_COUNT_IN_PROGRESS: {
    titleAr: 'توجد جلسة جرد جارية بالفعل.',
    detailAr: null,
  },
  DISPOSALS_ALREADY_PENDING: { titleAr: 'توجد عملية إعدام معلّقة لهذا الأصل.', detailAr: null },
  DISPOSALS_ASSET_ALREADY_DISPOSED: { titleAr: 'الأصل مستبعد مسبقاً.', detailAr: null },
  DISPOSALS_ASSET_STATE_CHANGED: {
    titleAr: 'تغيّرت حالة الأصل. حدّث الصفحة ثم أعد المحاولة.',
    detailAr: null,
  },
  DOCUMENT_LINE_ASSET_SELECTIONS_ASSET_NOT_IN_STOCK: {
    titleAr: 'أحد الأصول المختارة ليس في المخزون.',
    detailAr: null,
  },
  DOCUMENT_LINE_ASSET_SELECTIONS_COUNT_MISMATCH: {
    titleAr: 'عدد الأصول المختارة لا يطابق الكمية المدخلة.',
    detailAr: null,
  },
  DOCUMENT_LINE_ASSET_SELECTIONS_DUPLICATE: {
    titleAr: 'تم اختيار الأصل نفسه أكثر من مرة.',
    detailAr: null,
  },
}

const ALL: Readonly<Record<string, ArabicErrorCopy>> = { ...REQUEST, ...AUTH, ...DOMAIN }

/** Arabic copy for a normalized wire code, or null when the code is unmapped. */
export function arabicCopyForCode(code: string | null): ArabicErrorCopy | null {
  if (code === null) {
    return null
  }
  return ALL[code] ?? null
}

/** Every code this module can speak, for the drift guard. */
export const KNOWN_ERROR_CODES: readonly string[] = Object.keys(ALL).sort()
