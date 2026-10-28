---
status: accepted
date: 2026-10-28
supersedes: (none)
---

# Single organization in v1, multi-tenant by design (D-ORG-01-prep)

**Status:** Accepted, forward-looking (no v1 multi-org feature)
**Decision ID:** D-ORG-01-prep
**Bead:** `eiams-frontend-eu1g.1`

## Decision (verbatim from the bead)

PREPARATION DECISION (not full multi-tenancy). v1 ships as one organization
(الهيئة المركزية للرقابة والتفتيش). The architecture must be multi-tenant by
design so v2 adds multi-org as a small delta, not a rewrite.

RULES:
(1) Promote Organization to a managed entity but seed exactly ONE row in v1;
    the site organizationId picker sources from it.
(2) Thread organizationId through ScopeCacheKey and SessionResponse as a single
    constant in v1.
(3) Derive display brand name from the org record, never hardcode.
(4) Centralize orgId sourcing in ONE hook/key factory.
(5) Backend must carry organization_id on every table from v1 (even as one
    constant) so v2 needs no schema migration.

OUT OF SCOPE for v1: org-selection gate, multi-org CRUD, cross-org admin, any
cross-org visibility. Full multi-org foundation is deferred to v2.

REJECTED: building v1 with no org concept then retrofitting (leak-prone
rewrite); shared-table tenant column trusted to app code (use structural
org-namespaced keys instead).

## Rule 5 - the backend organization_id requirement (eiams-frontend-eu1g.5)

The backend MUST carry `organization_id` on every table from v1, even as one
constant value equal to the seeded organization, so v2 multi-org requires no
schema migration and no data backfill. Tracked under `eiams-frontend-e01.7`
(contract ratification). This is a backend/contract note; the frontend
preparation under rules 1-4 proceeds independently.

Frontend rules 1-4 are safe regardless, because `organizationId` is a constant
in v1.

## Consequences

- `eiams-frontend-eu1g.2` (Organization managed entity, exactly one seeded row,
  and the site picker), `eiams-frontend-eu1g.3` (organizationId threaded
  through ScopeCacheKey and SessionResponse) and `eiams-frontend-eu1g.4` (the
  display brand read from the org record) are unblocked; they implement rules
  1-4.
- No user-facing organization selection appears in v1.