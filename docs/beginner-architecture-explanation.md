# EIAMS Frontend Beginner Architecture Explanation

This guide explains the current frontend codebase as it exists today. It is written for a beginner who knows basic JavaScript and React, but is still learning how real production frontend applications are organized.

The most important idea to keep in mind is this:

```text
EIAMS is not just a React app with screens.
It is a guarded application shell for a government inventory system.
The shell already owns startup, routing, authentication, permissions, layout,
API communication, query caching, forms, shared UI, and generated API types.
Business modules are intended to plug into that shell route by route.
```

At the moment, the implemented frontend includes the foundation, authentication flow, route registry, shared layout, shared UI primitives, generated API types, testing setup, and a development component gallery. Many domain routes are declared, but most business module pages are not wired yet.

---

## 1. What Is This Application?

EIAMS means Enterprise Inventory & Asset Management System. It is a frontend for a document-driven inventory and asset management product used by the Syrian General Authority for Oversight and Inspection.

The business problem is inventory control in an official environment. Stock is not supposed to change because someone directly edits a number. Instead, stock changes through formal documents such as receiving, issuing, transfer, return, opening balance, count, and adjustment documents.

The frontend is responsible for:

- Showing Arabic RTL screens.
- Routing users to the correct pages.
- Protecting routes based on login status, selected work scope, and permissions.
- Rendering forms, tables, layout, loading states, and error states.
- Calling the backend API through a typed service layer.
- Keeping server data in TanStack Query.
- Keeping small UI or lifecycle state in Zustand.
- Using OpenAPI-generated TypeScript types so frontend requests match the backend contract.

The backend is responsible for the real business enforcement: permissions, posting documents, balance updates, immutable ledgers, audit logs, and database writes.

Simple architecture picture:

```text
User
  |
  v
Browser
  |
  v
index.html
  |
  v
src/main.tsx
  |
  v
AppProviders
  |
  v
App
  |
  v
useSessionHydration
  |
  v
AppRouter
  |
  v
Route guards
  |
  v
AppLayout or standalone auth page
  |
  v
Page component
  |
  v
Hooks
  |
  v
Services
  |
  v
shared/services/api.client.ts
  |
  v
Backend API
  |
  v
Database
```

---

## 2. Tech Stack

### React

React is the UI library. It lets this project build the screen as a tree of components.

Where it appears:

- `src/main.tsx`
- `src/app/app.tsx`
- `src/app/app-router.tsx`
- `src/modules/auth/pages/login-page.tsx`
- `src/shared/ui/*`
- `src/shared/layout/*`

The project uses React because the UI is interactive: login forms, route changes, guarded layouts, reusable controls, loading states, and future operational workflows.

Common alternatives are Vue, Angular, and Svelte. React makes sense here because it has strong TypeScript support, a large ecosystem, and works well with Vite, TanStack Query, React Hook Form, and component libraries.

### TypeScript

TypeScript adds types to JavaScript. It helps the project catch mistakes before runtime.

Where it appears:

- Almost every source file under `src/`
- `tsconfig.json`
- `tsconfig.app.json`
- `src/shared/types/generated/eiams-v1.ts`

The important beginner idea: TypeScript describes the shape of data. For example, `LoginRequest`, `AuthTokenResponse`, and `SessionResponse` come from the generated OpenAPI types, so the frontend and backend can agree on request and response shapes.

Alternatives are plain JavaScript or Flow. TypeScript is preferred because this is a government-grade business application where incorrect data shapes can become expensive bugs.

### Vite

Vite is the development server and build tool.

Where it appears:

- `package.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`

When you run `pnpm run dev`, Vite serves the app, compiles TypeScript/React, handles hot reload, and loads `/src/main.tsx` from `index.html`.

Alternatives are Webpack, Parcel, and Rsbuild. Vite is a good fit because it is fast, modern, and simple for React apps.

### React Router

React Router maps URLs to React pages.

Where it appears:

- `src/app/app-router.tsx`
- `src/config/routes.ts`
- `src/config/route-registry.tsx`
- `src/modules/auth/components/route-guards.tsx`
- `src/shared/layout/app-layout.tsx`

The route system is split into two ideas:

- `routes.ts` declares all known paths and permission metadata.
- `route-registry.tsx` wires only pages that are actually implemented.

This is important. A route can be known by the product plan but not active in the app yet.

### TanStack Query

TanStack Query manages server state: API data, loading states, errors, caching, and mutations.

Where it appears:

- `src/app/providers/app-providers.tsx`
- `src/shared/services/query.client.ts`
- `src/modules/auth/hooks/use-session-hydration.ts`
- `src/modules/auth/hooks/use-login-mutation.ts`
- `src/modules/auth/hooks/use-permission.ts`
- `src/modules/auth/components/route-guards.tsx`

Server state means data owned by the backend. The current session projection is a good example. It comes from the backend, so it belongs in TanStack Query rather than Zustand.

