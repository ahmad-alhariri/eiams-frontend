# EIAMS — Software Architecture Document (SAD)

> Status: target frontend architecture for EIAMS v1
>
> This document distinguishes the intended architecture from the repository's
> current foundation. It does not authorize untracked infrastructure work.

## 1. Purpose and authority

This SAD defines the frontend's architectural boundaries, integration approach,
and quality attributes. It is subordinate to the current Beads task, PRD, BDM,
ERD/schema, UI design, `AGENTS.md`, and the OpenAPI contract.

When these sources conflict, do not silently code around the difference. Record
the conflict in the appropriate source and obtain a decision.

## 2. Architecture goals

- Maintain document-driven and audit-safe inventory workflows.
- Keep domain features independent and easily testable.
- Make API contract drift visible during generation and CI validation.
- Provide Arabic-first RTL accessibility across desktop, tablet, and mobile.
- Separate server, UI, form, and navigation state.
- Reuse shared components rather than reimplement tables, dialogs, validation,
  or lifecycle controls per module.

## 3. System context

```text
Government users
      │ HTTPS + JWT
      ▼
React 19 single-page application
      │ typed REST requests
      ▼
ASP.NET Core API (/api/v1)
      │
      ▼
Domain services and PostgreSQL
```

The frontend is a policy-aware presentation layer. It must reflect permissions,
scope, lifecycle state, and client-side guards; the API remains the authoritative
enforcer of permissions, transitions, stock safety, and transactions.

## 4. Technology baseline

| Concern | Approved technology |
| --- | --- |
| UI runtime | React 19, TypeScript 6, Vite 8 |
| Styling | Tailwind CSS v4, CSS-first tokens |
| UI primitives | shadcn-generated Base UI primitives; Tabler icons |
| Routing | React Router v8 |
| Server state | TanStack Query v5 |
| UI-only state | Zustand v5 |
| Forms | React Hook Form and Zod |
| Tables | TanStack Table v9 |
| HTTP | Axios behind the generated/shared API layer |
| API contract | Apidog OpenAPI 3.0 → openapi-typescript → OpenAPI-Qraft |
| Tests | Vitest, Testing Library, MSW |

The implementation uses Base UI and Tabler icons. References to Mantine,
Radix-only primitives, or Lucide in older design documents are historical and
must not cause a second component system to be introduced.

## 5. Target project structure

```text
src/
  app/                 application providers, router, app-level composition
  config/              route, environment, permission constants
  modules/
    <domain>/
      components/      feature-specific presentation
      hooks/           feature-specific composition hooks
      services/        typed feature wrappers and invalidation policies
      store/           UI-only local stores, when justified
      pages/           route-level components
      types/           feature-local derived types
  shared/
    feedback/          loading, error, and empty-state primitives
    hooks/             reusable UI hooks
    layout/            application shell components
    services/          generated API and shared HTTP/query infrastructure
    types/             generated API types and shared types
    ui/                shared composed UI components
    utils/             pure shared utilities
location
```

## 6. Application composition

The application entry point composes providers in one stable location:

```text
StrictMode
  └─ QueryClientProvider
      └─ API/auth integration
          └─ RouterProvider
              └─ domain error boundaries and route content
                  └─ Toaster
```

The exact provider implementation is owned by the corresponding Beads
foundation tasks. Feature pages must not create their own query clients, HTTP
clients, router instances, or global toast providers.

## 7. Routing and authorization

- Define paths in `src/config/routes.ts`.
- Lazy-load domain pages using `React.lazy` and `Suspense`.
- A protected route checks authentication before rendering the application shell.
- Permission checks gate routes, navigation entries, menus, and action buttons.
- Scope-aware server responses are the data source; the client does not attempt
  to recreate an enterprise/site/warehouse authorization engine.
- Authentication hydration, token transport, active-scope selection, and
  cross-scope cache isolation follow D-AUTH-01 in
  `docs/authentication-session-scope-contract-decision.md`.
- The RTL shell places the sidebar on the inline start/right side, with a
  responsive drawer below tablet width.

## 8. State boundaries

| State category | Owner | Rule |
| --- | --- | --- |
| API data and mutations | TanStack Query | Cache server data here; invalidate from feature services. |
| Authentication/session UI | Auth integration plus minimal Zustand state | Do not duplicate profile or permission response data unnecessarily. |
| Sidebar, modal, active filters | Zustand or local component state | Use Zustand only for shared UI state. |
| Form input and validation | React Hook Form + Zod | Keep form state local to the form; map only contract-supported data. |
| Derived display state | Selector/computation | Do not persist values derivable from query or form data. |

