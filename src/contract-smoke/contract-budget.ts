/**
 * The contract suite's ONE shared request budget (eiams-frontend-69yr R3).
 *
 * WHY THIS EXISTS. The Round-2 run fired its probes as fast as it could and
 * exhausted the backend's rate limit, so nearly every probe came back 429 and
 * the "divergence report" was mostly a BLOCKED report. Every request the suite
 * makes — through the app's apiClient interceptors or through the few raw
 * probes — must therefore pass through this module-level singleton, which
 * paces itself under the backend's REAL measured limits.
 *
 * Measured limits (read from
 * `eiams-backend/src/Web.Api/Extensions/RateLimitingExtensions.cs`, confirmed
 * against middleware order in `eiams-backend/src/Web.Api/Program.cs`):
 *
 * - Global: a FixedWindow limiter of `RateLimiting:Global:PermitLimit` = 100
 *   permits per `WindowInSeconds` = 60 s (lines 15-16), applied through
 *   `options.GlobalLimiter` to every endpoint. The partition key
 *   (`GetPartitionKey`, lines 169-177) is the AUTHENTICATED USER id
 *   (`user:{guid}`) because `Program.cs` calls `UseAuthentication()` (line 140)
 *   BEFORE `UseRateLimiter()` (line 142); pre-auth requests (login/refresh
 *   without a bearer token) fall back to `ip:127.0.0.1`.
 * - Authentication policy: `RateLimiting:Authentication:PermitLimit` = 10
 *   permits per 60 s (lines 17-18) on LoginController, RefreshTokenController,
 *   LogoutController, RecoverAdministratorController.
 * - Concurrency ceilings (Reporting 8, Upload 2, Posting 4) cannot be hit by a
 *   suite that runs one request at a time.
 *
 * Because the whole run shares one client IP and every user's budget is keyed
 * separately, the suite paces EVERYTHING through one 80-permits-per-60 s
 * window (a safety margin under the tightest partition we can touch) and an
 * 8-permits-per-60 s window on the /auth endpoints. A 429 is never swallowed
 * as a pass: it is retried up to a bounded limit honouring `Retry-After`, and
 * a persistent 429 fails with the exact status and body.
 *
 * The suite runs all test files in ONE vitest worker (`isolate: false` +
 * `fileParallelism: false` in `vitest.contract.config.ts`) so this module
 * registry — and this budget — is genuinely shared across files.
 */

const WINDOW_MS = 60_000
/** Suite pace: under the global 100/60 s with margin, across ALL users combined. */
const GLOBAL_PERMITS = 80
/** Login pace: under the authentication policy's 10/60 s. */
const AUTH_PERMITS = 8
/** Gentle minimum gap between consecutive requests on the same window. */
const MIN_GAP_MS = 250

/** 429 is retried at most this many times before failing with exact evidence. */
export const CONTRACT_429_RETRY_LIMIT = 3
/** Ceiling for ONE retry sleep honouring `Retry-After`. */
const MAX_429_SLEEP_MS = 30_000
/** Hard cap for the whole run; pacing that would exceed it must report, not truncate. */
const RUN_CAP_MS = 9 * 60_000

export interface ContractBudgetStats {
  readonly totalRequests: number
  readonly retries429: number
  readonly pacedSleeps: number
  readonly runtimeMs: number
}

interface PacedWindow {
  readonly limit: number
  readonly stamps: number[]
}

function startedAt(): number {
  // The budget singleton starts its clock when the first test file imports it.
  return Date.now()
}

const clockStart = startedAt()

class ContractBudget {
  private readonly globalWindow: PacedWindow = { limit: GLOBAL_PERMITS, stamps: [] }
  private readonly authWindow: PacedWindow = { limit: AUTH_PERMITS, stamps: [] }
  readonly stats = { totalRequests: 0, retries429: 0, pacedSleeps: 0 }

