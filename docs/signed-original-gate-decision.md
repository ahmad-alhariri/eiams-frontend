# EIAMS Signed-Original Attachment Gate Contract Decision

**Status:** Approved frontend and provisional API contract decision
**Decision ID:** D-ATT-01
**Version:** 1.0.0
**Beads:** `eiams-frontend-e01-t05`
**Decision date:** 2026-08-09

## Decision

The signed-original gate is a server-authoritative evaluation of the
document's attachment state. The frontend never infers it from filenames,
client-only upload state, attachment counts, MIME sniffing, or local checksum
math. The only signal that may enable Post is the server evaluation returned
through the document policy.

An attachment satisfies the gate when and only when the server confirms all of
the following:

- exactly one active attachment of `attachment_type = SignedOriginal` is bound
  to the document;
- that attachment passed upload-time validation (non-empty content, allowed
  content type, size within the contract-documented limit, and a
  server-computed integrity checksum); and
- the document's policy reports `signedOriginalSatisfied = true` for the
  current evaluation state.

Verification therefore means **validated upload plus typed booking**, not a
human review step. V1 has no scanner-quality control, no OCR, and no separate
"approve the scan" action: PRD D-WF-01 removes the approval step, and D-DOC-01
defines the signed copy purely by `attachment_type`. The legal anchor is the
upload-time validation plus the signed-original designation plus the schema
§10.5 posting invariant (`document_status = Posted ⇒ a SignedOriginal
attachment exists`). Uploading a new SignedOriginal in Draft replaces the
previous one as the gate satisfier; the replaced record remains visible in the
immutable attachment list and audit trail but never satisfies the gate again.

## Problem being solved

The governing sources require a signed paper copy to be attached **and
verified** before posting, but they define only the `DocumentAttachment`
type/metadata fields (D-DOC-01, schema §10) and leave the meaning of
"verified" to the workstream (requirements-conflict-matrix U-03). Without a
single decision, features would guess: treat any uploaded file as success,
block Post on a local filename check, or synthesize a verification badge from
client-only state — each weakening the audit rationale and racing the server
policy. The provisional contract already exposes `signedOriginalSatisfied`
and the upload/delete operations, so this decision pins their semantics rather
than inventing a parallel mechanism.

## Governing evidence

| Source | Governing consequence |
| --- | --- |
| PRD §1.2, §4 (D-DOC-01) | Signed copy is a precondition for posting; `attachment_type` distinguishes `SignedOriginal` from `Supporting`. |
| PRD Chapter 7 flows and Chapter 12 | The keeper uploads the scanned signed copy in Draft before Submit, then the manager posts. |
| PRD §10.5 Signed-copy rule | `document_status = 'Posted' ⇒ an attachment with `attachment_type = 'SignedOriginal'` exists`; the DB invariant, not a button, is the binding rule. |
| D-LIFE-01 (Post row) | Post succeeds only when manager authority **and** signed-original state succeed under the evaluated `DocumentPolicy`. |
| D-ADJ-01 | Adjustment and Disposal also require a signed-original gate before Post; for Disposal the attachment is the disposal authorization. |
| D-WF-01 | There is no manager-approval step; the signed copy never substitutes for role authority — both gates are required. |
| SAD §9.1, §12 | One shared generated API layer; posted documents are immutable; Arabic feedback; never surface raw server internals. |
| Component guidelines §10 | Document screens display signed-original state before Submit/Post and lock attachment controls outside the mutable window defined here. |
| D-OAS-01/02 | Upload mechanics, type distinction, verification/policy state, and failure responses are explicit contract surface. |
| AGENTS.md | Post stays disabled until `attachment_type = SignedOriginal` is uploaded; keeper/manager separation is a UI rule. |

## Canonical gate states

The gate evaluates at policy time. The frontend consumes the states below only
from `DocumentPolicy` (never from a raw attachment count):

| Policy signal | Meaning | Frontend behavior |
| --- | --- | --- |
| `signedOriginalSatisfied = true` | A valid signed copy exists at evaluation time | Post actions may be enabled for the manager; permission and all other policy checks still re-validate at mutation time. |
| `signedOriginalSatisfied = false` | No valid signed copy at evaluation time | Post renders `Disabled` with the Arabic reason from the policy action/blocker; the panel explains the missing gate in Arabic. |
| Policy pending/error | Evaluation not available | Show an indeterminate state; never enable Post. |