Master data is expected to use a longer stale time than operational data;
operational balances and document lists require a short freshness window. Exact
query defaults belong in the TanStack Query configuration task.

## 9. API architecture

### 9.1 HTTP behavior

- Axios supplies JWT authorization and refresh behavior through one shared
  client/interceptor task.
- The access token is memory-only. The rotating refresh token is a
  browser-managed HttpOnly cookie and is never returned to or persisted by
  frontend JavaScript, as specified by D-AUTH-01.
- API failures are mapped to Arabic feedback at the shared query/error layer.
- `401` redirects through the authentication flow, not from arbitrary pages.
- Mutations that post or reverse documents must preserve the contract's
  idempotency requirements.

## 10. Feature module boundaries

| Module | Primary responsibility |
| --- | --- |
| auth | Login, session hydration, permissions, protected routes |
| organization | Sites, organizational units, employees |
| catalog | Domain/category/family/material/UOM master data |
| warehouse | Warehouses, capabilities, material settings |
| inventory | Read-only balances and stock movement ledger |
| receiving, issue, transfer, adjustment, opening balance | Document-type pages built on the shared document engine |
| asset | Registry, derived status, movement history |
| custody | Assignment, transfer, return, history |
| inventory-count | Count sessions and variance display |
| reports | Dashboard, reports, exports |
| admin/audit | User/role administration and audit inspection |

Document-type modules share the WarehouseDocument engine but own their petal
fields and business-specific presentation. A receiving form must not become a
copy-paste base for issue or transfer forms.

Adjustment is a deliberate shared-engine exception: its module uses the
Manager-owned `Draft -> Posted -> Reversed` lifecycle and must not compose the
generic Keeper Submit / Manager Post action bar. The authoritative matrix and
remaining API boundaries are in `docs/adjustment-workflow-decision.md`.

## 11. Shared UI architecture

The shared layer is responsible for reusable cross-domain patterns:

- DataTable with server pagination, sorting, filtering, selection, loading and
  empty states.
- PageHeader, ContentCard, StatusBadge, lifecycle action bar, and document
  timeline.
- RHF/Zod field bridge, AsyncSelect, DatePicker, FileDropzone, and confirmation
  dialog.
- `useDebounce`, `usePagination`, `useConfirm`, and permission hooks.
- Full-page loading, table skeleton, empty state, error boundary, and toast
  feedback.

DocumentTimeline consumes one immutable, contract-generated lifecycle-event
collection per document. It never manufactures history from current state or
AuditLog and distinguishes generic workflow events from the Adjustment
exception. The shared action bar consumes the same server-owned policy,
including Hidden/Disabled/Enabled presentation and explicit reason requirements.
See D-LIFE-01 in `docs/document-lifecycle-history-contract-decision.md`.

Each shared abstraction must be introduced by its Beads task before a feature
needs it. Feature code composes these building blocks; it does not clone them.

## 12. Quality attributes

### Security and audit

- Never render actions without the appropriate permission.
- Keep sensitive tokens out of UI state and route params.
- Never surface raw server error internals to users.
- Preserve read-only views for immutable ledgers and posted documents.
- Audit detail uses distinct contract-backed header and paginated field-diff
  reads. Sensitive values are redacted server-side before reaching query cache
  or UI state; see `docs/audit-detail-contract-decision.md`.

### Accessibility and RTL

- Root document direction is `rtl`; use logical Tailwind properties (`ps`,
  `pe`, `ms`, `me`, `start`, `end`) rather than physical left/right placement.
- Maintain visible focus, semantic labels, keyboard navigation, and ARIA live
  feedback.
- Meet the UI design contrast targets and responsive behavior.

### Performance

- Lazy-load pages at route boundaries.
- Debounce remote searches.
- Use server pagination for tables.
- Memoize only measured/high-cost list rows and avoid storing derived server
  state.

### Resilience

- Provide loading, error, and empty states for asynchronous views.
- Model partial failure independently where a page has multiple queries.
- Support retry where it is safe; never imply a posted document can be retried
  without the API's idempotency protections.

## 13. Testing architecture

- Unit tests cover pure utilities, validation, mapping functions, and permission
  predicates.
- Component tests cover shared primitives and feature forms with Testing Library.
- MSW handlers derive from the OpenAPI contract once the test harness task is
  complete.
- Integration tests cover lifecycle transitions, signed-copy gating, balance
  guards, scope/permission visibility, and error handling.
- Manual responsive and keyboard checks remain required for document workflows,
  large tables, modals, and RTL layouts.
