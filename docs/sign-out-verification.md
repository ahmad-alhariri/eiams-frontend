# Sign-out and the orphaned custody key — `eiams-frontend-2do3`

Closes the last unimplemented item of the EIAMS shell: a user could not end
their session. Also fixes a cache-key defect that wiring sign-out would have
made reachable.

## Why this was a specification gap, not a product decision

`useLogoutMutation` was exported with **zero references anywhere in `src/`**, so
`authSessionLifecycle.logout`, `authService.logout` and the implemented
`POST /auth/logout` contract operation were all unreachable. The whole service
path was complete and tested; only the UI was missing.

The requirement is not inferred. It is stated:

- `docs/ui-design.md:250` — the top-navigation right section specifies
  *"Dropdown menu: profile, settings, logout"*. The avatar, name and role were
  already rendered; only the caret and the menu were absent.
- `docs/authentication-session-scope-contract-decision.md:49` elevates it to
  governing evidence: *"The application shell displays user identity, role
  context, logout, and the current site/warehouse scope."*

So this was an unimplemented specification, not a design question.

## What was built

### 1. `src/shared/ui/dropdown-menu.tsx` — new shared primitive
Wraps `@base-ui/react/menu` (shipped since the installed `^1.7.0`, never
wrapped). It follows the existing shared-wrapper pattern exactly: one function
per part, a `data-slot` on every rendered part so consumers can target it, and
`cn` from `@/shared/utils/class-names`. Its positioner defaults deliberately
match `popover.tsx` (`side='bottom'`, `sideOffset={4}`, `align='center'`,
`alignOffset={0}`) so a menu and a popover do not disagree about placement in
RTL.

Creating it is the path `docs/component-guidelines.md:8-19` prescribes —
"Base UI primitive → shared composed component" — and the primitive was
genuinely absent from the reusable inventory.

Eight tests cover: the popup relationship announced on the trigger, arrow-key
highlight with wraparound, Home/End, the shared focus-ring utilities on the
keyboard-highlighted item, Escape closing and **focus returning to the
trigger**, positioner default parity with the popover wrapper, a `data-slot` on
every part, and direction-aware placement under `dir="rtl"`.

**Focus-ring visibility is NOT proven by that test, and cannot be.** jsdom does
not compile Tailwind, so no assertion in a unit test can observe contrast. The
first version of that case was titled "keeps a visible focus ring" while
asserting only that two class strings were present — it would have passed with
a completely invisible ring, and browser QA found precisely that: in this theme
`--ring` and `--accent` are both `#428177`, so a bare `ring-ring` drawn on a
`bg-accent` item is imperceptible. The items now also carry
`ring-offset-background`, whose gap separates the ring from the fill, and the
test asserts the offset utilities are present while saying plainly that it does
not prove visibility.  Re-verified after the fix: the highlighted item computes box-shadow rgb(237,235,224) 0 0 0 2px, rgb(66,129,119) 0 0 0 4px against background-color rgb(66,129,119) - the ivory --background band is what separates the ring from the identically coloured fill.The visibility itself was confirmed in the browser.

### 2. `src/modules/auth/components/session-user-menu.tsx` — new
Modelled on `active-scope-switcher.tsx`, the existing precedent for an
auth-module component injected into the shared layout. It reads the session
through the repository's established **cache-observer idiom** — the
`useQuery({ queryKey: authSessionQueryKey, queryFn: () => Promise.reject(…),
enabled: false, staleTime: Infinity })` pattern already used by
`use-permission.ts:62-67`, `route-guards.tsx:27-36` and `sidebar.tsx:106-111`.
**No new hydration observer was added.**

It renders the identity and role on the caret trigger and three items: profile,
settings, logout.

### 3. Prop injection rather than a self-observing header
`userMenu?: ReactNode` was added to `AppHeader` and `AppLayout`, mirroring the
existing `scopeSwitcher` path.

