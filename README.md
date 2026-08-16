# EIAMS Frontend

Enterprise Inventory & Asset Management System frontend for the Syrian General
Authority for Oversight and Inspection.

## Stack

- React 19
- TypeScript 6
- Vite 8

The complete frontend architecture, module boundaries, UI rules, and business
constraints are defined in `AGENTS.md` and `docs/`.

## Package manager

Use pnpm 11.20.0 and the committed `pnpm-lock.yaml` for reproducible installs:

```bash
pnpm install --frozen-lockfile
```

## Scripts

```bash
pnpm run dev
pnpm run build
pnpm run lint
pnpm run lint:fix
pnpm run typecheck
pnpm run test
pnpm run test:watch
pnpm run format
pnpm run format:check
pnpm run quality
pnpm run ui:info
pnpm run contract:validate
pnpm run api:types:dry
pnpm run api:types:generate
pnpm run api:types:check
pnpm run preview
```

`pnpm run quality` is the CI-equivalent gate: generated API drift check, lint,
typecheck, format check, Vitest, and production build.

## Foundation reproducibility

To verify the foundation from a clean checkout, run:

```bash
pnpm install --frozen-lockfile
pnpm run quality
pnpm exec vitest run src/test/foundation-reproducibility.test.ts
```

The focused reproducibility test checks the committed package manager pin,
foundation scripts, strict TypeScript alias setup, Vite/Vitest/MSW wiring,
Arabic RTL entry point, shared UI config, same-origin environment default, and
CI quality workflow.

## Environment configuration

The frontend uses `/api/v1` as its same-origin API path by default. To override
the path locally, create `.env.local` from `.env.example` and set:

```dotenv
VITE_API_BASE_URL=/api/v1
```

`VITE_API_BASE_URL` must remain an origin-relative path so authentication can
use the configured same-origin HTTPS proxy and host-only refresh cookie. Vite
exposes every `VITE_*` value to browser code, so these variables must never
contain credentials or other secrets.

### Development API proxy

The Vite dev server proxies the configured API path (default `/api/v1`) to a
locally running EIAMS backend. The browser always talks to the same origin, so
the host-only refresh cookie works without CORS. With `VITE_ENABLE_API_MOCKS`
at its default (`true`), MSW still answers known endpoints first and the proxy
only receives bypassed requests; set mocks to `false` to exercise the real
backend. The proxy is development-only:

- it is never part of the production build, and
- its target comes from `EIAMS_DEV_PROXY_TARGET`, which is deliberately not
  `VITE_*`-prefixed so the backend origin never reaches browser code. Set it
  in `.env.local`, e.g.:

```dotenv
EIAMS_DEV_PROXY_TARGET=http://localhost:8080
```

The default target is `http://localhost:8080`; when no backend is listening,
API requests fail with a clear gateway error state instead of falling through
to the SPA HTML fallback.

## Production build and hosting

Create the release artifact with the same quality gate used by CI:

```bash
pnpm install --frozen-lockfile
pnpm run quality
```

The production build is written to `dist/`. It targets ES2023 browsers, uses
hashed assets beneath `dist/assets/`, splits CSS, and does not publish browser
source maps. The `/dev/gallery` route and its module are development-only and
are excluded from production output.

The hosting platform must serve the SPA entry point for application routes,
proxy the configured origin-relative API path to EIAMS, and terminate HTTPS on
the same host. This is required for the host-only `Secure`, `HttpOnly`,
`SameSite=Strict` refresh cookie. Do not place API credentials, JWTs, refresh
cookies, or backend URLs in browser-visible environment variables.

The committed OpenAPI snapshot remains provisional. Production API integration
requires backend/API-owner ratification and a versioned contract/provenance
update if any implemented behavior differs from the snapshot.

## Shared UI generation

shadcn is configured to generate Base UI primitives into `src/shared/ui` with
Tabler icons, Tailwind CSS v4, the shared `cn()` utility, and RTL support. Before
adding a primitive, inspect the resolved project configuration and preview the
registry changes:

```bash
pnpm run ui:info
pnpm run ui:add:dry <component>
```

After reviewing the files and dependencies reported by the dry run, generate
the primitive with:

```bash
pnpm run ui:add <component>
```

Generated output must remain in `src/shared/ui`, use the tokens in
`src/index.css`, and be reviewed for Arabic RTL behavior and accessibility.
Do not use `--overwrite` without first reviewing the generated diff. Primitive
generation belongs to the Beads task that owns that component; this setup task
does not install the complete registry.

This scaffold intentionally contains only the semantic React entry point and
approved foundation configuration. Generated design primitives, routing, API
clients, and business modules are implemented by their later Beads tasks.

## API contract generation

`contracts/openapi/eiams-v1.openapi.json` is the only admitted frontend
generation input. Its provenance, version, checksum, and coverage are recorded
in `contracts/openapi/eiams-v1.provenance.json`.

OpenAPI generation is configured by `scripts/openapi-generation.config.mjs` and
runs through `scripts/generate-api-types.mjs`:

```bash
pnpm run api:types:dry       # validate provenance and deterministic generation without writing
pnpm run api:types:generate  # write generated types to src/shared/types/generated/eiams-v1.ts
pnpm run api:types:check     # verify the generated output is current
```

Generated API files must not be edited by hand. Backend/API-owner ratification
remains required before production integration; contract drift must be resolved
with a versioned OpenAPI/provenance update and regeneration.
