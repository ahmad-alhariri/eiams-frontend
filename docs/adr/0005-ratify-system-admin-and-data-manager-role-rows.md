---
status: accepted
date: 2026-10-28
supersedes: (none)
---

# Ratification of the SYSTEM_ADMIN and DATA_MANAGER role rows (D-RBAC-01-A1)

**Status:** Accepted - ratified addendum to D-RBAC-01
**Decision ID:** D-RBAC-01-A1
**Bead:** `eiams-frontend-8haa`

## Decision (verbatim from the bead)

An explicit owner decision on whether the approved v1 baseline is:
- `SYSTEM_ADMIN` = the 10 structural codes, holding no `audit.view` and no
  `report.view`, and
- `DATA_MANAGER` = not seeded in v1 (deferred),
or something else. The decision must be recorded as a ratified addendum in the
canonical system repository, then cited by ID in the frontend matrix - not
pasted into it.

## The ratified baseline

`SYSTEM_ADMIN` holds exactly these ten structural codes: `catalog.view`,
`catalog.manage`, `organization.view`, `organization.manage`, `warehouse.view`,
`warehouse.manage`, `admin.user.view`, `admin.user.manage`, `admin.role.view`,
`admin.role.manage`.

It must not create, submit, post, reject, reverse, count, adjust or dispose
inventory documents, and it holds NEITHER `audit.view` NOR `report.view`. The
ADMIN axis is `SYSTEM_ADMIN`-only (D-RBAC-02), so no other role holds
`admin.*`.

`DATA_MANAGER` is deliberately excluded from the v1 operational model and is
NOT seeded. A master-data steward is covered structurally by `SYSTEM_ADMIN`
`catalog.manage` / `organization.manage` / `warehouse.manage`.

## What this settles

Before this addendum the frontend matrix said `SYSTEM_ADMIN` = "All v1 codes"
and seeded a `DATA_MANAGER` row for a role the backend does not create. Both
rows were corrected on 2026-09-27 (`eiams-frontend-e24-t07`) to match the
approved policy; this addendum RATIFIES them, so they are no longer awaiting
formal owner ratification.

The backend role seeds already match: `RolePermissionConfiguration.cs:136-142`
grants `SYSTEM_ADMIN` the same ten structural codes. No backend change is
required by this decision.

## Authority

This addendum is the ratified text. `docs/route-permission-scope-matrix.md`
CITES it by ID and date and does not copy its prose. Where the two disagree,
this document wins.