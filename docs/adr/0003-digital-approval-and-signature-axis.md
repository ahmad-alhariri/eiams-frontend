---
status: accepted
date: 2026-09-02
supersedes: (none)
---

# Digital approval & signature axis for enterprise governance (D-APP-01)

**Status:** Accepted, forward-looking (no v1 code)
**Decision ID:** D-APP-01
**Bead:** `eiams-frontend-e01.10`

## Decision (verbatim from the bead)

FORWARD-LOOKING DECISION (NOT for v1 implementation): When all EIAMS
operations become digital, the enterprise director (GOVERN @ Enterprise) gains
an APPROVE permission axis on top of GOVERN. Approval is a SEPARATE PERMISSION
AXIS, never an OPERATE action: the director AUTHORIZES drafted transactions
(Inter-branch transfers, adjustments, write-offs, high-value receipts) but
never keys them in. This preserves separation of duties via the
OPERATE/APPROVE axis split plus the single-role/single-scope rule.

WORKFLOW: Warehouse/Site manager creates document (state Draft, OPERATE) ->
routes to approver -> Enterprise director Approves/Signs (APPROVE) -> document
Posts. Extends D-LIFE-01 state machine with PendingApproval->Approved.

SIGNATURE EVOLUTION: (a) authorization click (audit-logged who/when/what) for
internal control; (b) PKI cryptographic digital signature (certificate + hash,
legal non-repudiation, tamper-evident at sign time) as the eventual target for
a central oversight authority. PKI is phase-2 infrastructure.

ANTI-BOTTLENECK: tiered/risk-based approval (routine low-value auto-approved
at Site; significant/exceptions routed to Enterprise); delegation/acting
approver to avoid single point of failure; four-eyes dual control for most
sensitive actions.

v1-READINESS (cheap, no overbuild): model permissions as axes now (reserve
APPROVE in taxonomy); keep D-LIFE-01 state machine extensible for
PendingApproval; audit log already actor+action+timestamp so a future
DocumentSignature read model (signer, role, timestamp, cert hash) layers on
without disturbing records.

STATUS: Documented for future phases. No v1 code. Ratify the APPROVE-axis
codes and PKI approach when digital-signature phase begins.

## Workflow (5 steps)

1. **Create (Draft, OPERATE).** A Warehouse or Site manager drafts a
   transaction (Inter-branch transfer, adjustment, write-off, or high-value
   receipt) in the generic document surface. The state is `Draft`. The act of
   drafting, keying line items, and saving the document requires the
   `OPERATE` permission axis; it is the manager's existing OPERATE role.
2. **Route.** The Draft is sent to the appropriate approver. Routing is a
   system action; it does not require any new permission. Tiered rules
   (Anti-Bottleneck, below) select Site-level vs. Enterprise-level routing.
3. **Approve / Sign (APPROVE).** The approver (routinely Site for low-value
   items; Enterprise director for significant or exceptional items) reviews
   the Draft and acts on it using the **APPROVE** permission axis. This is a
   separate axis from OPERATE: an approver who can also draft would defeat
   separation of duties, so the approver's role is restricted to APPROVE at
   the relevant scope. On approval, the state transitions
   `PendingApproval -> Approved` (the PendingApproval->Approved transition
   extends D-LIFE-01).
4. **Post.** Posting converts `Approved` into the posting event for the
   document type. Posting remains a manager-owned action under D-LIFE-01; the
   APPROVE signature on the document is the gate that proves authorization
   was given, but the post itself is not the approver's act.
5. **Audit + signature record.** The approval is recorded as both (a) an
   audit-log entry carrying actor, action, and timestamp, and — when PKI is
   active — (b) a `DocumentSignature` read-model row carrying signer, role,
   timestamp, and certificate hash. The two surfaces compose; the audit log
   is sufficient on its own for the (a) phase.

## Signature evolution

- **(a) Authorization click (internal control, phase 1).** A logged "Approve"
  action that records who, when, and what. Sufficient for internal control
  and segregation-of-duties. Lives entirely on the existing audit-log
  surface (D-AUD-02).
- **(b) PKI cryptographic digital signature (legal non-repudiation, phase
  2).** A certificate-bound signature (certificate + document hash) signed at
  the moment of approval. This is the eventual target for a central
  oversight authority and the legal non-repudiation tier. PKI is phase-2
  infrastructure: certificate authority, key custody, certificate pinning,
  revocation list, and trust chain are out of scope for v1 and for the
  pending digital-signature phase.

The (a) → (b) evolution is additive: (b) does not replace (a); it layers a
tamper-evident cryptographic seal on top of the audit-logged click. The
`DocumentSignature` read model is the join surface for both.

## Anti-bottleneck