Alternatives are SWR, Redux Toolkit Query, or hand-written `useEffect` calls. TanStack Query makes sense because the app will have many operational lists, details pages, and mutation flows.

### Zustand

Zustand is a small state library for client-side state.

Where it appears:

- `src/modules/auth/store/auth-session.store.ts`
- `src/shared/store/ui.store.ts`

This project uses Zustand carefully. It does not store full server session data there. It stores lifecycle state such as:

```text
initializing
authenticated
unauthenticated
```

That is client lifecycle state, not backend-owned business data.

### Axios

Axios makes HTTP requests to the backend.

Where it appears:

- `src/shared/services/api.client.ts`
- `src/modules/auth/services/auth.service.ts`

The Axios client owns base URL setup, credentials, authorization headers, and refresh-on-401 behavior.

Alternatives are browser `fetch`, Ky, or generated API clients. Axios is useful here because interceptors make token attachment and refresh retry centralized.

### React Hook Form and Zod

React Hook Form owns form state. Zod validates form data.

Where they appear:

- `src/modules/auth/pages/login-page.tsx`
- `src/modules/auth/schemas/auth.schemas.ts`
- `src/shared/forms/form.tsx`

The login page uses `useForm`, connects Zod with `zodResolver`, and renders shared form components.

Alternatives are Formik, native form state, Yup, or Valibot. React Hook Form plus Zod is a strong choice because forms stay typed, fast, and easy to validate.

### Tailwind CSS, shadcn, Base UI, and Tabler Icons

Tailwind provides utility classes. shadcn provides a generation convention for UI primitives. Base UI provides accessible primitives. Tabler provides icons.

Where they appear:

- `src/index.css`
- `components.json`
- `src/shared/ui/*`
- `src/shared/layout/*`
- `src/modules/auth/pages/login-page.tsx`

The app is Arabic-first and RTL-first. `index.html` sets `lang="ar"` and `dir="rtl"`, and components use logical spacing classes like `ps-*`, `pe-*`, `start-*`, and `end-*`.

### Vitest, Testing Library, MSW, ESLint, and Prettier

These tools protect quality.

Where they appear:

- `vite.config.ts`
- `eslint.config.js`
- `prettier.config.js`
- `src/test/setup.ts`
- `src/test/msw/*`
- `*.test.ts` and `*.test.tsx` files
- `.github/workflows/quality.yml`

The important command is:

```bash
pnpm run quality
```

That checks generated API type drift, linting, typechecking, formatting, tests, and production build.

---

## 3. Folder Structure

Important structure:

```text
src/
  app/
    app.tsx
    app-router.tsx
    providers/
    pages/
    gallery/
  config/
    env.ts
    permissions.ts
    routes.ts
    route-registry.tsx
  modules/
    auth/
      components/
      hooks/
      pages/
      schemas/
      services/
      store/
  shared/
    documents/
    feedback/
    forms/
    hooks/
    layout/
    selectors/
    services/
    store/
    types/
    ui/
    utils/
  test/
```

### `src/app`

This folder owns the application shell.

It answers:

- How does the app start after React mounts?
- Which providers wrap the app?
- Which router is used?
- Which pages are globally available?

Important files:

- `src/app/app.tsx`
- `src/app/app-router.tsx`
- `src/app/providers/app-providers.tsx`

This folder depends on shared services and auth guards. Other feature modules should not control the app root.

### `src/config`

This folder owns app-wide constants and configuration.

Important files:

- `src/config/env.ts`
- `src/config/permissions.ts`
- `src/config/routes.ts`
- `src/config/route-registry.tsx`

The key design decision is that route paths and permission metadata live in one central place. This prevents every page from inventing its own permission strings.

### `src/modules`

This folder is for domain features. Today, only `auth` is implemented as a real module. The other business domains are planned by route metadata and docs, but their pages are not wired yet.

The intended module shape is:

```text
module/
  components/
  hooks/
  pages/
  schemas/
  services/
  store/
  types/
```

This separation keeps feature-specific UI, hooks, API calls, validation, and state together.

### `src/shared`

This folder contains reusable pieces used by multiple modules.

Examples:

- `shared/ui`: buttons, inputs, dialogs, tables, badges.
- `shared/forms`: reusable React Hook Form wrappers.
- `shared/services`: API client, query client, API error handling.
- `shared/layout`: app layout, header, sidebar, breadcrumbs.
- `shared/feedback`: loading, empty, error states.
- `shared/hooks`: generic hooks such as debounce, confirm, query params, pagination.
- `shared/types/generated`: OpenAPI-generated TypeScript types.

The rule of thumb: if code belongs to one feature, put it in `modules/<feature>`. If many features need it, put it in `shared`.

### `contracts`

This folder stores the OpenAPI contract used to generate frontend API types.

Important files:

- `contracts/openapi/eiams-v1.openapi.json`
- `contracts/openapi/eiams-v1.provenance.json`
- `contracts/openapi/README.md`

The generated output goes to:

```text
src/shared/types/generated/eiams-v1.ts
```