  /**
   * Reserves one slot on the global window (and, for /auth endpoints, on the
   * authentication window). Sleeps when the budget is nearly spent.
   */
  async acquire(url: string): Promise<void> {
    this.stats.totalRequests += 1
    await this.waitFor(this.globalWindow)
    if (isAuthenticationEndpoint(url)) {
      await this.waitFor(this.authWindow)
    }
    this.stamp(isAuthenticationEndpoint(url))
  }

  /**
   * Sleep before a 429 retry, honouring the backend's `Retry-After` header
   * (seconds, as emitted by `RateLimitingExtensions.OnRejected`, lines 45-54).
   */
  async acquireAfter429(retryAfterHeader: unknown): Promise<void> {
    this.stats.retries429 += 1
    const seconds = typeof retryAfterHeader === 'string' ? Number(retryAfterHeader) : Number.NaN
    const waitMs = Number.isFinite(seconds) ? Math.min(seconds * 1000, MAX_429_SLEEP_MS) : 1000
    await this.sleepChecked(waitMs + 250)
  }

  statsNow(): ContractBudgetStats {
    return { ...this.stats, runtimeMs: Date.now() - clockStart }
  }

  private stamp(authEndpoint: boolean): void {
    const now = Date.now()
    this.globalWindow.stamps.push(now)
    if (authEndpoint) {
      this.authWindow.stamps.push(now)
    }
  }

  private async waitFor(window: PacedWindow): Promise<void> {
    for (;;) {
      const now = Date.now()
      while (window.stamps.length > 0 && now - (window.stamps[0] as number) >= WINDOW_MS) {
        window.stamps.shift()
      }
      if (window.stamps.length < window.limit) break
      const waitMs = WINDOW_MS - (now - (window.stamps[0] as number)) + 100
      this.stats.pacedSleeps += 1
      await this.sleepChecked(waitMs)
    }
    // A minimum gap between consecutive stamps keeps parallel file-runners
    // from bursting a fresh window.
    const stamps = this.globalWindow.stamps
    const last =
      stamps.length > 0 ? (stamps[stamps.length - 1] as number) : Number.NEGATIVE_INFINITY
    const sinceLast = Date.now() - last
    if (sinceLast < MIN_GAP_MS) {
      await this.sleepChecked(MIN_GAP_MS - sinceLast)
    }
  }

  private sleepChecked(ms: number): Promise<void> {
    if (Date.now() - clockStart + ms > RUN_CAP_MS) {
      throw new Error(
        `CONTRACT-RUNTIME-CAP: pacing this suite honouring the backend rate limit ` +
          `would exceed the ~10-minute run cap (needed ${Math.round(ms)}ms more after ` +
          `${Math.round((Date.now() - clockStart) / 1000)}s). Report this instead of ` +
          `truncating coverage: reduce the number of probes per window.`,
      )
    }
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/** Endpoints under the Authentication rate policy (LoginController, RefreshTokenController,
 * LogoutController, RecoverAdministratorController — see the measured limits above). */
function isAuthenticationEndpoint(url: string): boolean {
  return /\/auth\/(login|refresh|logout|recovery\/administrator)$/u.test(url)
}

export const contractBudget = new ContractBudget()

/**
 * The ONLY raw-fetch escape hatch, for endpoints the frontend does not service
 * through the transport (the health probe). Paced by the same shared budget
 * and retried on 429 exactly like the axios transport.
 */
export async function budgetedFetch(url: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= CONTRACT_429_RETRY_LIMIT; attempt += 1) {
    await contractBudget.acquire(url)
    const response = await fetch(url, init)
    if (response.status !== 429) {
      return response
    }
    if (attempt === CONTRACT_429_RETRY_LIMIT) {
      const body = await response.text()
      throw new Error(
        `CONTRACT 429 UNRECOVERED: GET ${url} observed status=429 body=${body.slice(0, 400)}`,
      )
    }
    await contractBudget.acquireAfter429(response.headers.get('retry-after'))
  }
  throw new Error('CONTRACT 429 UNRECOVERED: unreachable retry state')
}