- **Tiered / risk-based approval.** Routine, low-value documents (e.g. small
  receipts, ordinary transfers) are auto-approved at Site level using the
  Site manager's APPROVE role, so the Enterprise director is not on the
  critical path for everyday work.
- **Significant / exceptional routing.** High-value receipts, write-offs,
  adjustments, and inter-branch transfers above the configured threshold,
  plus any document flagged as an exception, route to the Enterprise
  director (GOVERN @ Enterprise) for APPROVE.
- **Delegation / acting approver.** The Enterprise director can delegate
  APPROVE to a named acting approver (subject to D-SRS-01: acting approver
  still operates on the single role, single scope, single scope's
  permission axes). The delegation is itself audit-logged. This prevents
  the Enterprise director's absence from blocking the business.
- **Four-eyes dual control.** For the most sensitive actions (large
  write-offs, inter-warehouse transfers above the upper threshold,
  cross-entity movements), two independent APPROVE signatures from
  different actors are required before the document can Post. Four-eyes is
  configured per document type, not on a global flag.

## v1-readiness (no code yet, but make the right things cheap to add later)

- **Model APPROVE in the permission taxonomy now.** The
  `resource.verb` taxonomy (D-RBAC-01) reserves the APPROVE-axis codes
  alongside the existing OPERATE codes. No v1 route or screen uses them,
  but the codes exist in the seed vocabulary so the digital-signature phase
  can light up the axis without a vocabulary migration.
- **Keep D-LIFE-01 extensible.** The generic document state machine
  (Draft -> Submitted -> Posted -> Reversed, with the adjustment exception
  and the Revise / Cancel branches) is the foundation. The
  `PendingApproval -> Approved` extension is an additive step that lands
  between Submitted and the document-type-specific posting action. v1
  documentation marks PendingApproval as a reserved but inactive state; no
  v1 code reads or writes it.
- **Audit log is already sufficient.** The D-AUD-02 audit surface carries
  actor, action, and timestamp. The future `DocumentSignature` read model
  (signer, role, timestamp, certificate hash) is a join onto the audit
  header: it does not disturb the existing append-only audit log or its
  history. No v1 audit-log schema change is required for the (a) phase.

## Consequences

### Positive

- Separation of duties is preserved at the design level: OPERATE and
  APPROVE are distinct permission axes on the same role/scope tuple, and
  the single-role/single-scope rule (D-SRS-01) prevents a single user from
  holding both axes on the same scope.
- The Enterprise director can govern without becoming a bottleneck:
  tiered thresholds route routine work to Site-level approvers, and
  delegation + four-eyes cover absences and the most sensitive cases.
- v1 work is light: the taxonomy reserve, the D-LIFE-01 extensibility
  note, and the audit-log surface are already present, so the future
  digital-signature phase has no retrofit cost in the v1 frontend.
- The signature-evolution path is additive and reversible: phase 1
  (audit-logged click) is shippable independently of phase 2 (PKI), and
  PKI can be enabled when the central oversight authority and CA
  infrastructure exist.

### Negative

- Approve-axis codes are reserved now but unused, so v1 readers may see
  what looks like dead taxonomy. The risk is that an implementer assumes a
  reserved APPROVE code is already wired; documentation and code review
  must keep the reservation clear.
- The PendingApproval state is documented but not in the v1 state
  machine. If a v1 implementation mistakenly reads or writes it, the
  document would be unprocessable. The D-LIFE-01 extensibility note must
  be honored.
- Tiered thresholds and four-eyes rules are policy, not yet contract.
  v1 cannot pre-publish the threshold table or the document-type
  four-eyes list; the digital-signature phase must ratify them.
- PKI is a substantial piece of phase-2 infrastructure (CA, key custody,
  certificate pinning, revocation). Documenting the target now does not
  reduce the build cost; it only ensures the v1 design is compatible
  with it.

## Cross-references

- **D-RBAC-02** (`eiams-frontend-e01.9`) — the GOVERN/OPERATE scope and
  permission-axis split that this decision extends with a third axis,
  APPROVE.
- **D-LIFE-01** (`eiams-frontend-e01-t04`) — the document state machine
  that this decision extends with `PendingApproval -> Approved`.
- **D-AUTH-01** (`eiams-frontend-e01-t03`) — session and active scope that
  pin the active user's role/scope and effective permissions when an
  APPROVE action is authorized.
- **D-SRS-01** — single-role/single-scope assignment; constrains how the
  Enterprise director's APPROVE axis is granted and how delegation
  interacts with role/scope.
- **D-AUD-02** (`eiams-frontend-e01-t06`) — the audit detail surface
  (actor + action + timestamp) that already supports phase-1
  authorization-click and onto which the future `DocumentSignature`
  read model joins.
- **D-RBAC-01** — the `resource.verb` permission vocabulary in which the
  APPROVE-axis codes are reserved.