Machine gate reasons ride the shared blocker vocabulary:

- `signed_original_missing` — no SignedOriginal attachment exists;
- `signed_original_invalid` — a record exists but is not an active satisfier
  (replaced/archived) or failed upload validation;
- `signed_original_immutable` — attachment mutation attempted outside the
  mutable window (server-provided reason, never invented by the client).

## Attachment lifetime and authority

| Document status | Upload | Delete | Panel treatment |
| --- | --- | --- | --- |
| `Draft` (including a post-`Revise` Draft) | Allowed | Allowed (including the satisfier) | Interactive |
| `Submitted`, `Rejected` | Denied — only `Revise` → `Draft` re-opens | Denied | Read-only |
| `Posted`, `Reversed`, `Cancelled` | Denied | Denied | Read-only; identities remain for audit links |

Authority rules by document policy kind:

- **Generic** documents (Receiving, Issue, Transfer, Opening, Return): the
  Warehouse Keeper owns upload/delete in Draft; after `Revise`, the restored
  keeper Draft re-opens them. The `document.update` permission within the
  document's warehouse scope gates these mutations; exact codes are owned by
  `e01-t07`.
- **Adjustment/Disposal** (D-ADJ-01): the Warehouse Manager owns upload/delete
  in Draft; keeper attachment controls are never rendered.

Every upload/delete carries the document `rowVersion`. A `409` response
discards any optimistic UI state and refetches document detail, policy, and
attachments before rendering.

## Attachment transport contract

Canonical operations in the provisional contract (with the increments below):

- `POST /warehouse-documents/{documentId}/attachments` — multipart form data
  with `attachmentType` (`SignedOriginal | Supporting`), non-empty `file`, and
  `rowVersion`; returns `201 DocumentAttachment`; errors `413` (size limit),
  `415` (unsupported media type), `422` (empty/file/validation failure),
  `401/403/404`, `409` (concurrency or status conflict).
- `GET /warehouse-documents/{documentId}/attachments` — orderly list of
  `DocumentAttachment` including archived satisfier records.
- `DELETE /warehouse-documents/{documentId}/attachments/{attachmentId}?rowVersion=…`
  — Draft-only removal, `204`; `403/409/404` otherwise.

The frontend never:

- constructs storage URLs, reads `file_path`, or uses `checksum`;
- stores file bytes in TanStack Query, Zustand, or component memory beyond the
  transient upload form state;
- computes, verifies, or displays the checksum;
- downloads except through the contract-provided authorized `downloadUrl`.

Concurrency and status failures use the shared problem envelope with
Arabic-safe display text. The shared FileDropzone (`e04-t09`) mirrors the
contract limits for UX only; the authoritative rejection is the server
response.

## Downstream frontend behavior

1. **Policy-driven Post enablement.** The lifecycle action bar (`e04-t15`)
   and the policy-gate coordinator (`e12-t12`) read `policy.signedOriginalSatisfied`
   and each action's `presentation`. Post/Reverse-style gate-dependent actions
   for Adjustment and Disposal use the same signal through the adjustment
   policy.
2. **Shared attachment panel (`e04-t13`).** Renders the attachment list from
   `GET …/attachments` plus the gate state from policy; shows Arabic status
   (satisfier badge versus explaining missing state), type tags
   (`SignedOriginal`/`Supporting`), and read-only treatment outside Draft.
   Upload/delete mutations invalidate the document, policy, and attachment
   queries as one group.
3. **Mutability by status and role.** Upload/delete controls are rendered
   only inside the mutable window (Draft after `Revise`) and only for users
   with `document.update` and, for adjustment, the manager-ownership rule.
4. **No optimistic gate.** After a successful upload/delete, the server
   response is installed; on failure an Arabic error is shown and the policy
   is refetched. A "satisfied" badge is never drawn before the server
   confirms it.
5. **Adjustment exception preserved.** D-ADJ-01 screens never render Submit/
   Reject/Revise/Cancel but do render the signed gate and its Arabic reason on
   Post.
6. **Missing-signed recovery.** A Submitted document without a satisfier
   shows Post disabled with the Arabic reason; the correction path is
   Manager Reject → Keeper Revise → Draft → upload → Submit → Post. There is
   no bypass in v1.
