---
status: accepted
date: 2026-10-28
supersedes: (none)
---

# Warehouse activation is not a v1 user-interface capability (D-WH-02)

**Status:** Accepted
**Decision ID:** D-WH-02
**Bead:** `eiams-frontend-63mf`

## Decision (verbatim from the bead)

Decide whether activation belongs in the UI at all (it is arguably an
administrative/lifecycle concern rather than a list-form field), and if so bind
the route and add the mutation.

## Decision

Activation is NOT a v1 user-interface capability. It is an administrative and
lifecycle concern rather than a list-form field, and the backend binds no
activation route to call: there is no `PUT /warehouses/{id}/status`, nor an
equivalent for sites, organizational units or employees. The frontend therefore
cannot bind the route or add the mutation without inventing a contract, and the
`txq4` migration deliberately REMOVED the status control rather than leave a
control that silently did nothing.

`status` therefore stays READ-ONLY in v1 for warehouses, sites, organizational
units and employees. A future UI for activation must be preceded by the backend
route; the frontend work is then a thin binding of that route and is not blocked
on a frontend decision.

## Related gap

The paginated list routes for sites and warehouses have no search parameter in
the backend query contract at all. That is a separate backend follow-up
(`eiams-frontend-urmx` covers warehouses), not part of this decision.

## Consequence

No frontend code change. The bead closes on this decision.