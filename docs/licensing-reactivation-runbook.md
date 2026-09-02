# Licensing Reactivation Runbook

How to reissue a license when a gym changes hardware or loses their license file.

## When to reissue

- Gym replaces a hard drive, motherboard, or other core component and the fingerprint
  no longer matches
- Fresh Windows install on the same hardware
- License.dat was deleted or corrupted
- Gym bought a second PC (new license, same organization)

## How to reissue

### 1. Get the customer's current fingerprint

Ask the customer to run CrownCRM. On the activation screen they can click
**"Copy fingerprint to clipboard"**. Paste it into your email/chat. It looks like:

```
Organization: Iron Peak Fitness

Fingerprint:
  Machine GUID : fe072342-ff9b-4651-...
  Motherboard  : INVALID
  System Disk  : ESS3B1O27CNA17868
  CPU          : BFEBFBFF000706E5
```

### 2. Check the reactivation budget

```bash
npx tsx tools/license/issue.ts list
```

Look at the org's `Reactivations: X/2 used`. If X >= 2, the budget is exhausted.
Contact the gym to discuss options (paid reactivation, new license, etc.).

### 3. Issue a new license

```bash
npx tsx tools/license/issue.ts reissue \
  "Iron Peak Fitness" \
  "fe072342-ff9b-4651-a4a6-65753b283047" \
  "INVALID" \
  "ESS3B1O27CNA17868" \
  "BFEBFBFF000706E5"
```

This:
- Creates a new `tools/license/issued/<uuid>.dat` file
- Increments the reactivation counter in `ledger.json`
- Prints the license JSON

### 4. Send the license to the customer

Email the `license.dat` file content (or the whole JSON). The customer
selects it in the activation screen.

### 5. Verify it worked

Ask the customer to confirm they see the normal app screen. If they still
see the invalid dialog, have them re-copy their fingerprint and compare
the hashes against what you issued.

## First-time activation (new customer)

Same as above, but use `issue` instead of `reissue`:

```bash
npx tsx tools/license/issue.ts issue \
  "New Gym Name" \
  "<machineGuid>" \
  "<motherboard>" \
  "<systemDisk>" \
  "<cpu>"
```

The initial issue does not consume reactivation budget.

## Budget management

- Default reactivation limit: 2 per organization
- Tracked in `tools/license/ledger.json` (gitignored, never ships)
- To increase an org's budget, edit `ledger.json` directly and set
  `reactivation_limit` to a higher number
- The budget is advisory — it triggers a support conversation, not a
  cryptographic block

## Troubleshooting

**"No reactivations remaining"** — the org has used 2 reissues. Either
increase the limit in `ledger.json` or discuss with the gym.

**Fingerprint shows "INVALID" for motherboard** — this is normal on
virtual machines. The 3-of-4 threshold handles it; 3 other matches are
sufficient.

**Customer says license file doesn't work** — have them re-copy the
fingerprint. Common issue: extra whitespace or missing characters when
pasting.
