# Licensing Pre-ship Checklist

Gate items that must be completed and signed off before the first customer ships. These
are not known gaps or future-sprint items — they are closed only by completion, not by
deferral. See [ADR-0005](adr/0005-match-threshold-is-a-fixed-constant-gated-by-preship-validation.md)
for why these items exist.

---

## 1. Hardware validation — `MATCH_THRESHOLD` empirical verification

Run each scenario on real hardware. Record expected and actual behavior. Sign off after
each; all four must pass before go-live.

**Threshold under test:** `MATCH_THRESHOLD = 3` (hardcoded in `src/main/licensing/fingerprint.ts`)

### Scenario A — Fresh Windows reinstall (same hardware)

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** Grant (≥3 component hashes match)
- **Actual:** □ Grant □ Reject
- **Sign-off:** ___________________

### Scenario B — System disk replaced

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** Grant (machine GUID, motherboard, CPU = 3/4 match)
- **Actual:** □ Grant □ Reject
- **Sign-off:** ___________________

### Scenario C — BIOS update

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** Grant (all 4 components should remain unchanged through a BIOS update; 1 change at most)
- **Actual:** □ Grant □ Reject
- **Sign-off:** ___________________

### Scenario D — CPU change

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** Depends on threshold — motherboard + disk + machine GUID remain; validate
- **Actual:** □ Grant □ Reject
- **Sign-off:** ___________________

**If any scenario produces the wrong result:** change `MATCH_THRESHOLD` in
`src/main/licensing/fingerprint.ts`, recompile, re-run all scenarios, and document the
change in ADR-0005 or a follow-up ADR.

---

## 2. Failure-dialog UAT with a non-technical person

Walk one non-technical person through the activation and invalid-license flows. Confirm:

- [ ] The activation wizard ("Paste your license file") is clear and non-intimidating.
- [ ] Selecting an invalid or mismatched file shows a readable failure message.
- [ ] The "copy support info" button produces a block of text that can be pasted into an
      email without confusion.
- [ ] The retry button re-runs fingerprint collection and verification (not cached state).

**UAT participant:** ___________________
**Date:** ___________________
**Notes / fixes applied:** ___________________
**Sign-off:** ___________________

---

## 3. Authenticode code-signing

An unsigned `CrownCRM.exe` triggers Windows SmartScreen and potentially antivirus warnings
during install. Code-signing prevents these for non-technical staff.

- [ ] Acquire an Authenticode code-signing certificate (EV or standard, per budget).
- [ ] Sign `CrownCRM.exe` with the certificate.
- [ ] Confirm a fresh Windows install does not show SmartScreen or antivirus warnings
      during launch or install.
- [ ] Confirm the certificate is not committed to the repository.

**Certificate purchased:** □ Yes □ No
**Signed:** □ Yes □ N/A (cert not yet purchased)
**Sign-off:** ___________________

---

## 4. Packaging sanity — no secrets in the shipped artifact

The built `.exe` / installer must not contain any vendor-internal material. Verify against
the `electron-builder.yml` `files` exclusion list (`!tools/*`, `!src/*`, etc.).

- [ ] `tools/` directory is absent (no keys, no ledger, no CLI).
- [ ] `tools/license/keys/` is absent — the Ed25519 private key is not in the ASAR or
      alongside it.
- [ ] `ledger.json` is absent.
- [ ] `src/` source files are absent (only the built `out/` or `dist/` is present).
- [ ] `.env` files are absent.
- [ ] The embedded public key in `src/main/licensing/crypto.ts` matches the private key
      used by the issuance CLI — test by issuing a license with the CLI and verifying it
      passes validation in the app.

**Verified by (inspect the packaged ASAR):** ___________________
**Date:** ___________________
**Sign-off:** ___________________

---

## Completion

| Item | Status | Date | Sign-off |
|---|---|---|---|
| Hardware validation (A–D) | □ Pass | | |
| Failure-dialog UAT | □ Pass | | |
| Code-signing | □ Pass / □ Deferred (cert not purchased) | | |
| Packaging sanity | □ Pass | | |

**All items signed off:** □ Yes □ No — **GO-LIVE BLOCKED** if any item is unsigned.