This is a deliberate choice with a measured cost behind it:
`app-header.test.tsx` renders `<AppHeader {...props} />` **with no providers at
all**, so a self-observing header would have broken all eight existing header
tests. Prop injection also keeps `shared/layout` free of auth imports, matching
the composition convention already in `app-router.tsx`.

`app-router.tsx` renders `<AppLayout />` on **three** branches. The menu is
wired only at the protected one:

```
L79  element: <AppLayout />,                             // dev gallery — no menu
L85  <AppLayout scopeSwitcher={<ActiveScopeSwitcher />} userMenu={<SessionUserMenu />} />   // protected
L91  element: <AppLayout />,                             // not-found — no menu
```

### 4. `profile` and `settings` declared as routes
Declared in `src/config/routes.ts` under a new `account` group with Arabic
metadata, and registered in `route-registry.tsx`'s `PAGES` map pointing at the
**existing** `routePlaceholderPage` — the pattern already used for `dashboard`
and `reports`. No new page components were invented for routes with no
contract. `app-router.tsx` was not edited for the routes, per the AGENTS.md
3-step wiring.

Both carry `permissionAny: OPERATIONAL_VIEW_CODES` - permission-gated like every
other protected route.

**A correction worth recording.** Browser QA observed that with
`permissionCodes: []` a fully-revoked user was refused at `/profile` with the
Arabic "no permission" message, and flagged it as contradicting the stated design
intent. The first response was to remove the permission key from the account
pages. That was wrong, and reverting it is the more useful record.

Removing it broke three tests in two files, because the repository encodes
"every protected route declares guard metadata" as a deliberate convention in
`routes.test.ts` ("requires guard metadata on every non-public route"), in the
RBAC route-guard matrix, and in the sidebar nav model. Weakening that convention
so a revoked user can open an **empty placeholder page** is a bad trade: the
property that genuinely matters - that a revoked user can always SIGN OUT - is
already satisfied and independently tested, because the user menu is gated on
authentication alone.

So the permission key was restored, the misleading comment was rewritten to state
what is actually true (the routes are gated; sign-out is not), and the second
question the QA raised - whether the account pages belong in the sidebar at all -
was answered by `ui-design.md:250`, which places profile, settings and logout
in the header dropdown. They are also linked from an `account` sidebar group,
which is consistent with every other declared list route being navigation-
reachable, and is what the existing "no list page is reachable only by URL"
invariant requires.

### 5. The logout handler: single click, no confirmation dialog
`docs/component-guidelines.md:177` reserves `ConfirmDialog` for *destructive or
consequential* actions. Sign-out destroys no server data — the session is
revoked idempotently and nothing is "undone" — and `ui-design.md:250`
specifies a menu item, not a dialog. The nine existing `useConfirm` call sites
are all genuinely destructive or state-changing. Single click it is.

**The non-obvious part is the failure path.** `session-lifecycle.logout()`
**rejects** on a network failure even though its `finally` clears the local
session — proven by `session-lifecycle.test.ts:120`
(`await expect(lifecycle.logout()).rejects.toBeTruthy()`). So a naive
`mutateAsync()` would surface a false "sign-out failed" to a user who is in
fact signed out.

The handler therefore catches, and reports honestly with `toast.warning`:

> `تم إنهاء الجلسة على هذا الجهاز.` — the local session ended, the server
> revocation is unconfirmed.

D-AUTH-01 makes the local clear final regardless, so reporting failure would be
a lie. A `403` (`auth.origin_denied`) lands in the same branch and is shown with
the contract's own reason, without retrying. Navigation is **not** manual:
`clearSession()` sets `status: 'unauthenticated'` synchronously and
`RequireSelectedScope` (`route-guards.tsx:119-121`) redirects. The trigger is
`disabled` while pending so a double click cannot fire two logouts.