Do not edit generated API types by hand.

### `docs`

This folder contains product and architecture decisions. It explains the intended business system, including document workflows, route permissions, database schema, and architecture decisions.

For a beginner, read docs after understanding the running frontend shell. The docs explain where the app is going.

---

## 4. Application Startup

When you run:

```bash
pnpm run dev
```

this happens:

```text
pnpm run dev
  |
  v
package.json script: "dev": "vite"
  |
  v
Vite starts a development server
  |
  v
index.html is served
  |
  v
<script type="module" src="/src/main.tsx">
  |
  v
src/main.tsx imports CSS, React, providers, and App
  |
  v
React creates a root using document.getElementById("root")
  |
  v
AppProviders wraps App
  |
  v
App runs useSessionHydration()
  |
  v
AppRouter decides which route to render
```

### `index.html`

This is the browser entry file.

Important parts:

```html
<html lang="ar" dir="rtl">
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

The `root` div is where React will render the whole app. `dir="rtl"` makes the document right-to-left by default.

### `src/main.tsx`

Purpose: create the React root and render the app.

Important flow:

```text
main.tsx
  |
  v
imports index.css
  |
  v
finds #root
  |
  v
createRoot(rootElement).render(...)
  |
  v
StrictMode
  |
  v
AppProviders
  |
  v
App
```

If `#root` is missing, the file throws an error. That is good because the app cannot render without its mount point.

### `src/app/providers/app-providers.tsx`

Purpose: wrap the whole app with global services.

It provides:

- `ErrorBoundary`
- `QueryClientProvider`
- `Toaster`

Why this exists: without one shared provider layer, every feature might create its own query client or toast surface. That would make caching and UI behavior inconsistent.

### `src/app/app.tsx`

Purpose: run global app lifecycle hooks, then render the router.

It calls:

```ts
useSessionHydration()
```

Then it returns:

```tsx
<AppRouter />
```

This means the app checks whether a refresh-cookie-backed session exists before route guards decide what to show.

---

## 5. Important Files

### `src/config/env.ts`

What is this?

It reads environment values from `import.meta.env`, validates them with Zod, and exposes a safe `environment` object.

Problem it solves:

Browser environment variables can be missing or malformed. This file catches invalid config early.

Important output:

```text
environment.apiBaseUrl
```

The default API base URL is:

```text
/api/v1
```

Why this design?

The app uses an origin-relative API path so cookies and same-origin proxy behavior stay predictable.

### `src/shared/services/api.client.ts`

What is this?

The central Axios client.

Problem it solves:

Every API request should use the same base URL, credential policy, authorization header behavior, and refresh handling.

Important behavior:

- Creates Axios with `baseURL`.
- Sends `withCredentials: true`.
- Adds an authorization header for protected requests.
- Excludes `/auth/login` and `/auth/refresh` from authorization header attachment.
- On a 401, tries one refresh request.
- Retries the original request once after refresh.

Connection:

```text
auth.service.ts
  |
  v
apiClient
  |
  v
Axios request
  |
  v
Backend API
```

Without this file, each service would need to remember how auth headers and refresh retries work. That would duplicate sensitive logic.

### `src/shared/services/query.client.ts`

What is this?

The one TanStack Query client for the app.

It defines default cache behavior:

- operational data stale time: 30 seconds
- master data stale time constant: 5 minutes
- garbage collection: 15 minutes
- query retry: 1
- mutations do not retry by default

Why it matters:

Inventory screens will fetch lots of backend data. A shared query client keeps loading, caching, refetching, and invalidation behavior consistent.

### `src/modules/auth/services/auth.service.ts`

What is this?

The API service for authentication endpoints.

It exposes:

- `login`
- `getSession`
- `setActiveScope`
- `logout`

Problem it solves:

Components should not call Axios directly. Components should ask a service to perform a domain operation.

Design boundary:

This service only sends requests and returns response data. It does not store tokens, navigate, normalize errors, or show toasts.

### `src/modules/auth/store/auth-session.store.ts`

What is this?

A Zustand store for the local authentication lifecycle.

It stores:

```text
initializing
authenticated
unauthenticated
```

It does not store the full user, roles, scopes, or permissions. Those are server state and live in TanStack Query.

Why this design?

The app needs a quick local answer to: "Are we still checking the session, signed in, or signed out?" But the actual session data still belongs to the backend.

### `src/modules/auth/services/session-lifecycle.ts`

What is this?

The coordinator for session lifecycle work.

It connects:

- auth service
- query client
- session adapter
- Zustand auth lifecycle store

Important functions:

- `hydrate`: refreshes the session and stores the server session projection in TanStack Query.
- `installLogin`: installs token response and stores the session projection.
- `logout`: calls backend logout and clears local protected state.
- `clearProtectedAuthCache`: removes auth and scoped queries after logout or expiry.

This file is a good example of separation of concerns. It coordinates several systems without becoming a React component.

### `src/modules/auth/hooks/use-session-hydration.ts`

