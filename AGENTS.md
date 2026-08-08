# EIAMS — Frontend Agent Guide

**Enterprise Inventory & Asset Management System**
الهيئة العامة للرقابة والتفتيش — Syrian General Authority for Oversight and Inspection

---

## What Is This System

A government-grade **Document-Driven** inventory and asset management system. Every stock change (receiving, issuing, transferring, counting, adjusting) is driven by an official **document** with a signed paper copy. The system provides:

- Central material catalog with hierarchical classification (Domain → Category → Family → Material)
- Per-warehouse independent inventory with real-time balance tracking
- Full asset lifecycle management (acquisition → custody → transfer → disposal)
- Personal and operational custody tracking with complete history
- Immutable append-only ledgers for stock movements, custody changes, and audit logs
- Role-based access control (RBAC) with scope-based permissions (Enterprise / Site / Warehouse)
- RTL-first Arabic UI

### Core Architectural Concepts

**Document-Driven:** No direct balance edits. All inventory changes flow through `WarehouseDocument` → `StockMovement` → `InventoryBalance`.

**Spine + Petals:** `WarehouseDocument` (Spine) holds shared fields (status, dates, numbering). Extension tables (Petals) hold type-specific fields:

- `ReceivingInfo` — supplier, invoice
- `IssueTo` — recipient (polymorphic: Employee/OrgUnit/Site/External)
- `TransferInfo` — destination warehouse
- `InventoryAdjustment` — count-linked adjustment

**Document Lifecycle:** `Draft → Submitted → Posted → Reversed` (+ `Rejected → Draft`, `Cancelled` before posting only). WH_KEEPER creates/submits; WH_MGR posts.

**Immutable Ledgers:** `StockMovement`, `AuditLog`, `AuditLogEntry`, `CustodyHistory`, `AssetMovementHistory` — never updated or deleted.

**Balance = Computed:** `InventoryBalance.quantity` = cached sum of `StockMovement.quantity_delta`. Asset status (`InStock/Issued/InCustody/Disposed`) is derived via view from Custody + AssetMovementHistory.

**Polymorphic FKs:** `IssueTo.recipient_type + recipient_id` and `Custody.holder_type + holder_id` use application-layer validation (no DB FK constraint).

---

## Tech Stack

| Layer        | Technology                                                                     |
| ------------ | ------------------------------------------------------------------------------ |
| Framework    | React 19 + TypeScript + Vite 6                                                 |
| Styling      | TailwindCSS v4                                                                 |
| Routing      | React Router v7                                                                |
| Server State | TanStack Query v5                                                              |
| Client State | Zustand v5                                                                     |
| UI Library   | shadcn/ui (Base UI)                                              |
| Tables       | TanStack Table v8                                                              |
| Forms        | React Hook Form + Zod                                                          |
| HTTP         | Axios                                                                          |
| Icons        | Tabler Icons                                                                   |
| Charts       | Recharts                                                                       |
| Date         | Day.js                                                                         |
| File Upload  | react-dropzone                                                                 |
| PDF          | react-pdf                                                                      |
| Testing      | Vitest + Testing Library + MSW                                                 |
| API Types    |(Will be exported from Apidog OpenAPI ) |

---

## Architecture Style

Feature-Sliced Design with domain-driven modules:

```
src/
├── app/              # App shell, Router, Providers
├── modules/          # Domain modules (auth, catalog, warehouse, ...)
│   └── <domain>/
│       ├── components/
│       ├── hooks/
│       ├── services/
│       ├── store/
│       ├── pages/
│       └── types/
├── shared/           # Shared UI, hooks, services, utils, types
├── config/           # env, routes, permissions
└── main.tsx
```

### Domain Modules (12 total)

| Module             | Responsibility                                         |
| ------------------ | ------------------------------------------------------ |
| `auth/`            | Login, session, RBAC, protected routes                 |
| `organization/`    | Sites, org units, employees                            |
| `catalog/`         | Material domains, categories, families, materials, UOM |
| `warehouse/`       | Warehouses, capabilities, material settings            |
| `inventory/`       | Balance viewer, stock movement ledger                  |
| `receiving/`       | Receiving documents (Spine + ReceivingInfo petal)      |
| `issue/`           | Issue documents (Spine + IssueTo petal)                |
| `transfer/`        | Transfer documents (Spine + TransferInfo petal)        |
| `asset/`           | Asset registry, movement history                       |
| `custody/`         | Custody assignment, transfer, return, history          |
| `inventory-count/` | Count sessions, lines, variance                        |
| `adjustment/`      | Adjustment documents                                   |
| `reports/`         | Dashboards, KPIs, printable reports                    |

### Shared Layer Components

