/**
 * Contract-drift gate: the live backend swagger against the endpoint contract
 * the frontend was actually written against.
 *
 * The frontend's production wire contract is the HANDWRITTEN per-module types
 * (D-INT-02), not the generated `eiams-v1.ts`. The design snapshot
 * `contracts/openapi/eiams-v1.openapi.json` is `ArchitectureOwnedProvisional`
 * (81 paths) while the live API serves 134, so gating "live == snapshot" would
 * be permanently red and would say nothing useful. This gate is therefore a
 * RATCHET: a committed baseline captured from the live API, re-checked on every
 * run. It answers one question -- did anything the frontend calls move under
 * it? -- and stays silent about paths the frontend never consumes.
 */

export interface ConsumedEndpoint {
  /** Repo-relative, forward-slashed, so a failure message names the caller. */
  readonly source: string
  /** Frontend-relative path, still OpenAPI-templated: `/warehouse-documents/{documentId}`. */
  readonly path: string
  /** `GET` / `POST` / ..., or null when the path reaches the transport as a helper argument. */
  readonly method: string | null
}

export interface Drift {
  readonly source: string
  readonly endpoint: string
  readonly message: string
}

export interface ConsumerBaseline {
  readonly endpoints: readonly {
    readonly path: string
    readonly method: string | null
    readonly sources: readonly string[]
    /** Sorted top-level property names of the success response payload. */
    readonly responseProperties: readonly string[]
  }[]
  /**
   * Consumed endpoints the live API does NOT serve, with why. They are listed
   * rather than silently dropped: silently dropping them would make the gate
   * green over a frontend that calls routes the API never implemented, which is
   * the exact failure this gate exists to catch.
   */
  readonly knownDivergences?: readonly {
    readonly path: string
    readonly method: string | null
    readonly source: string
    readonly reason: string
  }[]
}

const API_BASE_PREFIX = '/api/v1'

/** Only these count as the HTTP verb of a consumed endpoint. */
const HTTP_METHOD = /^(GET|PUT|POST|DELETE|PATCH)$/u

/**
 * Transport entry points. A file is a transport module only if it actually
 * reaches one of these; otherwise a stray `path:` string (`'*'`, a file path,
 * a router path) would be picked up as a consumed endpoint.
 */
const TRANSPORT_CALL = /\btransport\s*\.\s*(request|requestPage|requestEmpty)\b/u