What is this?

A hook that starts app session bootstrap.

It uses TanStack Query with:

```text
queryKey: ["auth", "session"]
queryFn: authSessionLifecycle.hydrate
enabled: status === "initializing"
retry: false
```

Why this exists:

When the app first loads, it needs to know if the user already has a valid refresh-cookie-backed session.

### `src/modules/auth/pages/login-page.tsx`

What is this?

The public login page.

It uses:

- React Hook Form for form state.
- Zod schema for validation.
- `useLoginMutation` for the login API mutation.
- shared form primitives.
- shared Button and Input.
- toast notifications.

Inputs:

- username
- password

Outputs:

- a login API request
- inline validation messages
- toast success or error
- session state update through the mutation success path

Workflow:

```text
User types credentials
  |
  v
React Hook Form tracks field values
  |
  v
Zod validates on submit
  |
  v
onSubmit calls loginMutation.mutateAsync(values)
  |
  v
authService.login sends POST /auth/login
  |
  v
onSuccess installs session
  |
  v
route guards can redirect authenticated user
```

### `src/modules/auth/components/route-guards.tsx`

What is this?

Route protection components.

Important guards:

- `AnonymousRoute`: login should only show to unauthenticated users.
- `RequireSelectedScope`: protected features require authentication and an active scope.
- `ScopeSelectionRoute`: shown when the backend says the user must choose a scope.
- `NoAccessRoute`: shown when the user has no available scope.
- `RouteAccessGuard`: checks route permissions.

This file does not invent permission rules. It delegates permission checking to route metadata and `useRoutePermission`.

### `src/config/routes.ts`

What is this?

The route and permission source of truth.

It defines:

- route paths
- Arabic labels
- route groups
- required permissions
- parent route for breadcrumbs
- whether a route is public or dev-only

Important beginner note:

This file declares many future business routes. Declaring a route path does not mean the page is implemented.

### `src/config/route-registry.tsx`

What is this?

The bridge between declared routes and implemented pages.

Current wired pages:

- `login`
- `notFound`
- `devGallery`

Important design:

```text
ROUTE_PATHS may contain many planned routes.
PAGES contains only delivered pages.
Unwired routes fall through to not-found.
```

This lets the product plan exist without accidentally exposing unfinished pages.

### `src/app/app-router.tsx`

What is this?

The root router.

It creates route objects for:

- login outside the app layout
- scope selection
- no access
- dev gallery inside app layout
- protected routes inside selected-scope and permission guards
- not-found inside app layout

Important connection:

```text
route-registry.tsx
  |
  v
app-router.tsx
  |
  v
React Router
  |
  v
Route guards
  |
  v
Layout and page
```

### `src/shared/layout/app-layout.tsx`

What is this?

The protected application frame.

It renders:

- `AppHeader`
- `Sidebar`
- main content area
- `Outlet`
- footer

`Outlet` is where React Router renders the matched child page.

Without this layout, every page would need to manually render the same header, sidebar, spacing, and footer.

### `src/shared/layout/sidebar/sidebar-nav-model.ts`

What is this?

The sidebar navigation model.

It maps visible sidebar items to route keys. It also filters items based on route guard metadata.

Why this is good:

The sidebar does not hard-code random paths and permission strings. It reuses `ROUTE_METADATA`.

### `src/shared/forms/form.tsx`

What is this?

A shared wrapper around React Hook Form primitives.

It provides:

- `Form`
- `FormField`
- `FormItem`
- `FormLabel`
- `FormControl`
- `FormDescription`
- `FormMessage`
- `useFormField`

Problem it solves:

Forms need accessible labels, ids, error messages, invalid states, and consistent styling. This file centralizes that pattern.

### `src/shared/ui/button.tsx`

What is this?

A shared Button component built on Base UI and styled with class-variance-authority.

It supports:

- variants
- sizes
- loading state
- disabled state
- icon-friendly styling

Why it exists:

Every feature should use the same button behavior and visual language.

---

## 6. How Files Connect

### App startup connection

```text
index.html
  |
  | loads /src/main.tsx
  v
src/main.tsx
  |
  | renders providers and App
  v
src/app/providers/app-providers.tsx
  |
  | provides ErrorBoundary, QueryClientProvider, Toaster
  v
src/app/app.tsx
  |
  | starts session hydration
  v
src/modules/auth/hooks/use-session-hydration.ts
  |
  | calls authSessionLifecycle.hydrate
  v
src/modules/auth/services/session-lifecycle.ts
  |
  | refreshes session through sessionAdapter
  v
src/shared/services/api.client.ts
  |
  | calls backend
  v
Backend API
```

### Routing connection

```text
src/config/routes.ts
  |
  | declares paths and permissions
  v
src/config/route-registry.tsx
  |
  | wires implemented lazy pages
  v
src/app/app-router.tsx
  |
  | creates React Router route tree
  v
src/modules/auth/components/route-guards.tsx
  |
  | checks auth, scope, permissions
  v
src/shared/layout/app-layout.tsx
  |
  | renders header/sidebar/main frame
  v
Page component
```

