/**
 * Fills a generated OpenAPI path template with a path parameter.
 *
 * Every `{id}` placeholder in `path` is replaced by the URI-encoded value, so a
 * caller cannot accidentally build a request with an unencoded identifier. The
 * `docs/feature-service-composition-standard.md` rule "interpolate path
 * parameters with `encodeURIComponent`" is the reason this exists rather than a
 * template literal in each service: eight services had already grown their own
 * three-line copy of it, and a ninth (the count service) was about to as well.
 *
 * The path itself is still declared `satisfies keyof paths` at the call site, so
 * TypeScript proves the template is a real contract operation; this helper only
 * handles the substitution.
 */
export function pathWithId(path: string, parameter: string, id: string): string {
  return path.replace(parameter, encodeURIComponent(id))
}
