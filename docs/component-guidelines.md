# EIAMS — Component Guidelines

> Status: frontend implementation standard
>
> Purpose: prevent duplicated infrastructure and keep EIAMS Arabic-first, RTL,
> accessible, and contract-driven.

## 1. Core rule: search, compose, then create

Before adding a component, search `src/shared/ui`, `src/shared`, and the target
feature module. Extend an existing abstraction when it already owns the
behavior. Creating a second table, confirmation dialog, field wrapper, or API
control for the same behavior is a defect.

Creation order:

```text
Base UI primitive → shared composed component → feature component → page
```

- Base primitives are generated into `src/shared/ui` and are configured by
  `components.json`.
- Cross-domain EIAMS patterns belong in `src/shared`.
- A domain-only control belongs in `src/modules/<domain>/components`.
- A route page composes components; it does not own reusable business or UI
  infrastructure.

## 2. Current reusable inventory

| Need | Reuse |
| --- | --- |
| Actions | `Button` and its variants/sizes |
| Inputs | `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `DatePicker` |
| Overlays | `Dialog`, `AlertDialog`, `ConfirmDialog`, `Popover`, `Toast` |
| Surfaces | `Card`, `Badge`, `Skeleton` |
| Asynchronous content | `FullPageSpinner`, `TableSkeleton`, `EmptyState`, `ErrorBoundary` |
| Styling composition | `cn()` from `src/shared/utils/class-names.ts` |
| Contract typing | generated API types and generated service surface |

Delivered shared composed components (all with unit tests + `/dev/gallery` demos):

| Component | Location | Notes |
| --- | --- | --- |
| `StatusBadge` | `src/shared/feedback/status-badge.tsx` | Entity-aware (document/adjustment/asset/custody/inventory-count/record/user); unknown values render «غير معروف» outline |
| `PageHeader`, `ContentCard` | `src/shared/layout/page-header.tsx`, `content-card.tsx` | Page titles/actions and content surfaces |
| `ConfirmDialog` + `useConfirm` | `src/shared/ui/confirm-dialog.tsx`, `src/shared/hooks/use-confirm.tsx` | Optional mandatory reason; busy state blocks close |
| RHF/Zod form bridge | `src/shared/forms/form.tsx`, `server-errors.ts` | Form/Field/Control/Message + `setFormServerErrors` for `FieldError[]` |
| `AsyncSelect` | `src/shared/ui/async-select.tsx` | Debounced remote search; panel opens only when results publish; keyboard-safe |
| `FileDropzone` | `src/shared/feedback/file-dropzone.tsx` | `DROPZONE_ACCEPT`, `DROPZONE_MAX_SIZE_BYTES` (5 MB); mirrors upload contract |
| `DataTable` | `src/shared/ui/data-table.tsx` | TanStack Table v9 (`dataTableFeatures`), sorting/selection, states, sticky header |
| `DataTableServer` + `ServerPaginationControls` | `src/shared/ui/data-table-server.tsx`, `data-table-server-controls.tsx` | Server pagination, page size, debounced search, Arabic range text |
| Entity selector adapters | `src/shared/selectors/` | Scope-READY adapters (warehouse/employee/org-unit/site/material); loaders injected by parents |
| `AttachmentPanel` | `src/shared/documents/attachment-panel.tsx` | Parent-owned uploads; gate row strictly from `DocumentPolicy.signedOriginalSatisfied` (D-ATT-01) |
| `DocumentTimeline` | `src/shared/documents/document-timeline.tsx` | Renders server lifecycle events only (D-LIFE-01) |
| `LifecycleActionBar` | `src/shared/documents/lifecycle-action-bar.tsx` | Policy-driven actions (Hidden/Disabled/Enabled), confirm + reason, busy mutex |

Remaining planned (not yet shared): common UI hooks such as `usePermission`.

## 3. Component responsibilities

### 3.1 Primitive components

Primitives provide visual/interaction mechanics only. They:

- accept standard props and `className` where appropriate;
- expose accessible Base UI behavior;
- use documented tokens and logical RTL classes;
- do not call APIs, inspect permissions, or contain domain rules.

Do not fork a primitive to change a label, a status, or one page's layout.
Compose it instead.

### 3.2 Shared composed components

Shared components encode repeated EIAMS conventions. Examples include a status
badge mapping, a server-paginated table, or a document attachment panel. They
may depend on primitives and shared hooks, but never on a domain module.

Public props must be narrowly typed, documented through their TypeScript API,
and stable enough for cross-module use. Keep domain data generic where possible;
pass renderers/column definitions rather than creating one global table for all
entities.

### 3.3 Feature components

Feature components render a bounded-context use case. They may depend on
shared components, feature hooks, and feature services. They must not import
another feature's internal components or service implementation.

Put non-visual orchestration in a hook or service when it would make the
component hard to test or reuse.

### 3.4 Pages

Pages bind a route to a feature composition. A page owns route parameters and
layout placement, then delegates data and presentation work. Keep pages small:
large inline forms, lifecycle branching, and table definitions are signals to
extract focused components/hooks.

## 4. Naming and API design

- Files use kebab-case; React components use PascalCase; hooks start with `use`.
- Use explicit prop interfaces and strong contract-derived types. Never use
  `any`.
- Prefer controlled inputs where feature state needs to coordinate with a form.
- Expose events as `onChange`, `onOpenChange`, `onConfirm`, and similarly clear
  semantic callbacks.
- Use `children` for composition instead of a wide collection of content props.
- Avoid boolean-prop explosions. A discriminated variant is preferable when the
  visual or behavioral modes are genuinely distinct.

## 5. RTL and localization

- All user-visible strings, labels, errors, notifications, and empty states are
  Arabic.
- Keep code identifiers, file names, API fields, and types in English.
- Use `ps`/`pe`, `ms`/`me`, `start`/`end`, `text-start`, and RTL-aware icon
  placement. Do not encode physical left/right positioning for an EIAMS layout.
- Directional icons require explicit RTL handling where the icon library does
  not mirror them automatically.
- Number, date, and currency formatting must follow the relevant page's Arabic
  presentation requirements; do not format values with scattered string logic.

## 6. Accessibility baseline

Every interactive component must provide:

- keyboard access and a visible focus state;
- an accessible name for icon-only controls;
- correct native element or appropriate ARIA role;
- invalid/error semantics for form fields;
- sufficient contrast and non-color state cues;
- appropriate live feedback for asynchronous changes;
- touch targets consistent with the design system.

Dialogs must have title/description relationships and Escape handling through
the existing primitive. Tables must retain semantic headers and practical
keyboard behavior. Never hide a required control solely because it is difficult
to make accessible; use an accessible alternative design.

## 7. Forms and validation

All feature forms use React Hook Form plus Zod. The schema mirrors the OpenAPI
request DTO; it must not invent unsupported fields or enum values.

When the shared RHF/Zod field bridge is available, use it for label, control,
description, and inline Arabic message behavior. Until then, do not create a
second competing form abstraction in a feature: complete the shared task first.

Forms must support:

- initial/loading, disabled, read-only, and submitting states;
- inline Arabic validation and server-side error display;
- keyboard operation and focus on actionable invalid fields;
- contract-level concurrency/version fields where required;
- lifecycle-state read-only behavior for non-Draft documents.

## 8. Data tables

All operational list views use the shared server-side DataTable once available.
The table owns generic mechanics; the feature supplies typed column definitions,
query parameters, and row actions.

Minimum behavior:

- server pagination, sorting, filtering, and debounced remote search;
- loading skeleton, empty state, error state, and retry path;
- accessible column headers and row/action controls;
- responsive horizontal overflow or intentionally hidden lower-priority columns;
- selection/bulk actions only where the API and permissions support them.

Do not put API paging math, a local copy of server data, or a hand-rolled table
inside a page.

## 9. Dialogs, destructive actions, and feedback

- Use `ConfirmDialog` for destructive or consequential actions.
- Require a reason where the contract/business workflow requires one, such as a
  rejection or cancellation.
- Mutations show loading, success, and Arabic error feedback through the shared
  toast system.
- Error messages must explain the next action without exposing raw API payloads.
- The feature must prevent duplicate submissions while a mutation is pending.

## 10. Document workflow UI

Document screens compose shared document infrastructure and type-specific petal
sections. They must:

- show the document status through a shared StatusBadge;
- render only Draft as editable;
- use permissions and state to decide whether Submit, Post, Reject, Cancel, or
  Reverse are visible;
- prevent keeper access to Post and manager access to keeper-only submission in
  accordance with separation of duties;
- display signed-original attachment state before generic Submit/Post or
  Adjustment Post; lock attachment controls outside the mutable state defined
  in `docs/signed-original-gate-decision.md`;
- display available balance per issue/transfer line;
- avoid direct inventory adjustment UI outside an approved document workflow.

The component layer cannot replace server-side state validation. It provides a
clear and safe affordance for the canonical workflow.

## 11. API and state integration

- Components do not call `fetch`, create Axios instances, or encode endpoint
  URLs.
- Feature hooks/services call the generated API layer and manage invalidation.
- TanStack Query owns server state; Zustand is only for UI state that cannot be
  derived from route, query, or form state.
- Keep loading/error/empty behavior near the query boundary, not duplicated in
  every child component.
- Do not pass server data through deep prop chains when a focused feature hook
  or composition boundary is clearer.

## 12. Performance rules

- Lazy-load route pages, not tiny shared primitives.
- Debounce remote search at the input/query boundary.
- Use server pagination for data lists.
- Use `React.memo` only for measured, expensive repeat rows with stable props.
- Avoid effects that mirror props into local state unless there is a documented
  user-editing reason.

## 13. Component test expectations

At the component level, test the behavior owned by the component:

| Component type | Required evidence |
| --- | --- |
| Primitive | Keyboard/focus, ARIA, variant and disabled behavior |
| Form component | Arabic validation, submit state, invalid server feedback |
| Table | Loading, empty, error, pagination/sort callbacks, accessible headers |
| Lifecycle action bar | Permission and status visibility, signed-copy/balance gates |
| Dialog | Focus/keyboard behavior, cancellation, reason requirement |
| Feature screen | Contract-backed loading/success/error path via MSW |

The Vitest/MSW harness must be completed before introducing isolated,
incompatible test setup in a feature.

## 14. Review checklist

Before considering a component complete, verify:

- an existing primitive/shared component was searched and reused;
- its module ownership is correct;
- no API or business logic is hidden in a purely visual component;
- tokens and RTL logical properties are used;
- loading, error, empty, disabled, and read-only states are intentional;
- Arabic copy and accessibility are complete;
- API payloads and enums come from the contract;
- tests cover the component's owned behavior.