### Login workflow connection

```text
src/modules/auth/pages/login-page.tsx
  |
  | user submits username and password
  v
src/modules/auth/schemas/auth.schemas.ts
  |
  | validates form values
  v
src/modules/auth/hooks/use-login-mutation.ts
  |
  | starts TanStack Query mutation
  v
src/modules/auth/services/auth.service.ts
  |
  | POST /auth/login
  v
src/shared/services/api.client.ts
  |
  | Axios sends request
  v
Backend API
  |
  | returns AuthTokenResponse
  v
src/modules/auth/services/session-lifecycle.ts
  |
  | installs token response and caches session
  v
src/modules/auth/store/auth-session.store.ts
  |
  | status becomes authenticated
  v
src/modules/auth/components/route-guards.tsx
  |
  | redirects away from login
```

---

## 7. Component Architecture

This project uses several component levels.

Pages are route-level components. Example: `src/modules/auth/pages/login-page.tsx`. A page understands a user workflow.

Layouts are shared frames around pages. Example: `src/shared/layout/app-layout.tsx`. A layout owns repeated page chrome like header, sidebar, main area, and footer.

Feature components belong to a domain module. Today, auth owns route guards and login page logic.

Shared UI components are reusable building blocks. Example: `src/shared/ui/button.tsx`, `src/shared/ui/input.tsx`, `src/shared/ui/dialog.tsx`.

Shared form components wrap React Hook Form and accessibility behavior. Example: `src/shared/forms/form.tsx`.

Basic React data movement looks like this:

```text
Parent component
  |
  | props
  v
Child component
  |
  | event callback
  v
Parent handler
  |
  | state or mutation changes
  v
React rerenders affected components
```

In this project, state should live where it naturally belongs:

- Temporary field state belongs in React Hook Form.
- Temporary UI state belongs in local component state or `shared/store/ui.store.ts`.
- Auth lifecycle status belongs in `auth-session.store.ts`.
- Backend data belongs in TanStack Query.

---

## 8. State Management

### Local component state

Local state is data that only one component needs. The shared form system uses React state internally for generated description and message ids in `src/shared/forms/form.tsx`.

Use this when the data is small and private to one component.

### Shared client state

Shared client state is frontend-owned data needed by multiple components.

Current examples:

- `src/modules/auth/store/auth-session.store.ts`
- `src/shared/store/ui.store.ts`

The auth store owns session lifecycle status, not the full backend session.

### Server state

Server state is data owned by the backend.

Current examples:

- session response cached under `authSessionQueryKey`
- future inventory lists, material lists, document details, and reports

TanStack Query owns this because it handles loading, error, refetching, caching, and invalidation.

### URL state

URL state is data stored in the route path or search string.

Current route examples:

- `/admin/users/:userId`
- `/documents/receiving/:documentId`
- `/assets/:assetId`

Those detail routes are declared but not wired yet. When implemented, pages will read route params from React Router and use them to fetch data.

### Form state

Form state is owned by React Hook Form.

Current example:

- `src/modules/auth/pages/login-page.tsx`

The login form tracks username, password, validation errors, submit state, and server field errors.

---

## 9. API Communication

The API layer is intentionally separated.

```text
Component
  |
  v
Hook
  |
  v
Service
  |
  v
API client
  |
  v
Backend
```

The real login request:

```text
LoginPage.onSubmit(values)
  |
  v
useLoginMutation().mutateAsync(values)
  |
  v
authService.login(values)
  |
  v
apiClient.post("/auth/login", values)
  |
  v
Backend returns AuthTokenResponse
```

Base URL source:

```text
src/config/env.ts
  |
  v
environment.apiBaseUrl
  |
  v
src/shared/services/api.client.ts
```

Authentication behavior:

- The Axios client sends credentials with requests.
- Protected requests get an authorization header from the session adapter.
- Login and refresh requests do not get the authorization header.
- A 401 response triggers one refresh attempt.
- If refresh succeeds, the original request is retried once.
- If session expiry happens, protected auth/scoped query data is cleared.

Error handling:

- API errors are normalized in `src/shared/services/api-error.ts`.
- Login maps server field errors with `src/shared/forms/server-errors.ts`.
- User-visible messages are shown through the shared toast system.

---

## 10. Routing

Routes are defined in `src/config/routes.ts`.

Each route has:

- a path
- an Arabic label
- a group
- optional permission requirements
- optional parent route
- optional public/dev-only flags

Routes are wired in `src/config/route-registry.tsx`.

Current wired routes:

```text
login
notFound
devGallery
```

The root router in `src/app/app-router.tsx` builds the real router tree.

Important route behavior:

```text
/login
  |
  v
AnonymousRoute
  |
  v
LoginPage
```

```text
protected feature route
  |
  v
RequireSelectedScope
  |
  v
AppLayout
  |
  v
RouteAccessGuard
  |
  v
Lazy page
```

