# ADR-0002: Machine-bound install lock (no signing, no activation)

## Status

Accepted (supersedes the Ed25519-signed `license.dat` design)

## Context

CrownCRM is a Windows desktop app with an offline-only requirement and a
non-technical user base (gym staff/owners). The only thing we need licensing to
do is stop a gym from **copying the installed application folder to a second PC
and running it there**. No servers, no per-gym entitlements, no reactivation
budget, no vendor interaction. Anything more is over-engineering.

An earlier design used an Ed25519-signed `license.dat` written to `%APPDATA%` on
first launch, plus a vendor CLI/ledger/reactivation flow and an activation
wizard. That was rejected because:

- The binding lived in `%APPDATA%`, so copying the install folder alone let the
  app re-bind to the new machine and **run** — it did not stop the target
  scenario.
- The vendor CLI, ledger, reactivation budget, and activation wizard added
  complexity nobody uses.

## Decision

Licensing is a **machine-bound install lock** with no cryptographic signing, no
activation, and no vendor tooling.

1. **Where it lives:** a file `machine.lock` holding the Windows **MachineGuid**
   (`HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid`) is written to the
   **install directory** (`Program Files\CrownCRM`, next to the executable).
   Storing it in the install directory means it **travels with a folder copy**,
   so copying the app to another PC carries the original machine's MachineGuid
   along.
2. **When it is created:** during installation. An NSIS `customInstall` macro
   (`scripts/install-binding.nsh`) reads the MachineGuid from the registry and
   writes `machine.lock` directly — no launching the exe and no PowerShell.
   This is fast and reliable during the elevated (per-machine) install, and it
   avoids the old admin-profile problem because the lock is a machine-wide
   install artifact, not a per-user file.
3. **When it is checked:** at every app launch, `verifyInstallLock()` re-reads
   the current MachineGuid via `reg.exe` and compares it to the lock.
   Match → run. Mismatch or missing/corrupt lock → the renderer shows a single
   blocking screen ("not licensed for this computer") with no input and no
   retry loop.

Fingerprint collection is `src/main/licensing/fingerprint.ts` → `collectMachineGuid()`,
a single `reg.exe` call (instant, always available). No PowerShell, no WMI, no
SHA-256 component hashing, no `MATCH_THRESHOLD`, no Ed25519 keys, no
`license.dat`.

### Why MachineGuid

A single, fast, always-reliable identifier is better than a fragile
multi-component hardware fingerprint. The earlier PowerShell/WMI collector
(spawned `powershell.exe -EncodedCommand`) could time out (observed `ETIMEDOUT`)
during fresh installs, so `machine.lock` was never written and the app blocked a
legitimate fresh install. `reg.exe` reads the same value in milliseconds.
MachineGuid is unique per Windows installation and stable across hardware
changes, so a gym swapping a disk or CPU does not lock themselves out (it is
recreated only by reinstalling Windows, which also reinstalls the app).

### Why no signing

The lock is not meant to resist tampering — the threat is a casual user copying
a folder. Signing adds a key lifecycle and `crypto` code with zero benefit here:
a user who can edit `machine.lock` on their own machine can just as easily
reinstall. The embedded key of the old design was extractable anyway, so
signing never provided real protection against a motivated attacker.

### Recovery

The only case that blocks a legitimate install is a **reinstall of Windows**
(which generates a new MachineGuid). Because reinstalling Windows also requires
reinstalling the app, the installer writes a fresh `machine.lock` and the app
runs. A copy of the install folder to another PC carries the original
MachineGuid, which will not match, so the app blocks.

## Consequences

- No activation wizard, no "paste license file", no copy-support-info — the
  normal flow is fully automatic. The only failure surface is the single
  blocked screen on machine mismatch.
- Copying `Program Files\CrownCRM` to another PC fails: the copied `machine.lock`
  holds the original PC's fingerprint, the new PC's fingerprint does not match,
  and the app blocks.
- A fresh install on a new PC writes its own lock and runs.
- Custom install directories work: `machine.lock` is resolved relative to the
  executable (`dirname(process.execPath)`), which matches the installer's
  `$INSTDIR`.
- Writing `machine.lock` to Program Files needs elevation; the installer runs
  the generation step elevated, so this is satisfied. If the step is skipped,
  `ensureInstallLock()` attempts a best-effort background generation at launch,
  and the app blocks if that also fails.
- The vendor CLI, ledger, issued-`.dat` files, and reactivation runbook are
  removed.

## Alternatives considered

- **Signed `license.dat` + activation wizard (previous design):** Rejected — the
  binding was in `%APPDATA%` (didn't block folder copies), and the wizard/CLI
  were unused complexity.
- **Online/phone-home:** Rejected — violates offline-only.
- **First-launch generation stored in the install dir:** Rejected — an
  unelevated first run usually cannot write to Program Files; installer-time
  (elevated) generation is reliable and matches "bind at install".
- **Storing the lock in `%APPDATA%`:** Rejected — not copied with the app folder,
  so it wouldn't stop the target scenario.