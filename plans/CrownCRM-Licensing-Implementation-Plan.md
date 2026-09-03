# CrownCRM Offline Licensing — Final Implementation Plan

**Threat model:** non-technical gym staff/owners. Goal is to stop casual copy-to-another-PC, not defeat a skilled reverse engineer. Every decision below is scoped to that reality.

**Scope note:** this plan covers license protection only. CrownCRM keeps its existing plain SQLite database — no database-at-rest encryption, no SQLCipher, no data-key derivation. If that requirement ever changes, the `data_key_seed`/HKDF/SQLCipher design is a separate addition, not something to bolt onto this plan.

---

## 1. Architecture overview

```
                         YOUR MACHINE (build/issuance)
                                    │
                     gym info + hardware fingerprint (from activation form)
                                    │
                                    ▼
                          sign with PRIVATE KEY (Ed25519)
                                    │
                                    ▼
                              license.dat
                                    │
                                    ▼
                            emailed to customer
                                    │
                                    │
                              CUSTOMER PC

  First run (setup wizard)                Every run (main process)
  ─────────────────────────                ─────────────────────────
  1. Ask for license key/file       →      1. Load license.dat
  2. Call crown-license.node               2. Native module (C++):
     to bind + write license.dat              a. verify Ed25519 signature
  3. Confirm success                          b. compute local hardware ID
                                               c. compare to bound device_id
                                                  (tolerant match, see §4)
                                               d. return LICENSE_VALID /
                                                  LICENSE_INVALID
                                            3. If invalid → friendly dialog,
                                               not silent crash
```

Public key lives inside the compiled `.node` module. Private key never leaves your dev machine.

**Runtime verification flow:**

```
                 license.dat
                      │
                      ▼
             Verify Ed25519 signature
                      │
                   valid?
                  /      \
                no        yes
                │          │
              reject       ▼
                    Compute local fingerprint
                              │
                              ▼
                       Tolerant device match
                              │
                         authorized?
                        /          \
                      no            yes
                      │              │
                    reject           ▼
                              Start CrownCRM
                                      │
                                      ▼
                                   SQLite
```

## 2. Components to build

| Component | What it does | Effort |
|---|---|---|
| **Issuance script** (Node/Python, runs on your machine only) | Takes gym name + activation-form hardware IDs → derives device_id → signs `license.dat` with Ed25519 private key | Small |
| **`crown-license.node`** (Node-API/N-API C++ addon) | Verifies signature, computes local hardware fingerprint, compares, returns LICENSE_VALID/INVALID | Medium — this is the core piece |
| **Setup wizard** (Electron renderer, first-run only) | Lets a non-technical user paste/import the license file, calls the native module to bind it, shows clear success/failure | Small |
| **Main process integration** | Calls native module at startup and periodically; on failure shows a clear, actionable dialog | Small |
| **Support/reactivation flow** | Lets you re-issue a license when a gym replaces hardware | Small (manual is fine to start) |

## 3. License format

```json
{
  "gym_name": "Iron Peak Fitness",
  "device_id": "9d1c...",      // derived, not raw hardware IDs
  "product": "CrownCRM",
  "issued": "2026-09-02",
  "activations_remaining": 2,
  "signature": "..."            // Ed25519 signature over the above fields
}
```

Keep raw hardware identifiers (motherboard serial, disk serial, etc.) **out of the file** — only ship the derived `device_id` hash. `activations_remaining` lets the native module self-manage a small reactivation budget without contacting you every time (see §4).

## 4. Fingerprint: tolerant, not strict

Collect 3–4 identifiers in the native module:
- Windows Machine GUID
- Motherboard serial
- System disk serial
- CPU identifier

Normalize and hash each into a device fingerprint, but **require a majority match (e.g., 3 of 4), not an exact match**. A gym replacing a failing hard drive shouldn't lose access. Treat the match threshold as a tunable config value in the native module rather than a hardcoded constant — validate it against a few real machines (fresh Windows reinstall, disk swap, BIOS update) before locking it in; don't assume 3-of-4 is correct until tested.

For the case where a match still fails (new PC entirely): decrement `activations_remaining` and re-bind locally, up to the budget baked into the license (e.g., 2 free reactivations). Once exhausted, show:

> "This license needs to be reactivated for this computer. Contact support at [email] with your gym name."

You then manually re-issue `license.dat` from your issuance script. No server needed — email is enough at this scale.

Note: `activations_remaining` is local mutable state (it lives in a file on the customer's machine), so don't treat it as cryptographically enforced usage accounting — a sufficiently knowledgeable user could restore an earlier copy of the file. For this threat model that's acceptable: its job is to trigger a support conversation, not to prevent anything by force.

## 5. Electron-side hardening (cheap, worth doing)

Enable Electron's built-in protections in your `electron-builder` config — both are a few lines and stop the "unzip and poke at files" tier of tampering:

```yaml
electronFuses:
  EnableEmbeddedAsarIntegrityValidation: true
  OnlyLoadAppFromAsar: true
```

Requires Electron ≥30 (Windows) — confirm your current Electron version supports it, upgrade if not.

Code-sign `CrownCRM.exe` with an Authenticode certificate. This is less about piracy and more about not tripping Windows SmartScreen/antivirus warnings during install for non-technical staff — a real usability win.

## 6. Explicitly out of scope

Skip these — they add engineering cost with no benefit against this user base:
- VM/container detection
- Anti-debugging / anti-attach tricks
- V8 bytecode compilation of your JS
- Scattering license checks across many call sites to resist patching
- Any server-side/online licensing component (you're offline-only by requirement)
- Database-at-rest encryption (SQLCipher, `data_key_seed`/HKDF key derivation) — not needed for license protection alone; only revisit if you separately decide you want CrownCRM's data encrypted at rest, in which case treat it as its own project

## 7. Build order

1. **Issuance script** — get a working sign/verify keypair flow on your machine first; test the crypto in isolation before touching Electron.
2. **`crown-license.node`** — native module: hardware fingerprinting → signature verification → tolerant matching → returns LICENSE_VALID/INVALID. Test standalone (Node script, no Electron) before wiring in.
3. **Main process gating** — Electron calls the native module at startup (and periodically) and only proceeds to load the app UI on LICENSE_VALID; on invalid, show the failure dialog and quit. This is a straightforward gate — since there's no database-key coupling in this version, don't over-invest in disguising it (see §6 on scattering checks).
4. **Setup wizard UI** — first-run screen to import/activate a license.
5. **Failure-state UX** — the "contact support" dialog, tested for clarity with someone non-technical.
6. **electron-builder fuses + code signing** — final packaging step before first real customer ships.
7. **Manual reactivation runbook for yourself** — a one-page doc so re-issuing a license (hardware swap, lost file) is a 5-minute task, not a fire drill.

## 8. What "done" looks like

- A gym can install, enter a key, and use CrownCRM with zero awareness any of this exists.
- Replacing a drive or minor hardware change doesn't lock them out.
- Copying the install folder to a second gym's PC fails cleanly with a support-contact message.
- You can issue and re-issue licenses in minutes from your own machine, no server required.
- CrownCRM's SQLite database is untouched — plain SQLite, no encryption layer, no key management burden.
