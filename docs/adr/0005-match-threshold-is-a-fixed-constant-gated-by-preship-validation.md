# ADR-0005: MATCH_THRESHOLD is a fixed compile-time constant, gated by a pre-ship validation checklist

## Status

Accepted

## Context

ADR-0002 records `MATCH_THRESHOLD = 3` as "a hypothesis, not a validated constant." The
implementation plan required treating it as a tunable value — easy to change during
development while running empirical validation, then locked down. A runtime config (env var,
JSON file) would be a new attack surface for zero benefit: anyone who can edit it can set it
to zero. The plan also explicitly scoped out periodic verification and left Authenticode
code-signing and failure-dialog UAT as items to complete before first customer ship.

This ADR pins down how `MATCH_THRESHOLD` gets validated, why it stays hardcoded, and
records the three deliberately deferred items so they don't resurface as unexpected gaps in
a future audit.

## Decision

### 1. `MATCH_THRESHOLD` is a fixed constant, not a runtime knob

`MATCH_THRESHOLD` lives as a hardcoded constant (`3`) in `src/main/licensing/fingerprint.ts`
and is compiled into the app. It is not read from an env var, JSON file, or any other
external source. "Tunable" in the plan meant *easy to change in source during development*
— not *externally configurable in the shipped app*.

A runtime config would let a user set the threshold to zero, defeating the license
protection entirely. A fixed constant in code has no such path; changing it requires a
source edit, recompile, and repackaging — which is the correct cost for a value that
controls a security boundary.

### 2. Validation is a tracked pre-ship gate, not a logged gap

Before first customer ship, run the following scenarios on real hardware and sign off.
Each scenario must produce the expected grant or reject. If a scenario wrongly locks out
(or wrongly grants), change the constant in source, recompile, re-run, and document the
decision in the checklist.

| Scenario | Expected behavior |
|---|---|
| Fresh Windows reinstall, same hardware | Grant (≥3 components match) |
| System disk replaced | Grant (machine GUID, motherboard, CPU match = 3/4) |
| BIOS update | Grant (machine GUID, motherboard, disk, CPU — at most 1 change) |
| CPU change | Depends on threshold; must be validated — only motherboard + disk + GUID remain |

This gates go-live. It is a testing task, not a known gap.

### 3. Verification is intentionally startup-only for v1

The app verifies the license once at startup and caches the result for the session. A
periodically re-read fingerprint that returns a temporary mismatch — for example, a
hardware identifier momentarily unreadable mid-session — would kill a legitimate running
app for no reason. Startup-only is the correct v1 behavior; periodic checks are deferred
pending demonstrated need, not a shortfall.

### 4. Code-signing and failure-dialog UAT are pre-ship checklist items

**Authenticode code-signing** is an external dependency requiring certificate purchase,
not a code change. Signing `CrownCRM.exe` prevents Windows SmartScreen / antivirus
warnings during install — a usability win for non-technical staff.

**Failure-dialog UAT** requires one non-technical person to walk through the activation
flow, trigger the invalid-license dialog, and confirm the support-contact message and
"copy support info" action are clear and actionable.

Neither is an architecture gap. Both are tracked in the licensing pre-ship checklist.

## Consequences

- The `MATCH_THRESHOLD` value is validated rather than assumed; the fix path for a wrong
  threshold is a source change + recompile + re-validation.
- A reviewer checking future PRs should not re-flag startup-only verification or the
  hardcoded threshold as bugs — both are intentional and documented here.
- The ADR links to `docs/licensing-pre-ship-checklist.md` for the tracked go-live items.
- ADR-0002's "hypothesis, not validated" consequence is closed by this ADR and the
  accompanying checklist.

## References

- [ADR-0002](./0002-offline-ed25519-license-bound-to-device-fingerprint.md) — `MATCH_THRESHOLD = 3` introduced as a hypothesis
- [ADR-0004](./0004-verification-core-is-pure-typescript-not-native.md) — pure TypeScript verification core
- [Licensing Pre-ship Checklist](../licensing-pre-ship-checklist.md) — the tracked validation and go-live gate
- [Licensing Reactivation Runbook](../licensing-reactivation-runbook.md) — operational guide for reissues
