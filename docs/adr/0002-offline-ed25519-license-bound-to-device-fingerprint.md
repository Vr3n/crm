# ADR-0002: Offline Ed25519-signed license bound to a device fingerprint

## Status

Accepted

## Context

CrownCRM is a Windows desktop app with an offline-only requirement and a non-technical
user base (gym staff/owners). The threat model is stopping casual copy-to-another-PC,
not defeating a skilled reverse engineer. We need a license that (a) grants a specific
gym the right to run the product, (b) works with zero server, and (c) fails cleanly
when the install folder is copied to a second machine.

## Decision

Licensing is enforced by a single signed artifact, `license.dat`, produced by a vendor
issuance script using an Ed25519 private key that never leaves the vendor's machine.
The payload is immutable: it carries `organization`, `product`, `license_id`, `issued`,
and a `device_fingerprint` of four hashed hardware components (machine GUID, motherboard,
system disk, CPU) — never the raw hardware identifiers, and never a reactivation counter.

At runtime, a stateless native module (`crown-license.node`) does exactly two things:
verify the Ed25519 signature, then compute the local fingerprint and require a majority
component match against the license (`MATCH_THRESHOLD = 3`). Valid + match → grant;
otherwise reject with a support-contact dialog. No server, no local mutable state, no
counter, no data-key coupling.

The customer machine holds only `license.dat`. When hardware changes break the match, the
vendor Reissues a new `license.dat` by hand; the budget for how often that happens is
tracked against the Organization in the vendor ledger, never by the app (see ADR-0003).

## Consequences

- Reactivation is a manual vendor act (email handoff), not a self-serve path — a deliberate
  trade-off of offline-only simplicity for the ability to reissue in minutes.
- The license is one-Device-per-file; a second PC needs a second, separately-issued License
  under the same Organization.
- `MATCH_THRESHOLD = 3` is a hypothesis, not a validated constant — it must be tested
  against real reinstall / BIOS / disk / CPU scenarios before first customer ship, and
  lives as a fixed constant in the native module, not in the license.
  ([ADR-0005](./0005-match-threshold-is-a-fixed-constant-gated-by-preship-validation.md)
  records the validation path and pre-ship checklist.)
- The failure dialog must expose a "copy support info" action so the customer can relay the
  current fingerprint and Organization to the vendor for a Reissue.

## Alternatives considered

- **Online/phone-home licensing:** Rejected — violates the offline-only requirement and adds
  infrastructure with no benefit against this user base.
- **Single aggregate hash (exact match):** Rejected — can't express tolerant majority
  matching, so a single hardware change would lock the user out.
- **Locally decremented reactivation counter:** Rejected — a counter trusted by the
  verification path reintroduces copy-to-another-PC the moment it's nonzero; see ADR-0003.
