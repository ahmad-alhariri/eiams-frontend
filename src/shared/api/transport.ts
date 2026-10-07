import { createAxiosTransport } from '@/shared/api/axios-transport'
import type { ApiTransport } from '@/shared/api/api-transport'
import { apiClient } from '@/shared/services/api.client'

/**
 * The application's single production `ApiTransport`.
 *
 * THIS MODULE IS THE COMPOSITION ROOT for the transport seam, and it exists
 * because `eiams-frontend-9uuf` found `createAxiosTransport` with ZERO
 * callers anywhere in the tree - not even tests. Five services declared their
 * singleton as `createXService({} as any)` and were handed a real transport
 * only by `set*Service(...)` inside tests, so the first runtime list call
 * threw `TypeError: transport.requestPage is not a function`. main looked
 * green because its own tests cast an `AxiosInstance` to `ApiTransport`:
 * axios exposes `get/post/put/delete/patch/request` but NOT
 * `requestPage/request/requestEmpty`, so the cast satisfied TypeScript while
 * defeating the check. The defect was masked, not absent.
 *
 * WHY A MODULE AND NOT `boot.tsx`. Services need their singleton at module
 * evaluation time, which is earlier than any render. Injecting from a React
 * component would reintroduce an ordering hazard - a hook that runs before
 * the injection line would capture the previous value - so the transport is
 * constructed once here, at import time, and services import this binding.
 * `apiClient` is itself a module-scope singleton, so import order inside this
 * file is not a hazard either.
 *
 * `ApiTransport` is applied as an explicit annotation rather than left
 * inferred from `createAxiosTransport`'s object literal. That is deliberate:
 * it turns any future change to the adapter into a compile error here instead
 * of a runtime `is not a function` in a service.
 *
 * Services must import `apiTransport` to build their singleton. They must not
 * construct their own transport, and they must never default to an empty
 * object: `src/test/no-transport-cast.test.ts` fails the build if either
 * appears under `src/**`.
 */
export const apiTransport: ApiTransport = createAxiosTransport(apiClient)
