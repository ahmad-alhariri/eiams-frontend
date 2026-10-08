/**
 * Counterpart lookup types — handwritten contracts for the live backend
 * (D-INT-02 / ADR-0001).
 *
 * The wire is the live backend source of truth
 * (`Application/Abstractions/Recipients/ICounterpartResolver.cs` +
 * `Application/Counterparts/GetList/GetCounterpartsQuery.cs` +
 * `Web.Api/Controllers/Counterparts/GetCounterpartsController.cs` +
 * `Web.Api/Controllers/Counterparts/GetCounterpartByIdController.cs`).
 *
 * The four-quadrant `CounterpartType` (Employee/OrganizationalUnit/Site/
 * External) is the shared polymorphic reference for operational document and
 * custody write flows. The backend enforces `operation` + `type` compatibility
 * server-side (see `GetCounterpartsQueryValidator`).
 *
 * The previous typed shape came from the frozen generated snapshot
 * `operations['searchCounterparts']`, which described a record the backend
 * never produced (`displayName` on a discriminator object with no
 * `secondaryLabelAr`, under a `/counterparts/candidates` path the controller
 * does not own — the real route is `GET /counterparts`). That import was the
 * source of the `searchCounterparts` returning the previous `CounterpartOption`
 * reference in the test fixtures.
 */

/** Match backend `Domain/Common/PartyType` (the four counterpart kinds). */
export type CounterpartType = 'Employee' | 'OrganizationalUnit' | 'Site' | 'External'

/** Match backend `Domain/Common/OperationType` (subset the validator accepts). */
export type CounterpartOperation = 'Receiving' | 'Issue' | 'Transfer' | 'Return'

/**
 * `GET /counterparts` request query.
 *
 * `operation` is REQUIRED by `GetCounterpartsQueryValidator` (validator error:
 * "Operation must support counterpart selection."). The validator further
 * restricts `type` against `operation` (Receiving → External only;
 * Issue → Employee/OrganizationalUnit/Site only). The wire accepts the values
 * as strings; the contract carries the same strings on the C# side.
 *
 * `page` is one-based; the backend reads it through `PaginationQueryParameters`
 * (D-INT-02 §2 contract principles).
 */
export interface SearchCounterpartsQuery {
  readonly search?: string
  readonly operation: CounterpartOperation
  readonly type?: CounterpartType
  readonly page?: number
  readonly pageSize?: number
}

/**
 * A resolved counterpart reference for write flows. The two fields are the
 * minimum the polymorphic write surfaces need to re-bind on reload; the
 * resolution read fills `displayName` and `status`.
 */
export interface CounterpartReference {
  readonly type: CounterpartType
  readonly id: string
}

/**
 * `GET /counterparts` and `GET /counterparts/{type}/{counterpartId}` response.
 *
 * Mirrors `Application/Abstractions/Recipients/CounterpartResolution.cs`
 * exactly: type, id, displayName, secondaryLabelAr, status. The
 * `secondaryLabelAr` is the operation-specific hint the backend attaches
 * (job title for an Employee, location for a Site, etc.) — present when
 * the backend projects it, null otherwise.
 */
export interface CounterpartResolution {
  readonly type: CounterpartType
  readonly id: string
  readonly displayName: string
  readonly secondaryLabelAr?: string | null
  readonly status: 'Active' | 'Inactive'
}

/**
 * Per-call options for the write-flow counterpart selector.
 *
 * `operation` + `type` are required by the backend validator. Callers that do
 * not yet know which `type` the user will pick can pass `undefined` for `type`,
 * which the validator permits; the UI then re-queries when the user changes
 * the recipient type select.
 */
export interface CounterpartSearchOptions {
  readonly operation: CounterpartOperation
  readonly type?: CounterpartType
}

/** Map a counterpart status value to its Arabic UI label. */
export function counterpartStatusLabelAr(counterpart: CounterpartResolution): string {
  return counterpart.status === 'Inactive' ? 'غير نشط' : 'نشط'
}

/**
 * Returns a write-ready counterpart reference or null when the option is unusable.
 *
 * Mirrors `ICounterpartResolver.ValidateForWriteAsync` semantics at the client
 * edge: a missing selection is a validation error, an inactive one is a
 * remediation message, and only an Active counterpart ships a reference.
 */
export function validateCounterpartForWrite(
  counterpart: CounterpartResolution | undefined,
): { isValid: true; reference: CounterpartReference } | { isValid: false; messageAr: string } {
  if (!counterpart) {
    return { isValid: false, messageAr: 'اختر جهة مستلمة أو حائزة نشطة.' }
  }
  if (counterpart.status !== 'Active') {
    return {
      isValid: false,
      messageAr: 'الجهة المختارة غير نشطة. اختر جهة نشطة أخرى قبل المتابعة.',
    }
  }
  return { isValid: true, reference: { type: counterpart.type, id: counterpart.id } }
}
