# ADR-0003: Reactivation allowance is vendor-side bookkeeping, never a runtime mechanism

## Status

Accepted

## Context

When a gym's hardware changes, a strict license would lock them out and force a support
email every time. We wanted a small "reactivation allowance" so the vendor can re-grant a
few times without friction. The tempting design is a locally-stored counter that the app
reads at startup to decide whether a mismatched fingerprint may proceed.

## Decision

The Reactivation Allowance is a per-Organization count tracked **only** in the vendor's
issuance ledger. It gates the vendor's willingness to Reissue a License; it is never read
by the native module or the app. `crown-license.node`'s contract is purely:
signature valid + fingerprint meets `MATCH_THRESHOLD` → grant; otherwise reject.
Nothing in the runtime path may reference the allowance, a counter, or any local mutable
state. The customer machine holds only the immutable `license.dat`.

Bind (first authorization) and Reactivation (re-authorization after a device change) are
vendor-ledger categories — "is this a new `license_id` for this Organization, or a
replacement for one that already exists" — not runtime branches.

## Why we rejected the local-counter design

The specific failure mode this guards against: a future engineer adds a local counter for
offline convenience, that counter gets read by the verification path, and copy-to-another-PC
succeeds again as long as the counter is nonzero — which is the exact bug the licensing
design exists to stop. This ADR is the teeth for code review: a clean yes/no check against
any PR is "does this make `reactivations_remaining` (or anything like it) readable by
`crown-license.node`?" If yes, the PR violates this ADR.

## Consequences

- Every hardware change that breaks the match is a manual Reissue; there is no self-serve
  path. Acceptable for a non-technical user base at this scale.
- The allowance is vendor policy, not enforced by any file — a knowledgeable vendor controls
  their own ledger. The allowance is scoped per-Organization (not per-License) so buying
  redundant Licenses cannot reset it.
- No customer-side state to manage, tamper, or restore from backup.