### 6. Sign-out is deliberately not permission-gated
`src/config/permissions.ts` contains no `auth.*`, `session.*` or `logout` code,
and the contract declares `security: [{ refreshCookie: [] }, {}]` — the empty
security object makes logout explicitly anonymous-capable. Gating it on a
permission would strand a user whose permissions had been revoked, which is
precisely the user who most needs to sign out. A test pins this: *"stays
available to a user whose effective permission codes are empty."*

## The orphaned custody key — why this task is P1

`src/modules/custody/hooks/use-custody-row-query.ts:17` built its key by hand:

```ts
queryKey: ['custody', 'row', scope.activeScopeCacheKey, custodyId] as const
```

`session-lifecycle.ts:11-14` clears only the namespaces `'auth'` and
`'scoped'`, and `clearScopedQueries` also matches `'scoped'` only. The key was
therefore a **triple orphan**:

- it **survived logout**, so a custody row fetched under one user's bearer token
  and authorization survived that user signing out;
- it **survived a scope change**;
- it was **not matched by `useCustodyInvalidation`**, which invalidates
  `queryKeys.scoped(scope, CUSTODY_RESOURCE)`.

Wiring sign-out is what makes the first of those reachable, which is why the
fix belongs in this task rather than being deferred. Had user B logged in on the
same browser with overlapping scope, TanStack would have served user A's cached
custody row from memory with no server round trip.

`session-lifecycle.test.ts:94-104` only asserted a `scoped` and a `public` key,
so nothing covered this.

**Fix.** The key is now built by the `queryKeys.scoped` factory via a new
`custodyQueryKeys.row(scope, custodyId)`, which is a descendant of the same
namespace root the invalidation already targets — so one invalidation now covers
both the list and the detail row. The no-scope case falls back to
`queryKeys.public`, and the query stays `enabled: false` unless both the scope
and the id exist, so the fallback key can never be populated.

The sibling `['asset']` fragment in `use-custody-queries.ts:47` was fixed in the
same pass, replaced with a new `assetQueryKeys.all(scope)` namespace root. That
fragment matched no real key, because every asset key is
`['scoped', kind, id, 'asset', …]`. It was filed as `eiams-frontend-jkel`; that
bead's wider ask — auditing every invalidation target in `src/` and writing down
the query-key convention — **remains open** and is not discharged by this fix.

Two regression tests in `use-custody-row-query.test.ts` cover it, including that
the entry does not survive `logout()`.

## Browser QA findings, and the corrections they forced

Independent Chrome DevTools MCP pass, 8 PASS / 1 PARTIAL / 0 FAIL, with the dev
mock and `dev-session.ts` both instrumented and then fully reverted (empty
`git diff` on each).

Verified: the trigger is a real button announcing `قائمة المستخدم` with the
identity and role; exactly three Arabic items render; profile and settings
navigate and render the placeholder with **no** console error; **Enter and
Space both open the menu**; arrow keys move the highlight and wrap in both
directions, Home/End jump, Escape closes and **focus returns to the trigger**;
one click logs out with **exactly one** `POST /auth/logout` and no dialog; the
menu is **absent** on the 404 and dev-gallery branches; `dir="rtl"` with the
caret correctly at the inline-end and the popup's edge aligned to the trigger
within 2px; `scrollWidth <= innerWidth` at 1440/768/390 with nothing clipped at
390; and **0 application console errors or warnings** across the session.

The 500, 403 `auth.origin_denied` and hard-network-failure paths each confirmed
the honesty requirement: the user is redirected to `/login` every time, the
toast is warning-toned `تم إنهاء الجلسة على هذا الجهاز.`, the contract's reason
is carried in the description, and there is exactly one request with no retry.
Sign-out was also confirmed reachable with `permissionCodes: []` while the rest
of the app correctly locked down.

### Two real defects QA found, and the corrections

