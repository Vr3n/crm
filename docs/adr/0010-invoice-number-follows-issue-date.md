# ADR-0010: Invoice numbers follow the selected issue date

## Status

Accepted

## Context

Finalization assigns the business Invoice Number (`PREFIX-DDMMYY-NN`) and
freezes financial values. The front desk routinely enters old paperwork late
(a month-old cash sale typed today) and advance sales (a yearly plan starting
next month), so Finalization accepts an explicit `issueDate`; absent, it
defaults to today in the Organization timezone.

The sequence counter is keyed `(organization, year/dateKey, prefix)` where the
`year` column semantically carries the `DDMMYY` dateKey (a per-day counter by
usage — see `invoiceSequence` in `db/schema/billing.ts`). CGST Rule 46(b)
requires consecutive serials unique per financial year; Tally's
`Automatic (Manual Override)` model allows back-dated vouchers to take their
series from the voucher date without renumbering history.

## Decision

The Invoice Number is derived from the selected issue date, not from creation
order. `finalized_at` stores the Organization-local business date at noon as a
UTC instant (day-precision meaning in instant-shaped storage); `created_at`
preserves when the row was typed. Number, `finalized_at` and `finalized_by`
commit atomically in the finalize transaction (shared-`DatabaseSync`
`BEGIN IMMEDIATE`, synchronous callback, rollback on failure — including the
sequence increment). The existing global `UNIQUE(invoices.number)` is the
concurrency protection; the application collision pre-check exists only for a
clean error.

## Consequences

- Entering an older invoice after newer invoices produces numbers whose
  embedded dates do not follow creation chronology (e.g. `FH-121026-01`
  created after `FH-151126-02`). Existing finalized invoices are never
  renumbered. Back-dated gaps are accepted as an audit consequence of late
  entry; failed finalizations roll back completely and consume no sequence
  number.
- Screen, PDF, Outstanding Balance and Excel all read
  `finalized_at ?? created_at` as the canonical issue date.
- Back-date presentation warnings are renderer-local; the IPC result contract
  stays binary (`{ok:true,data}` / `{ok:false,error}`). Warnings never block:
  any past date warns with the series/gap note; past 30 days adds a CGST
  Rule-47 caution (reason + CBIC source citation); a different financial year
  adds a previous-FY GSTR-1 note. Future dates are uncapped and unwarned.
- Do not "fix" the `year` column into a real financial year without a new ADR:
  that would silently change numbering behavior.

## Alternatives considered

- **Number always uses today:** Rejected — the printed number date would
  mismatch the printed issue date on back-dated paperwork, which GST audits
  flag.
- **Block back-dates that postdate existing invoices:** Rejected — defeats the
  late-entry use case that motivated the feature.
- **Renumber history to restore chronology:** Rejected — breaks the audit
  trail and immutability of finalized financials.
- **Snapshot T&C-style date semantics (exact finalization instant):**
  Rejected — the business needs a paper date, not a timestamp; instants would
  reintroduce midnight/DST day-flip bugs.
- **Blocking >30-day-old or cross-FY issue dates:** Rejected — the late-entry
  pile is the feature's reason to exist. Statute awareness is delivered as
  renderer-local cautions instead: CGST Rule 47 (service invoices within 30
  days of supply; IRP reporting also keys off a 30-day window for large
  taxpayers), and FY-mismatch reporting (IRN hashes the FY derived from the
  invoice date; GSTR-1 auto-population keys off document date). Sources: CBIC
  Invoice Rules, GSTN IRP advisories, CGST §§12/13/31.
- **Widening NN padding to 3 digits for all numbers:** Rejected as
  unnecessary — `padStart(2, '0')` is a minimum width, so day 100+ serializes
  naturally (`-100`) without blocking any sale; verified by test.
