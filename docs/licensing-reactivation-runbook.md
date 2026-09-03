# Licensing Support Runbook

How to recover a gym whose CrownCRM install has stopped running because the
machine no longer matches its install lock.

## What the lock does

Each CrownCRM install is bound to the computer it was installed on via a
`machine.lock` file (holding the Windows MachineGuid) in the install directory.
On launch the app reads the current MachineGuid and compares it to the lock. If
they do not match, the app shows **"CrownCRM is not licensed for this computer"**
and will not open.

There is no license file to issue, no activation screen, and no reactivation
budget. The only recovery is a reinstall.

## When recovery is needed

- The gym **reinstalled Windows**, which generates a new MachineGuid that no
  longer matches the old lock.
- The gym copied the installed application folder to another PC — the lock
  belongs to the original machine, so it will not run on the new one.
- `machine.lock` was deleted or corrupted (app shows the blocked screen).

## How to recover

**Reinstall CrownCRM on that computer.** Run the installer again; the
`customInstall` step writes a fresh `machine.lock` bound to that machine, and
the app runs normally. The customer's data lives in `%APPDATA%\CrownCRM\` and is
untouched by a reinstall.

If the gym wants to run on a **second PC**, install CrownCRM there too — each
install gets its own lock.

## Troubleshooting

**App shows the blocked screen right after installing.** The install-time
binding step failed to write `machine.lock`. Reinstall, or check that
`machine.lock` exists in the install directory after the installer finishes.

**App worked, then stopped after a Windows reinstall.** Reinstalling Windows
generates a new MachineGuid. Reinstall CrownCRM — the installer writes a fresh
lock.

**Replacing a hard drive, CPU, or motherboard** does not change the MachineGuid,
so the app keeps running — no recovery needed.