For a future route like `/documents/receiving/:documentId`, the intended flow will be:

```text
/documents/receiving/123
  |
  v
React Router matches documentReceivingDetail
  |
  v
RouteAccessGuard checks document.view
  |
  v
Receiving detail page reads documentId = 123
  |
  v
query hook fetches document
  |
  v
service calls backend
```

That future page is not currently wired.

---

## 11. Authentication and Authorization

Authentication means proving who the user is.

Authorization means deciding what the user is allowed to do.

### Startup auth flow

```text
App
  |
  v
useSessionHydration
  |
  v
authSessionLifecycle.hydrate
  |
  v
sessionAdapter.refreshSession
  |
  v
Backend refresh/session endpoint
  |
  v
SessionResponse stored in TanStack Query
  |
  v
auth lifecycle status becomes authenticated
```

If hydration fails, protected auth data is cleared and status becomes unauthenticated.

### Login flow

```text
LoginPage
  |
  v
submit credentials
  |
  v
authService.login
  |
  v
POST /auth/login
  |
  v
AuthTokenResponse
  |
  v
authSessionLifecycle.installLogin
  |
  v
token installed in session adapter
  |
  v
session cached in TanStack Query
  |
  v
status becomes authenticated
```

### Logout flow

```text
logout action
  |
  v
authSessionLifecycle.logout
  |
  v
authService.logout
  |
  v
POST /auth/logout
  |
  v
clear protected query cache
  |
  v
clear access token
  |
  v
status becomes unauthenticated
```

### Permission flow

Permissions are typed in `src/config/permissions.ts`.

Route permission requirements are declared in `src/config/routes.ts`.

`usePermission` reads the cached session response from TanStack Query and checks `session.permissionCodes`.

Then:

```text
RouteAccessGuard
  |
  v
useRoutePermission(routeKey)
  |
  v
ROUTE_METADATA[routeKey]
  |
  v
session.permissionCodes
  |
  v
render page or PermissionDenied
```

Important security note:

The frontend hides UI and blocks navigation for user experience. The backend must still enforce permissions on every request.

---

## 12. Important User Workflows

### Workflow 1: Open the app while already signed in

```text
Browser loads index.html
  |
  v
src/main.tsx renders AppProviders and App
  |
  v
App calls useSessionHydration
  |
  v
authSessionLifecycle.hydrate refreshes session
  |
  v
queryClient stores SessionResponse under ["auth", "session"]
  |
  v
auth-session.store.ts marks status authenticated
  |
  v
AppRouter route guards read status and cached session
  |
  v
user sees allowed route, scope selection, no-access, or dashboard redirect
```

### Workflow 2: Login

```text
User submits login form
  |
  v
LoginPage.onSubmit
  |
  v
loginSchema validates values
  |
  v
useLoginMutation starts mutation
  |
  v
authService.login sends POST /auth/login
  |
  v
apiClient sends Axios request
  |
  v
Backend returns token response and session projection
  |
  v
authSessionLifecycle.installLogin
  |
  v
session adapter stores access token
  |
  v
TanStack Query stores SessionResponse
  |
  v
Zustand lifecycle status becomes authenticated
  |
  v
AnonymousRoute redirects user away from login
```

### Workflow 3: User opens a protected route

```text
User navigates to a protected URL
  |
  v
React Router checks appRouter
  |
  v
RequireSelectedScope checks auth lifecycle status
  |
  v
RequireSelectedScope checks cached SessionResponse.scopeState
  |
  v
RouteAccessGuard checks route permissions
  |
  v
AppLayout renders shared frame
  |
  v
matched page renders inside Outlet
```

If the user is unauthenticated, they go to `/login`. If the user needs scope selection, they go to `/session/scope`. If the user lacks permission, they see the permission denied state.

### Workflow 4: Sidebar item visibility

```text
Sidebar
  |
  v
SIDEBAR_NAV_GROUPS
  |
  v
each item points to a RouteKey
  |
  v
getNavItemGuards reads ROUTE_METADATA
  |
  v
filterSidebarNav applies permission predicate
  |
  v
only allowed groups/items render
```

This keeps navigation consistent with route guards.

### Workflow 5: Future document posting

The full document posting UI is not implemented yet, but the intended architecture is visible in routes, docs, generated types, and shared components.

Expected flow:

```text
Document page
  |
  v
document form with React Hook Form and Zod
  |
  v
line components validate quantities and assets
  |
  v
mutation hook submits command
  |
  v
document service calls apiClient
  |
  v
backend enforces lifecycle, permission, signed copy, balance, capability
  |
  v
backend writes WarehouseDocument, StockMovement, InventoryBalance, AuditLog
  |
  v
TanStack Query invalidates document and balance queries
  |
  v
UI rerenders with updated status
```

---

## 13. Data Flow

There are two directions to understand.

### UI to API

```text
UI event
  |
  v
component handler
  |
  v
validation or hook
  |
  v
service function
  |
  v
apiClient
  |
  v
backend
```