**The focus ring was invisible, and the test could not have caught it.** In
this theme `--ring` and `--accent` are both `#428177`, so a `ring-ring` drawn on
a `bg-accent` highlighted item has **zero contrast** — the item is still
distinguishable by its fill, but the stated focus affordance was not. The
`ring-offset-background` gap now separates the two. The test that claimed to
cover this asserted only that two class strings were present, which no unit test
in jsdom can do; it has been renamed and rewritten to say what it can actually
pin.

**The account pages contradicted their own stated design intent.** A comment in
`routes.ts` claimed the account pages were "never gated by a permission a
revocation could take away" while the code assigned them
`permissionAny: OPERATIONAL_VIEW_CODES`. The comment was simply false, and QA
demonstrated it: with `permissionCodes: []` a fully-revoked user was refused at
`/profile`. The fix was to make the **comment** true rather than to change the
behaviour - see the fuller account above, which records why removing the
permission key was the wrong response and was reverted.
## What this does NOT prove

- **Server-side revocation.** A `204` means the token family was revoked; a
  network failure means the local session ended and the server did not
  confirm. The browser cannot observe the difference, and the UI deliberately
  does not claim it can.
- **The `['public', …]` namespace is still a latent risk.** It is retained
  across logout on purpose (`session-lifecycle.ts:16-20`) and is currently never
  populated, because every query that would use a public key is
  `enabled: scope !== undefined`. That is a convention held by inspection, not
  by a test or a type. Tracked as part of `eiams-frontend-wmwz`.
- **`profile` and `settings` have no content.** They are declared routes
  rendering the existing placeholder. Nothing in this task makes them
  functional.
- **The notification bell is still inert.** `app-header.tsx:85-99` is a
  focusable button with no `onClick`. No contract operation exists for
  notifications and `docs/ERD.md:82` defers stored notifications to v2, so it is
  inert but spec-faithful, and two tests assert its presence. Deliberately not
  touched here.
- **Dev-mode behaviour is surprising.** `VITE_AUTH_BYPASS` defaults on, so after
  logout the user lands on `/login` and hydration — which only runs while status
  is `initializing` — will not re-run. A hard reload is needed to get the bypass
  session back. That is correct, not a bug.

## Change log

- `src/shared/ui/dropdown-menu.tsx` — **new**, Base UI menu wrapper.
- `src/shared/ui/dropdown-menu.test.tsx` — **new**, 8 cases.
- `src/modules/auth/components/session-user-menu.tsx` — **new**, three-item
  user menu; single-click logout with honest failure semantics.
- `src/modules/auth/components/session-user-menu.test.tsx` — **new**, 7 cases.
- `src/shared/layout/header/app-header.tsx` / `app-layout.tsx` — `userMenu`
  prop path; caret trigger slot; identity rendered only when a session exists.
- `src/shared/layout/header/app-header.test.tsx`, `sidebar-nav-model.ts`,
  `sidebar-nav-model.test.ts` — updated for the new slot and the `account`
  group.
- `src/config/routes.ts` — `profile`, `settings`, the `account` group, and the
  shared `OPERATIONAL_VIEW_CODES` set.
- `src/config/route-registry.tsx` — `PAGES` entries for both.
- `src/app/app-router.tsx` / `app-router.test.tsx` — menu wired on the protected
  branch only.
- `src/modules/custody/hooks/use-custody-row-query.ts` — key rebuilt via
  `queryKeys.scoped`; orphan defect documented in the file.
- `src/modules/custody/hooks/use-custody-row-query.test.ts` — **new**, 4 cases.
- `src/modules/custody/hooks/use-custody-queries.ts` — `['asset']` fragment
  replaced with `assetQueryKeys.all(scope)`; `CUSTODY_RESOURCE` exported.
- `src/modules/asset/hooks/use-asset-queries.ts` — `assetQueryKeys.all` added.

Gates: 248 test files / 1737 tests, `typecheck` 0 errors, `lint` 0 errors with
the 5 documented baseline warnings, `format:check` clean.