const PATH_CONSTANT =
  /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*(['"])(\/[^'"]*)\2[^\n]*$/u

/** `path: X` / `method: 'GET'` inside one request object literal. */
const PATH_PROPERTY = /\bpath\s*:\s*([^,\n}]+)/gu
const METHOD_PROPERTY = /\bmethod\s*:\s*(['"])([A-Za-z]+)\1/u

/**
 * Resolves an expression to the module constant holding the path template:
 * `DOCUMENT_SUBMIT_PATH`, `'...'` and `pathWithDocumentId(X, id)` /
 * `pathWithId(X, '{id}', id)` all name the constant in their first argument.
 *
 * Returns null for anything unreadable, so an expression it cannot resolve is
 * skipped rather than guessed -- a wrong path would fail the gate for a reason
 * that has nothing to do with the API.
 */
function constantNamedBy(expression: string): string | null {
  const bare = expression.trim()
  if (/^[A-Za-z_$][\w$]*$/u.test(bare)) return bare
  const quoted = /^(['"])(.*?)\1/u.exec(bare)
  if (quoted !== null) return quoted[2] as string
  const helper = /^([A-Za-z_$][\w$]*)\s*\(([^,)]*)/u.exec(bare)
  if (helper !== null) {
    const argument = (helper[2] as string).trim()
    return /^[A-Za-z_$][\w$]*$/u.test(argument) ? argument : null
  }
  return null
}

/**
 * Every path constant a transport module declares, keyed by constant name.
 *
 * Only the file's own module constants are considered; a value may carry a
 * trailing `satisfies keyof paths` or other clause, which the regex ignores.
 */
function pathConstantsOf(source: string): ReadonlyMap<string, string> {
  const constants = new Map<string, string>()
  for (const line of source.split(/\r?\n/u)) {
    const match = PATH_CONSTANT.exec(line)
    if (match !== null) constants.set(match[1] as string, match[3] as string)
  }
  return constants
}

/**
 * The consumed endpoints of one transport module.
 *
 * Pairs `path:` with the `method:` on the same object literal. A path handed to
 * a helper as an argument (`executeEmptyAction(pathWithDocumentId(X, id), ...)`)
 * has no method at the call site, so it is recorded with `method: null` and the
 * gate checks existence only -- inventing a verb there would report a missing
 * `POST` on a route that exists.
 */
export function consumedEndpointsIn(source: string, sourceFile: string): ConsumedEndpoint[] {
  if (!TRANSPORT_CALL.test(source)) return []

  const constants = pathConstantsOf(source)
  const found = new Map<string, ConsumedEndpoint>()

  const record = (path: string, method: string | null): void => {
    const template = constants.get(path) ?? (path.startsWith('/') ? path : null)
    if (template === null) return
    const verb =
      method !== null && HTTP_METHOD.test(method.toUpperCase()) ? method.toUpperCase() : null
    const key = `${verb ?? '?'} ${template}`
    if (found.has(key)) return
    found.set(key, { source: sourceFile, path: template, method: verb })
  }

  for (const match of source.matchAll(PATH_PROPERTY)) {
    const name = constantNamedBy(match[1] ?? '')
    if (name === null) continue
    // The method is the first `method:` after the `path:` but BEFORE the object
    // literal closes. Cutting at the closing brace is wrong here because the
    // path expression itself can contain one (`pathWithId(X, '{id}', id)`), so
    // the window is bounded by the next request's `path:` instead.
    const rest = source.slice(match.index + match[0].length)
    const nextPath = rest.search(PATH_PROPERTY)
    const scope = nextPath === -1 ? rest : rest.slice(0, nextPath)
    const method = METHOD_PROPERTY.exec(scope)
    record(name, method === null ? null : (method[2] as string))
  }

  // A path that reaches the transport only as a helper argument
  // (`executeEmptyAction(pathWithDocumentId(SUBMIT_PATH, id), ...)`) has no
  // `path:` property at all, so the object-literal scan above never sees it.
  // Such a constant is recorded with no verb, and only when the scan did not
  // already pair it with one, so no `ANY` shadow duplicates a known `POST`.
  for (const name of constants.keys()) {
    const template = constants.get(name) as string
    const alreadyPaired = [...found.values()].some((e) => e.path === template && e.method !== null)
    if (!alreadyPaired) record(name, null)
  }

  return [...found.values()].sort((a, b) =>
    `${a.method ?? ''} ${a.path}`.localeCompare(`${b.method ?? ''} ${b.path}`),
  )
}

/** `true` when `frontendPath` addresses the same route as the live `livePath`. */
export function pathTemplateMatches(frontendPath: string, livePath: string): boolean {
  const expected = frontendPath.split('/')
  const actual = livePath.split('/')
  if (expected.length !== actual.length) return false
  return expected.every((segment, index) => {
    const live = actual[index] as string
    if (/^\{.+\}$/u.test(segment)) return true
    return segment === live
  })
}

/** Strips the server base path so a live route and a frontend constant compare equal. */
export function stripApiBase(livePath: string): string {
  return livePath.startsWith(API_BASE_PREFIX) ? livePath.slice(API_BASE_PREFIX.length) : livePath
}

interface LiveOperation {
  readonly path: string
  readonly method: string
  readonly responseProperties: readonly string[]
}

export type JsonNode = Record<string, unknown>

function isNode(value: unknown): value is JsonNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveRef(document: JsonNode, ref: string): JsonNode | null {
  if (!ref.startsWith('#/')) return null
  let node: unknown = document
  for (const segment of ref.slice(2).split('/')) {
    if (!isNode(node)) return null
    node = node[segment.replace(/~1/gu, '/').replace(/~0/gu, '~')]
  }
  return isNode(node) ? node : null
}

/**
 * Sorted top-level property names of the success response payload, following the
 * envelope down to its `data` so the fingerprint is the payload the frontend
 * types describe rather than the wrapper every response shares.
 *
 * Creates answer 201 and empty lifecycle actions answer 204, so the lowest 2xx
 * is read rather than a hardcoded 200. An empty schema yields an empty
 * fingerprint, which makes that endpoint an existence-only check.
 *
 * shortcut: status-code changes are not fingerprinted; they are the backend's
 * own `OpenApiSnapshotTests` to catch, and duplicating it here would only add
 * noise.
 */
function fingerprintOf(document: JsonNode, operation: JsonNode): string[] {
  const responses = isNode(operation['responses']) ? operation['responses'] : {}
  const successCode = Object.keys(responses)
    .filter((code) => /^2\d\d$/u.test(code))
    .sort()[0]
  const ok =
    successCode !== undefined && isNode(responses[successCode]) ? responses[successCode] : undefined
  if (ok === undefined) return []
  const content = isNode(ok['content']) ? ok['content'] : {}
  const media = isNode(content['application/json']) ? content['application/json'] : undefined
  const schema = media !== undefined && isNode(media['schema']) ? media['schema'] : undefined
  if (schema === undefined) return []

  return resolvePayloadProperties(document, schema, new Set())
}

/**
 * Descends a success schema to the payload the frontend types describe,
 * peeling `$ref`, array wrappers, and the shared `ApiResponse<T>` envelope's
 * `data` member. Every response in this API is wrapped in that envelope, so
 * stopping at the wrapper would fingerprint `success,data,pagination,meta` for
 * every endpoint and detect nothing.
 */
function resolvePayloadProperties(
  document: JsonNode,
  node: unknown,
  seen: ReadonlySet<string>,
): string[] {
  if (Array.isArray(node)) {
    const [inner] = node
    return inner === undefined ? [] : resolvePayloadProperties(document, inner, seen)
  }
  if (!isNode(node)) return []

  const ref = node['$ref']
  if (typeof ref === 'string') {
    if (seen.has(ref)) return []
    const resolved = resolveRef(document, ref)
    return resolved === null
      ? []
      : resolvePayloadProperties(document, resolved, new Set([...seen, ref]))
  }
  if (isNode(node['items'])) return resolvePayloadProperties(document, node['items'], seen)

  const properties = node['properties']
  if (!isNode(properties)) return []
  if (isNode(properties['data']))
    return resolvePayloadProperties(document, properties['data'], seen)
  return Object.keys(properties).sort()
}

/** Every operation the live document exposes, with `/api/v1` stripped. */
export function liveOperations(document: JsonNode): ReadonlyMap<string, LiveOperation> {
  const operations = new Map<string, LiveOperation>()
  const paths = isNode(document['paths']) ? document['paths'] : {}
  for (const [livePath, item] of Object.entries(paths)) {
    if (!isNode(item)) continue
    for (const [method, operation] of Object.entries(item)) {
      if (!isNode(operation)) continue
      const key = `${method.toUpperCase()} ${stripApiBase(livePath)}`
      operations.set(key, {
        path: livePath,
        method: method.toUpperCase(),
        responseProperties: fingerprintOf(document, operation),
      })
    }
  }
  return operations
}

function matchesLive(
  endpoint: ConsumedEndpoint,
  operations: ReadonlyMap<string, LiveOperation>,
): LiveOperation | null {
  if (endpoint.method !== null) {
    const exact = operations.get(`${endpoint.method} ${endpoint.path}`)
    if (exact !== undefined) return exact
  }
  for (const operation of operations.values()) {
    if (endpoint.method !== null && operation.method !== endpoint.method) continue
    if (pathTemplateMatches(endpoint.path, stripApiBase(operation.path))) return operation
  }
  return null
}

export function label(endpoint: ConsumedEndpoint): string {
  return `${endpoint.method ?? 'ANY'} ${endpoint.path}`
}

/**
 * The diff itself. Returns one entry per problem so the failure names the
 * method, the path and the concrete difference rather than a count.
 */
export function findDrift(
  consumed: readonly ConsumedEndpoint[],
  baseline: ConsumerBaseline,
  live: ReadonlyMap<string, LiveOperation>,
): Drift[] {
  const drifts: Drift[] = []
  const byEndpoint = new Map(baseline.endpoints.map((e) => [`${e.method ?? 'ANY'} ${e.path}`, e]))
  const diverged = new Set(
    (baseline.knownDivergences ?? []).map((d) => `${d.method ?? 'ANY'} ${d.path}`),
  )

  for (const endpoint of consumed) {
    const name = label(endpoint)
    if (diverged.has(name)) continue
    const match = matchesLive(endpoint, live)
    // A path whose call site never states the verb is fingerprinted under
    // whichever verb the live API resolved it to, so the baseline is looked up
    // by path for those rather than under the `ANY` key it was captured with.
    const expected =
      byEndpoint.get(name) ??
      (endpoint.method === null && match !== null
        ? byEndpoint.get(`${match.method} ${endpoint.path}`)
        : undefined)
    if (match === null) {
      drifts.push({
        source: endpoint.source,
        endpoint: name,
        message:
          expected === undefined
            ? 'consumed by the frontend, absent from the live API, and not in contracts/openapi/eiams-v1.consumer-baseline.json'
            : 'consumed by the frontend but absent from the live API (no matching live path/method)',
      })
      continue
    }
    if (expected === undefined) {
      drifts.push({
        source: endpoint.source,
        endpoint: name,
        message:
          'not in the consumer baseline; regenerate contracts/openapi/eiams-v1.consumer-baseline.json after a reviewed API change',
      })
      continue
    }
    const actual = [...match.responseProperties].sort()
    const wanted = [...expected.responseProperties].sort()
    const missing = wanted.filter((p) => !actual.includes(p))
    const added = actual.filter((p) => !wanted.includes(p))
    if (missing.length > 0 || added.length > 0) {
      drifts.push({
        source: endpoint.source,
        endpoint: name,
        message: `response properties drifted${
          missing.length > 0 ? `; removed: ${missing.join(', ')}` : ''
        }${added.length > 0 ? `; added: ${added.join(', ')}` : ''}`,
      })
    }
  }
  return drifts
}

/** One message per drift, ready to hand to `expect(...).toEqual([])`. */
export function describeDrifts(drifts: readonly Drift[]): string[] {
  return drifts.map((d) => `${d.endpoint} (${d.source}): ${d.message}`)
}

/** The discovered endpoints as the baseline shape, so capture is a pure call. */
export function toBaseline(
  consumed: readonly ConsumedEndpoint[],
  live: ReadonlyMap<string, LiveOperation>,
): ConsumerBaseline {
  const byEndpoint = new Map<string, ConsumerBaseline['endpoints'][number]>()
  for (const endpoint of consumed) {
    const name = label(endpoint)
    const match = matchesLive(endpoint, live)
    if (match === null) continue
    const existing = byEndpoint.get(name)
    byEndpoint.set(name, {
      path: endpoint.path,
      method: endpoint.method,
      sources: [...new Set([...(existing?.sources ?? []), endpoint.source])].sort(),
      responseProperties: [...match.responseProperties].sort(),
    })
  }
  return {
    endpoints: [...byEndpoint.values()].sort((a, b) =>
      `${a.path}|${a.method}`.localeCompare(`${b.path}|${b.method}`),
    ),
  }
}
