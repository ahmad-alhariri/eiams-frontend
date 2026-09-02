---
status: accepted
date: 2026-09-02
supersedes: (none)
---

# Warehouse reorganization is a document-driven operation (D-WH-02)

**Status:** Accepted, forward-looking (no v1 code)
**Decision ID:** D-WH-02
**Bead:** `eiams-frontend-e01.12`

## Decision (verbatim from the bead)

FORWARD-LOOKING DECISION (NOT for v1 implementation): When a branch grows
and splits one warehouse into multiple domain-owned warehouses, the split is
executed ONLY through posted, audited documents — NEVER a database
reassignment of inventory rows.

## Pattern (5 steps)

1. **SoftFreeze the source warehouse** (BDM SoftFreeze advisory) to block
   concurrent postings.
2. **Establish ground truth** via a real Count (جرد) document — do NOT trust
   the existing system balance blindly.
3. **Create the new Warehouse master records** via `warehouse.manage`, each
   with its own capability matrix.
4. **Move stock via posted documents:** Transfer (W-source -> W-new per
   domain) OR Opening Balance module (e15) seeded from the counted snapshot,
   then inactivate source.
5. **Set source warehouse status = Inactive** (Active/Inactive enum in
   `warehouse.schemas.ts`). NEVER delete.

## Invariants

- Documents created before the split remain immutable (e24-t08), still
  referencing the (now Inactive) source warehouse.
- Old warehouse is kept Inactive so historical documents still resolve
  (avoid 404-on-name in reports).
- Each new warehouse "knows" its inventory only because a document put it
  there; per-warehouse capability then prevents cross-domain mis-posting.
- User/role re-assignment (single manager -> WH_MGR @ Site or per-warehouse
  keepers) goes through the admin flow (D-SRS-01 single-role/single-scope).

## Already supported by the model

- Immutable ledgers (e24-t08).
- Active/Inactive status (warehouse.schemas.ts).
- SoftFreeze (BDM).
- Opening Balance (e15).
- Per-warehouse capability.

## Gaps to build later (not v1)

- (a) A guided "split wizard" UI enforcing the 5 steps atomically.
- (b) Ensure Inactive warehouse rejects new postings server-side.
- (c) Reports must resolve Inactive warehouse names for old documents.

## Consequences

### Positive

The split is an auditable event, not a hidden row move. Because every
balance in a new warehouse is created by a posted document (Transfer or
Opening Balance seeded from the counted snapshot), the historical ledger
remains reconcilable end-to-end: the old Inactive warehouse continues to
resolve on every report and document, and the new warehouses' stock is
provably the result of posted, immutable movements. Per-warehouse
capability, layered on top of the document-driven creation, makes
cross-domain mis-posting structurally hard rather than procedurally
discouraged, and the existing SoftFreeze advisory plus Immutable-ledger
guarantee (e24-t08) prevent a concurrent posting from racing the split.

### Negative

The pattern requires disciplined orchestration of five steps in order,
and the v1 model has no UI wizard enforcing them atomically. Until the
"split wizard" is built, an operator could freeze, count, create new
warehouses, and post transfers correctly, but if they forget to
inactivate the source warehouse, or if a posting races the SoftFreeze,
the split leaves a partial or duplicate footprint. The Inactive-status
hardening (server-side rejection of new postings) and the report-side
name resolution for Inactive warehouses are also deferred, so v1 reports
and v1 posting paths still need to treat Inactive as a real, referenceable
state rather than a soft delete.

## Cross-references

- **D-WH-01** (`eiams-frontend-e01.11`) — warehouse as
  separation-of-duties boundary (interpretation A/B); governs how the
  source and new warehouses are scoped during a split.
- **D-SRS-01** — single-role/single-scope assignment; the admin flow that
  moves the single manager to `WH_MGR @ Site` or per-warehouse keepers.
- **e24-t08** — immutable ledgers; preserves documents created before the
  split and the postings that performed it.
- **e15** — Opening Balance module; one of the two posted-document
  mechanisms used to seed a new warehouse from the counted snapshot.
- **BDM** — the SoftFreeze advisory used in step 1, and the
  per-warehouse capability enforced in step 4 onward.
- **D-ICF-01** (`docs/inventory-count-freeze-policy-decision.md`) — the
  v1 SoftFreeze-only policy that step 1 relies on.
