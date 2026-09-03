# ADR-0004: Verification core is pure TypeScript, not a native addon

## Status

Accepted

## Context

The original plan proposed a C++ N-API native addon (`crown-license.node`) for Ed25519
verification and hardware fingerprinting. This ADR records the decision to use pure
TypeScript instead.

## Decision

The verification core uses:

- `node:crypto` for Ed25519 verify (built into Node 25 / Electron 43, zero dependency)
- PowerShell `Get-CimInstance` + registry reads via `child_process.execFileSync` for the
  four hardware identifiers (MachineGuid, motherboard, system disk, CPU)

The public key is embedded as a PEM constant in `src/main/licensing/crypto.ts`.

## Why pure TypeScript, not native

1. **Threat model.** Scoped to casual copy-to-another-PC, not defeating a skilled reverse
   engineer. Every other hardening measure (anti-debugging, VM detection, bytecode
   compilation) was scoped out for the same reason. The native module was the last piece of
   that stack; re-examined against the actual threat, it does not earn its cost
   independently.

2. **No ASAR integrity hole.** A native `.node` addon requires `asarUnpack`, carving a hole
   in the exact Electron fuse protection (`OnlyLoadAppFromAsar`) adopted to stop casual
   tampering. A pure-JS module stays inside the ASAR.

3. **No native build toolchain.** The project chose `node:sqlite` over `better-sqlite3` to
   avoid native dependencies and `node-gyp`. A native licensing module would reintroduce that
   cost for one component that does not warrant it.

4. **Fully unit-testable.** The pure-TS core is exercised by standard vitest tests. A native
   addon is harder to test in the same framework.

## What it costs

The public key and verification logic live in JavaScript. A person with reverse-engineering
skill could locate the verify call and bypass it. This is the same trade-off ADR-0002
already accepted when the system was scoped to casual copy protection.

## Alternatives considered

- **C++ N-API addon:** Stronger against patching, but requires VS Build Tools, Python,
  `electron-rebuild` per upgrade, and `asarUnpack` — disproportionate to the threat model.
- **Hybrid (JS verify + native fingerprinting):** Partially reduces build cost while
  keeping the native toolchain. The native part (fingerprinting) is the smaller benefit;
  PowerShell WMI covers it without native deps.