Real example:

```text
LoginPage.onSubmit
  |
  v
useLoginMutation
  |
  v
authService.login
  |
  v
apiClient.post("/auth/login")
```

### API to UI

```text
backend response
  |
  v
service returns data
  |
  v
TanStack Query stores result
  |
  v
hook exposes state
  |
  v
component rerenders
  |
  v
user sees new UI
```

Real example:

```text
AuthTokenResponse
  |
  v
authSessionLifecycle.installLogin
  |
  v
queryClient.setQueryData(["auth", "session"], response.session)
  |
  v
usePermission and route guards observe cached session
  |
  v
allowed UI becomes available
```

---

## 14. Design Patterns

### Provider pattern

Meaning: wrap the app with shared services.

Where it appears:

- `src/app/providers/app-providers.tsx`

Problem it prevents:

Feature code does not need to create its own query client or error boundary.

### Service layer

Meaning: API calls live in service files, not directly inside UI components.

Where it appears:

- `src/modules/auth/services/auth.service.ts`

Problem it prevents:

Components do not become tangled with HTTP details.

### Custom hooks

Meaning: reusable React logic lives in hooks.

Where it appears:

- `src/modules/auth/hooks/use-login-mutation.ts`
- `src/modules/auth/hooks/use-session-hydration.ts`
- `src/modules/auth/hooks/use-permission.ts`
- `src/shared/hooks/*`

Problem it prevents:

Pages stay focused on user interaction instead of low-level caching or state wiring.

### Route registry

Meaning: route definitions and page wiring are separated.

Where it appears:

- `src/config/routes.ts`
- `src/config/route-registry.tsx`

Problem it prevents:

The product can declare future routes without accidentally exposing incomplete pages.

### Guard components

Meaning: access decisions are React components around pages.

Where it appears:

- `src/modules/auth/components/route-guards.tsx`

Problem it prevents:

Every page does not need to manually repeat login, scope, and permission checks.

### Schema validation

Meaning: form data is checked against a schema before submission.

Where it appears:

- `src/modules/auth/schemas/auth.schemas.ts`
- `src/modules/auth/pages/login-page.tsx`

Problem it prevents:

Invalid data does not reach the API accidentally, and users get inline feedback.

### Generated API types

Meaning: backend OpenAPI contract generates TypeScript definitions.

Where it appears:

- `contracts/openapi/eiams-v1.openapi.json`
- `scripts/generate-api-types.mjs`
- `src/shared/types/generated/eiams-v1.ts`

Problem it prevents:

Frontend and backend drift becomes easier to detect.

---

## 15. Why This Architecture Is Designed This Way

The important separation is:

```text
Component -> Hook -> Service -> API Client
```

instead of:

```text
Component -> fetch()
```

Why this helps:

- Components stay readable.
- API behavior is consistent.
- Authentication headers and refresh logic live in one place.
- Error handling can be shared.
- Hooks can expose loading and mutation state cleanly.
- Services can be tested without rendering UI.
- Generated API types can be used close to the request boundary.

For this project, that separation matters more than usual because inventory workflows are sensitive. Posting a document, issuing stock, assigning custody, or viewing audit data should not depend on one page manually remembering all rules.

The frontend still does not replace backend enforcement. The frontend guides the user and blocks obvious invalid actions, but the backend is the authority.

---

## 16. Good Decisions, Trade-offs, and Improvements

### Good decisions

The route metadata is centralized in `src/config/routes.ts`. This keeps paths, Arabic labels, groups, permissions, and breadcrumbs connected.

The API client is centralized in `src/shared/services/api.client.ts`. Auth headers and refresh retry are not scattered.

The session design separates lifecycle state from server session data. Zustand stores simple status; TanStack Query stores backend session projection.

The OpenAPI-generated type file gives the frontend a strong contract with the backend.

The app is RTL-first from `index.html`, not patched page by page.

### Acceptable trade-offs

Most domain routes are declared before their pages exist. This is fine because `route-registry.tsx` only wires implemented pages.

The current sidebar model already lists planned product areas. Until pages are wired, navigation filtering and route availability must be handled carefully.

The auth module is more complex than a beginner login example. That complexity is reasonable because token refresh, scope selection, and permission checks are cross-cutting concerns.

### Potential problems

Developers may accidentally add a route to `ROUTE_PATHS` and assume it is active. It is not active until added to `PAGES` in `route-registry.tsx`.

Developers may be tempted to store server data in Zustand. The repo rules say not to do that.

Future modules must be disciplined about query keys and invalidation. Inventory screens can become stale or inconsistent if mutations do not invalidate the right queries.

Arabic strings must be handled carefully. Terminal output may display garbled text depending on encoding, but source files are intended to contain Arabic UI text.

### Beginner traps

Do not start by reading every shared UI component. Start with the app flow.

Do not think `routes.ts` means all pages are implemented.

Do not put API calls directly in components just because it feels faster.

Do not treat frontend permission checks as security by themselves. Backend checks are still required.

