# Licensing Pre-ship Checklist

Gate items that must be completed and signed off before the first customer ships. These
are not known gaps or future-sprint items — they are closed only by completion, not by
deferral. See [ADR-0005](adr/0005-match-threshold-is-a-fixed-constant-gated-by-preship-validation.md)
for why these items exist.

---

## 1. Machine-binding validation

The install lock binds to the Windows MachineGuid (`reg.exe`). Verify the core
scenarios on real hardware. Sign off after each; all must pass before go-live.

### Scenario A — Fresh install on a clean PC

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** Installer writes `machine.lock` into the install directory; app runs with no prompt.
- **Actual:** □ Pass □ Fail
- **Sign-off:** ___________________

### Scenario B — Copy the install folder to another PC

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** The copied app shows the "not licensed for this computer" blocking screen (MachineGuid differs).
- **Actual:** □ Pass □ Fail
- **Sign-off:** ___________________

### Scenario C — Reinstall Windows on the same PC (new MachineGuid)

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** Old install blocks until CrownCRM is reinstalled, which writes a fresh lock and runs.
- **Actual:** □ Pass □ Fail
- **Sign-off:** ___________________

### Scenario D — Hardware change (disk / CPU / motherboard swap) without reinstalling Windows

- **Device:** ___________________
- **Date:** ___________________
- **Expected:** App still runs (MachineGuid unchanged by hardware swaps).
- **Actual:** □ Pass □ Fail
- **Sign-off:** ___________________

---

## 2. Failure-dialog UAT with a non-technical person

Walk one non-technical person through the copy-to-another-PC flow. Confirm:

- [ ] A fresh install on PC-A runs with no prompt whatsoever (lock auto-generated at install).
- [ ] Copying the installed folder (`Program Files\CrownCRM`) to PC-B and launching there
      shows the single "not licensed for this computer" blocking screen.
- [ ] Reinstalling on PC-B restores a working app.
- [ ] The blocking screen has no confusing inputs, license fields, or support-copy actions.

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

## 4. Packaging sanity — the shipped artifact binds correctly

The built `.exe` / installer must generate a working `machine.lock` on install and
must not contain any vendor-internal material.

- [ ] `tools/` is absent (no keys, no ledger, no CLI).
- [ ] `src/` source files are absent (only the built `out/` / `dist/` is present).
- [ ] `.env` files are absent.
- [ ] No `license.dat`, private key, or signature code ships in the ASAR.
- [ ] `scripts/install-binding.nsh` is wired via `electron-builder.yml` (`nsis.include`).
- [ ] Install the built setup on a clean PC; confirm `machine.lock` exists in the
      install directory and the app runs with no prompt.

**Verified by (inspect the packaged ASAR + a clean install):** ___________________
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