- **ui/** — Design system (Button, DataTable, Modal, Form/Input, Form/Select, Form/DatePicker, Badge, PageHeader)
- **layout/** — AppLayout, Sidebar (RTL, right side), Header
- **feedback/** — LoadingSpinner, ErrorBoundary, EmptyState
- **hooks/** — usePermission (RBAC gate), useDebounce, usePagination, useConfirm
- **services/** — api.client.ts (Axios instance with JWT interceptor), query.client.ts (TanStack Query config)

---

## Key Business Rules the UI Must Enforce

1. **Document workflow:** WH_KEEPER creates/submits; WH_MGR posts. UI must hide Post button for keepers, hide Submit for managers editing on behalf.
2. **Signed copy required:** Post button disabled until `attachment_type = SignedOriginal` is uploaded.
3. **Balance check:** Issue/Transfer documents must show available balance per line and block submission if insufficient.
4. **Asset-type materials:** When `material_kind = Asset` or `requires_asset_number = true`, line input requires asset serial/ID and creates individual Asset records on post.
5. **Negative stock:** Blocked in v1. UI must prevent issue quantity > balance.
6. **Warehouse Capability:** Before creating any document, verify the warehouse supports the material's domain for the operation type.
7. **Transfer atomic:** Single document, dual movement. UI shows source & destination warehouse selectors.
8. **Custody:** After issuing assets to an OrgUnit, show pending custody list for personal assignment.
9. **Count → Adjustment:** Count completion shows variance; user must create a separate Adjustment document to post changes.

---

## Conventions & Rules for AI

### Code & Naming

- **UI = Arabic, Code = English** — All labels, errors, notifications in Arabic. Variable names, types, files, functions in English.
- **No `any`** — TypeScript strict mode everywhere.
- **Files:** `kebab-case` for files, `PascalCase` for components, `camelCase` for hooks with `use` prefix.
- **Services:** `catalog.service.ts`, stores: `auth.store.ts`, types: `catalog.types.ts`.
- **Alias `@/`** — Always use `@/` imports, never relative paths.

### State Management

- **TanStack Query** for all server state (API data, mutations, cache invalidation).
- **Zustand** for UI state only (sidebar open/closed, active filters, modal visibility).
- **Never store server data in Zustand** — that's what TanStack Query is for.

### Forms

- **Every form** must use React Hook Form + Zod schema validation.
- Schema should match the API contract (auto-generated types from openapi-typescript).
- Show validation errors inline, in Arabic.

### Tables (TanStack Table v8)

- **Server-side pagination** for all data tables (sending page/index/offset to API).
- Sorting, filtering, and searching via query params.
- Column visibility and export deferred to v2.

### RBAC UI

- `usePermission()` hook gates every action button, menu item, and route.
- Never render an action the user can't perform.
- Permission keys match the .NET backend codes (e.g., `document.create`, `document.post`).

### Routing

- Lazy-load all domain pages via `React.lazy()` + `Suspense`.
- Protected routes check authentication + permission.
- Route constants in `config/routes.ts`.

### RTL

- Arabic-first layout: sidebar on the right, content on the left.
- Use TailwindCSS logical properties (`ps`/`pe`, `ms`/`me`, `s`/`e`) instead of `left`/`right`.
- `dir="rtl"` on the root element.

### Performance

- Lazy-load routes.
- TanStack Query stale times: master data (catalog, org) = 5min+, operational data (documents, balances) = 30s.
- Debounce search inputs (300ms).
- Avoid unnecessary re-renders with `React.memo` on heavy table rows.

### Error Handling

- Axios interceptor handles 401 → redirect to login.
- TanStack Query `onError` for toast notifications (in Arabic).
- Error boundaries per domain module.

### Testing

- Vitest for unit tests.
- Testing Library for component tests.
- MSW for API mocking.
- Test: form validation, permission gating, document lifecycle flows, error states.

---

## Verification Commands

```bash
npm run dev        # Dev server
npm run build      # Production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run test       # Vitest
npm run format     # Prettier
```

Always run `lint` and `typecheck` after making changes. Never commit code with type errors or lint warnings.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:970c3bf2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Agent Context Profiles

The managed Beads block is task-tracking guidance, not permission to override repository, user, or orchestrator instructions.

- **Conservative (default)**: Use `bd` for task tracking. Do not run git commits, git pushes, or Dolt remote sync unless explicitly asked. At handoff, report changed files, validation, and suggested next commands.
- **Minimal**: Keep tool instruction files as pointers to `bd prime`; use the same conservative git policy unless active instructions say otherwise.
- **Team-maintainer**: Only when the repository explicitly opts in, agents may close beads, run quality gates, commit, and push as part of session close. A current "do not commit" or "do not push" instruction still wins.

## Session Completion

This protocol applies when ending a Beads implementation workflow. It is subordinate to explicit user, repository, and orchestrator instructions.

1. **File issues for remaining work** - Create beads for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **Handle git/sync by active profile**:
   ```bash
   # Conservative/minimal/default: report status and proposed commands; wait for approval.
   git status

   # Team-maintainer opt-in only, unless current instructions forbid it:
   git pull --rebase
   bd dolt push
   git push
   git status
   ```
5. **Hand off** - Summarize changes, validation, issue status, and any blocked sync/commit/push step

**Critical rules:**
- Explicit user or orchestrator instructions override this Beads block.
- Do not commit or push without clear authority from the active profile or the current user request.
- If a required sync or push is blocked, stop and report the exact command and error.
<!-- END BEADS INTEGRATION -->


<!-- BEGIN BEADS CODEX SETUP: generated by bd setup codex -->
## Beads Issue Tracker

Use Beads (`bd`) for durable task tracking in repositories that include it. Use the `beads` skill at `.agents/skills/beads/SKILL.md` (project install) or `~/.agents/skills/beads/SKILL.md` (global install) for Beads workflow guidance, then use the `bd` CLI for issue operations.

### Quick Reference

```bash
bd ready                # Find available work
bd show <id>            # View issue details
bd update <id> --claim  # Claim work
bd close <id>           # Complete work
bd prime                # Refresh Beads context
```

### Rules

- Use `bd` for all task tracking; do not create markdown TODO lists.
- Run `bd prime` when Beads context is missing or stale. Codex 0.129.0+ can load Beads context automatically through native hooks; use `/hooks` to inspect or toggle them.
- Keep persistent project memory in Beads via `bd remember`; do not create ad hoc memory files.

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.
<!-- END BEADS CODEX SETUP -->
