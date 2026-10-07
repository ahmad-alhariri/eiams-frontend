---
status: accepted
date: 2026-09-02
supersedes: D-INT-01 generated-TypeScript strategy
---

# Use handwritten TypeScript contracts for direct backend integration

EIAMS will integrate the React frontend directly with the authoritative .NET
backend running on localhost during development. The frontend will own a small
handwritten transport contract and handwritten request, response, and view-model
types within each domain module; it will not generate TypeScript from OpenAPI.
This replaces the repository's provisional/generated contract workflow because
the backend is now implemented and can be inspected, tested, and evolved with
the frontend module by module.

The backend remains authoritative for routes, serialized field names, response
envelopes, permissions, scope, workflow, concurrency, and business validation.
The frontend remains authoritative for Arabic presentation models, form models,
and client-side usability validation. Backend Swagger may remain as a human
diagnostic surface, but it is not a TypeScript source, build input, or drift
gate.

## Consequences

- The OpenAPI snapshot, provenance files, generator scripts, generated
  TypeScript, generator dependencies, and generator-specific CI/tests will be
  removed through a controlled strangler migration.
- The loss of generated compile-time drift detection is compensated by backend
  JSON contract-characterization tests, handwritten module service tests, a
  live-localhost integration suite, and a reviewed contract-delta ledger.
- Wire response types and frontend models are separate when names, nullability,
  pagination, mutation results, or presentation needs differ; pass-through
  adapters are not created when the shapes are genuinely identical.
- Existing generated imports may remain only as temporary migration scaffolding.
  New imports are forbidden, and the legacy file is deleted when the final
  module reaches zero imports.