Do not edit generated API types manually.

### Possible improvements

As business modules are implemented, add one clear service, hook, page, schema, and test pattern per module so future developers can copy the correct shape.

Add a beginner-facing diagram for each completed business workflow, especially receiving, issue, transfer, custody assignment, and adjustment.

Consider adding a short README inside each module once the module becomes non-trivial.

Keep route metadata and sidebar visibility tests strong as more pages become wired.

---

## 17. Mental Model

Remember the app like this:

```text
index.html
  starts the browser document and RTL root

main.tsx
  mounts React

AppProviders
  installs global app services

App
  starts session hydration

AppRouter
  decides which route tree to render

Route guards
  decide whether the user may see a route

AppLayout
  gives protected pages the shared shell

Pages
  own user workflows

Components
  render reusable pieces of UI

Hooks
  connect UI to React logic, queries, mutations, and permissions

Services
  call backend endpoints

api.client.ts
  owns HTTP configuration, auth headers, and refresh retry

TanStack Query
  stores server data

Zustand
  stores small frontend-owned lifecycle/UI state

Generated types
  describe backend request and response shapes
```

---

## 18. Learning Order

Study the project in this order:

1. `package.json`

Understand the scripts and dependencies. Know that `pnpm run dev` starts Vite and `pnpm run quality` is the full quality gate.

2. `index.html`

Understand the root div, Arabic language setting, RTL direction, and script that loads `src/main.tsx`.

3. `src/main.tsx`

Understand how React mounts and why `AppProviders` wraps `App`.

4. `src/app/providers/app-providers.tsx`

Understand the root error boundary, QueryClientProvider, and toaster.

5. `src/app/app.tsx`

Understand that session hydration starts before routing decisions settle.

6. `src/shared/services/query.client.ts`

Understand where server-state caching defaults come from.

7. `src/shared/services/api.client.ts`

Understand the shared Axios client, base URL, credentials, token headers, and refresh retry.

8. `src/modules/auth/store/auth-session.store.ts`

Understand the difference between lifecycle status and full session data.

9. `src/modules/auth/services/session-lifecycle.ts`

Understand how auth service, query cache, session adapter, and Zustand store work together.

10. `src/config/routes.ts`

Understand route metadata, permissions, labels, groups, and parent routes.

11. `src/config/route-registry.tsx`

Understand the difference between declared routes and wired pages.

12. `src/app/app-router.tsx`

Understand how React Router composes login, scope, no-access, layout, protected routes, and not-found.

13. `src/modules/auth/components/route-guards.tsx`

Understand authentication, scope, and permission gates.

14. `src/modules/auth/pages/login-page.tsx`

Trace a full real page from form input to API mutation.

15. `src/shared/forms/form.tsx`

Understand how shared form building blocks connect labels, controls, validation messages, and accessibility ids.

16. `src/shared/layout/app-layout.tsx`

Understand how protected pages are placed inside the common shell.

17. `src/shared/layout/sidebar/sidebar-nav-model.ts`

Understand permission-filtered navigation.

18. `docs/Architecture_Overview.md`

After the frontend shell makes sense, read the product architecture so the planned modules make sense.

---

## 19. Questions to Test Your Understanding

Try answering these without looking at this guide first.

1. Which file does the browser load first?
2. Where is the React root created?
3. Why does `main.tsx` throw an error if `#root` does not exist?
4. Which component wraps the app with TanStack Query?
5. What does `App` do before rendering the router?
6. Where is the default API base URL defined?
7. Why does the project use `api.client.ts` instead of calling Axios directly in every page?
8. What is the difference between `auth-session.store.ts` and the cached `SessionResponse`?
9. Which file declares all route paths?
10. Which file decides which declared routes are actually implemented?
11. Why can a route exist in `ROUTE_PATHS` but still show not-found?
12. What does `AnonymousRoute` do when an already-authenticated user visits `/login`?
13. What does `RequireSelectedScope` protect against?
14. Where are permission codes defined?
15. How does `useRoutePermission` know which permissions a route needs?
16. Trace the login flow from button click to session cache update.
17. Why does the login page use React Hook Form and Zod?
18. What belongs in TanStack Query, and what belongs in Zustand?
19. If you add a new inventory balance page later, which files will probably need changes?
20. Why must the backend still check permissions even if the frontend hides forbidden buttons?

---

## 20. Final Beginner Summary

This frontend is built like a professional shell first and a set of business screens second.

The shell already answers:

```text
How does the app start?
Who is signed in?
Which scope is active?
Which routes exist?
Which pages are implemented?
Which permissions are required?
How do API calls attach credentials?
Where does server data live?
How do forms and UI primitives stay consistent?
```

Once you understand that shell, future EIAMS modules become easier to learn. A future receiving, issue, transfer, asset, custody, count, or report page should feel like another piece plugged into the same path:

```text
Page -> form/table components -> hooks -> services -> apiClient -> backend
```

That is the core pattern to remember.