7. **Accessibility/RTL.** The panel is keyboard-accessible, copy is Arabic,
   layout uses logical properties, and states use icon plus text, never color
   alone.

## Compatibility and OpenAPI impact

D-ATT-01 keeps the provisional layout and requires these contract increments:

- `DocumentPolicy`: add a nullable `satisfyingSignedOriginal` summary
  (attachment identity, filename, MIME, size, `uploadedAt`, `uploadedBy`,
  `checksum` — never the bytes) so the UI can show which document satisfies
  the gate; keep `signedOriginalSatisfied` as the boolean.
- Upload operations: document `maxSizeBytes` and `allowedContentTypes` as
  contract-level parameters, with the `413/415/422` problem envelope carrying
  Arabic-safe messages. Concrete values are backend configuration and wait for
  `e01.7`.
- Replace-and-lock semantics: replacing a satisfier in Draft is allowed;
  adding/deleting after Submit returns `403 signed_original_immutable` or
  `409`; attachments of a Posted document are never mutated.
- Add the machine blocker codes (`signed_original_missing`,
  `signed_original_invalid`) to the shared policy blocker vocabulary.
- The read projections must carry satisfier provenance (`uploadedAt`,
  `uploadedBy`); no raw byte or storage path ever leaves the API.

Backend ratification remains `eiams-frontend-e01.7`; divergence modifies the
versioned contract and generated clients, never a handwritten adapter.

## Affected Beads

| Bead | Required outcome |
| --- | --- |
| `e04-t09` | Shared FileDropzone consumes the upload contract and Arabic 413/415/422 feedback; signed-copy selection honors the mutability window. |
| `e04-t13` | Shared attachment panel renders the list, the gate state, and the Draft-only mutation rules of this decision. |
| `e04-t15` | Lifecycle action bar disables gate-blocked Post from policy `presentation`/`blockers`; never infers satisfaction locally. |
| `e12-t12` | Policy-gate coordinator treats the signed gate as one preflight gate; no local re-derivation of satisfaction. |
| Document features (`e13`–`e19`), adjustment (`e21`) | Consume the panel/gate infrastructure; never gate Post by local file state. |
| `e01-t07` | Map `document.update` to attachment upload/delete and `document.post` to the signed-original gate; no parallel permission strings. |
| `e01.7` | Ratify blockers, policy summary schema, and concrete 413/415 values before production. |
| `e24-tXX` integration | Upload → satisfier → Post enable; replace-in-Draft; denial in non-Draft; `409` refetch; adjustment disposal gate. |

## Rejected alternatives

| Alternative | Reason rejected |
| --- | --- |
| Client-side verification via filename, MIME, or size | Circumvents server ownership; filename is not an audit signal. |
| Treat any uploaded file (any type) as satisfying | Contradicts D-DOC-01's type distinction and the Posted invariant. |
| Allow several concurrent active satisfiers | Ambiguates which attachment the Posted document cites; the DB pointer model needs exactly one satisfier. |
| Require the gate already at Submit | PRD §12 flows show uploaders before Submit, but the legal invariant and Post-policy are the fixed point; a hard client block at Submit would create dead-end Submitted docs without recourse other than Reject. The gate is Post-scoped with the Reject→Revise correction path. |
| Human "scan looks correct" step | Adds an approval behavior the PRD explicitly excludes from v1. |
| Client-side checksum verify/display | Sends byte-level trust to the browser; checksum is server-side tamper evidence. |
| Client-built storage/pre-signed URLs | Only contract `downloadUrl` is consumable; constructing storage access bypasses the client layer and authorization. |
| Delete posted attachments with audit note | Posted documents are immutable (D-MOV-01/D-LIFE-01); audit needs the record to persist. |

## Explicitly owned remaining decisions

- Exact permission codes for upload/delete (`document.update`) and Post:
  `e01-t07`.
- Concrete upload size limits, content allowlist, and any scanner-failure
  exception handling: `e01.7` ratification and the release security review.
  Their absence does not block mock/type generation: the frontend renders the
  server-provided `413/415/422` Arabic messages and the policy signal only.

Implementation does not guess these values. Development proceeds against the
approved `signedOriginalSatisfied + blockers` state and the versioned
provisional contract.