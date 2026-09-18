# Plan 110 — Custom Billing Dates, Local-Time Excel Export, Renew Shortcut

> GitHub: #110 `feat(billing): custom Invoice/Payment dates, local-time Excel export, renew Membership shortcut`
> Branch: `feat/110-111-billing-receipt-trust`
> Source: `plans/V1-0-011_features_and_bugs.md` items 1, 4 + ADHOC
> Status: PLAN ONLY — no code changed. Hardened per two grill passes (accepted, no redesign).

## 1. Context & ubiquitous language

Per `plans/CONTEXT.md` / `docs/04-billing-and-invoicing.md` / `docs/05-payments-and-finance.md`:

- **Invoice** = amount owed; **DRAFT** editable, once **Finalization** assigns **Invoice Number** the financial values are immutable.
- **Issue Date := `finalized_at`** (canonical decision from grilling). `created_at` stays as system audit (when the clerk typed the row in).
- **`finalized_at` is instant-shaped storage with day-precision business meaning.** When supplied by the User, its semantic precision is one calendar day; the canonical business date is the Organization-local date represented at noon (see §4.2). It must never be read as "the exact time the invoice was finalized."
- **Payment** = historical fact, never edited; **Payment Allocation** links Payment→Invoice; **Refund != Credit**.
- **Membership** = one entitlement period; renewal creates a new row, never overwrites.
- **User** = login identity; **OrganizationStaff** = User-in-Organization binding; **Organization Context** (Organization + Role) is the session source of truth. Never say "staff member" in code/docs.

Current contradiction to fix: `src/main/application/pdf.ts:179` prints `issuedAt = createdAt`, while `src/main/application/finance.ts:844` derives `issuedAt = finalized_at ?? created_at`. This plan standardises on the latter — Invoice screen, PDF, Outstanding Balance derivation, and Excel must all read the same canonical field (§7 same-source test).

## 2. Internet research (per AGENTS.md — research first)

- SQLite docs (`lang_datefunc.html`): `datetime('now')` is UTC; `localtime` converts UTC→local, `utc` converts local→UTC. Best practice (Stack Overflow 278k-view thread, sqldocs.org): **store UTC, convert at display**.
- Plan `membership-sale-form/04-dates-and-timezone.md`: "UTC everywhere, convert at the edges" + IANA zone (`Asia/Kolkata` default from `organizations.timezone`).
- Excel ecosystem (Microsoft Q&A 5227996): exported UTC datetimes display shifted unless converted before writing the cell; Excel carries no embedded tz — the writer materialises local wall time.
- Tally / ERP numbering (second grill pass): TallyPrime voucher numbering is `Automatic (Manual Override)`; CGST Rule 46(b) + GSTN advisory 04-Apr-2019 require a **consecutive serial ≤16 chars, unique per financial year** (restart yearly Apr 1, never monthly). ERPNext/India-Compliance #3253 shows back-dated posting + current-date e-invoice without warnings causes sequence/period mismatch — maintainer response was validations/warnings, still no sequencing guarantee. Industry practice: **allow back-dated entry numbered by creation order within its series, warn loudly, never renumber history.**

Decision: keep storage as UTC ISO (`YYYY-MM-DD` for date-only windows, full ISO for instants); convert with `Organization.timezone` at export/print edges. Renderer UI pattern already exists: `src/renderer/src/lib/format.ts:toUTCDate` (append `Z` to SQLite `"YYYY-MM-DD HH:MM:SS"` before `new Date`).

## 3. Scope (grilling answers applied)

1. **Single shared date in Membership sale** (user chose "Single shared date"): one picker drives BOTH `finalized_at` and `payment_date` in the sale tx. This is a **UI convenience only — it does not merge domain fields** (`invoice.finalized_at` and `payment.payment_date` stay separate columns, so future part-payments keep independent dates). Label it `Billing date (sets Invoice + Payment)` with hint "One date drives both records in this sale."
2. **Standalone forms**: Invoice form gets Issue Date picker (feeds `finalizeInvoice.issueDate`); Payment form keeps its existing picker but tightened to date-only + default = linked Invoice date when launched from allocation context.
3. **Excel**: fix-all + IPC gap (user chose recommended): add `isodate` to IPC enum, SQLite-aware parse, thread `timezone` through export input.
4. **Renew shortcut**: add Renew row action + details-sheet footer button reusing existing `RenewMembershipDialog`. Renew keeps three dates distinct: `joiningDate` (first joined) ≠ `startDate` (period start) ≠ `issueDate` (paperwork).

Use case driving this: "old invoice / membership sale from a month ago not yet entered — set issuing date to a month ago instead of today."

## 4. Backend plan (`backend-implementation-guidelines.md` + `drizzle` skill)

Precise architecture for this codebase: `Renderer → IPC Adapter → Application (owns tx boundary) → Domain → Repository Interface → Drizzle/SQLite`. **Transaction mechanism is a single shared `DatabaseSync` connection** (`db/connection.ts:15-21,76-95`): `withTransaction(fn)` issues `BEGIN IMMEDIATE` (savepoints when nested); every repository statement via `getDrizzle()` on that connection participates; throw → `ROLLBACK`. **No tx-handle object is threaded** — do not introduce one. **Implementation invariant: `fn` is synchronous only — no `await` between `BEGIN` and `COMMIT`.** Repos must never call `db.transaction()` themselves (verified: zero such calls). The `memberships.ts` direct-`db.update` vs `billing.ts` repos split is stylistic drift, not an atomicity break (same connection/tx); normalize to repos as cleanup only. Money stays integer minor units. Financial history immutable — corrections via Void/Refund/Credit only.

### 4.1 Contracts (`src/shared/contracts/`, Zod at IPC boundary)

| File                               | Change                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `membership-sale.ts:12-28`         | Add `issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` to `sellMembershipInputSchema`. Comment stays "UTC YYYY-MM-DD".                                                                                                                                                                                                                  |
| `membership-cancel-renew.ts:83-98` | Add same `issueDate` to `renewMembershipInputSchema`.                                                                                                                                                                                                                                                                                     |
| `billing.ts:89-92`                 | `finalizeInvoiceInputSchema` gains `issueDate?: YYYY-MM-DD regex, optional`. Absent → today in Organization timezone.                                                                                                                                                                                                                     |
| `finance.ts:75-100`                | Tighten `recordPaymentInputSchema.paymentDate` + `recordAndAllocatePaymentInputSchema.paymentDate` from bare `z.string()` to YYYY-MM-DD regex.                                                                                                                                                                                            |
| `ipc/export.ts:7-12`               | Add `'isodate'` to `exportColumnSchema` enum (today only `text/money/date/datetime/number`; renderer `api.ts:3` + main `export.ts:12` already have `isodate` → IPC rejects the only `isodate` caller `payments-due-table.tsx:32-36`).                                                                                                     |
| `export` input                     | Add optional `timezone?: string` (IANA). **Validate at the boundary** (allowlist or `Intl` support check); invalid → `VALIDATION_ERROR` before conversion. DB-sourced `organizations.timezone` is also untrusted: invalid → fall back to `Asia/Kolkata` + controlled log/error, never a malformed export. No DB access in export service. |
| `billing` preview                  | `nextInvoiceNumberPreview` accepts optional `issueDate` so the confirm line recomputes from the picked date (never reserves — still peek-only).                                                                                                                                                                                           |

### 4.2 Application use cases (own the tx boundary; shared connection does the work)

- `application/billing.ts:243-298 finalizeInvoice(input)` — atomic finalize (in scope for #110, fixes the persisted-number bug):
  - Accept `issueDate`; effective date = `input.issueDate ?? todayInOrgTz(organizationId)` (new shared util, §4.3).
  - Validate real calendar date (reject `2026-02-30`, etc.) → `VALIDATION_ERROR`, same message client-side for race safety.
  - `dateKey = formatDDMMYY(effectiveDate)` drives `invoiceSequenceRepo.getOrCreate/incrementAndGet` → **number follows custom date** (back-dated paperwork numbers with old date; see ADR §12).
  - Persist **in the same tx**: `invoiceRepo.updateNumber` (new) + `updateStatus(OPEN, {finalizedAt, finalizedBy})` + totals. **No observable state where `finalized_at` is committed but `number` is still `DRAFT-*`.**
  - `finalized_at = effectiveDate@12:00-org-tz → UTC ISO` (noon avoids DST-midnight edge; India has no DST but protocol holds). `created_at = now` (audit). `finalized_by = session User.id`.
  - Failure state: number stays original DRAFT, `finalized_at/by` NULL, sequence increment rolled back with everything else.
- `application/memberships.ts sell (272-350) + renew (971-1040)`:
  - Replace hardcoded `finalized_at: now` and `payment_date: today` with shared `issueDate`.
  - `created_at / occurred_at / updated_at` (lead activity, membership events) stay `now`.
  - `payment.payment_date = issueDate` when `paidAmountMinor > 0`. Later allocation/second payments keep independent dates.
- `application/finance.ts:844` stays canonical `issuedAt = finalized_at ?? created_at`; fix `application/pdf.ts:179-180` to match.
- Validity vs caution (explicit application-wide rule):
  - `VALIDATION_ERROR` (cannot perform): invalid calendar date, duplicate invoice number, malformed paymentDate, `end < start`.
  - Warning (valid, user should understand consequence): back-dated invoice, payment before issue date. **Warnings are renderer-local in #110** (see §5) — the application contract stays binary `{ok:true,data} / {ok:false,error}` (ADR-0006, `ipc/handle.ts`); no `warnings[]` protocol change.

### 4.3 Domain / repository / Drizzle / shared utils

- No schema change for dates (columns already TEXT ISO). **No migration for uniqueness**: `invoices.number` already has a global `UNIQUE` (`schema/billing.ts:22`) and `invoice_sequence` has `UNIQUE(org, year, prefix)` (`:113`). Application pre-check gives clean errors; the DB constraint is the concurrency protection (collision → rollback → `INVOICE_NUMBER_COLLISION`). Do NOT "correct" global-unique to `UNIQUE(organization_id, number)` in this feature — stricter, already enforced, changing it widens migration/behavioral surface for no benefit.
- New `invoiceRepo.updateNumber(organizationId, id, number)`: Drizzle builder, scoped `and(eq(org), eq(id))` like `updateStatus/updateTotals`.
- Sequence concurrency contract: one `(organization, year/dateKey, prefix)` row → unique NN per committed finalization; `UPDATE last_value+1` runs inside the finalize tx; add repo tests (sequential, get-or-create, rollback, attempted-concurrent). **Terminology (do not treat as trivia): the `year` column semantically carries `DDMMYY dateKey`** (`billing.ts:264` passes `formatDDMMYY`) — i.e. a per-day counter by usage. Changing it to a real financial year would alter numbering behavior; keep beside this invariant.
- Shared date utils (NEW module, e.g. beside money/phone domain helpers — **not** in `leads.ts`; billing must not depend on Leads for timezone): `businessDateToUtc(dateOnly, tz)` (date-only → org-tz noon → UTC ISO), `utcToOrgWallTime(instant, tz)` (instant → wall time for display/export), `parseStoredDate(value, kind)` (SQLite space-format/`Z`-less handling in one place). Billing + export both call these; `orgTimezone()` logic moves here and all callers (`leads`, `billing`, `memberships`, `export`) use it. Drizzle style: `db.select()` builder, never `db.query.*`.
- Gap policy (two cases, different handling): **A. Business gap** (older invoice entered after newer exists) → permitted + renderer warning. **B. Transaction failure** (increment succeeded but finalize threw) → full rollback, sequence NOT consumed.

### 4.4 Permissions / audit

- Keep `invoice.finalize`, `payment.record`, `membership.create/renew` checks. React hiding buttons is UX only.
- `created_by / finalized_by` already stamp `requireSession().userId` — no change. Audit answers Who/What/When/Which/What-changed/Why preserved.
- Every mutated repo method scopes `organization_id + id`; prove with the cross-org `id=123` isolation test (§7).

### 4.5 Billing date invariants (contract for review)

1. `created_at` = actual system creation timestamp.
2. `finalized_at` = canonical Invoice issue-date representation (day-precision; noon-anchored instant shape).
3. `finalized_by` = authenticated User performing finalization.
4. Invoice Number assigned exactly once, during finalization.
5. Number + `finalized_at` + `finalized_by` commit atomically; a finalized invoice never carries a DRAFT number.
6. Finalized financial fields + number are immutable (Void/Refund/Credit for corrections).
7. Back-dated finalization is valid and never renumbers existing invoices.
8. Failed finalization rolls back completely, including the sequence increment.
9. DB uniqueness (`invoices.number` global UNIQUE) protects numbers under concurrency.
10. `payment_date` remains independent of Invoice issue date (shared UI date is convenience only).
11. Date-only values are interpreted in `Organization.timezone`.
12. Excel contains Organization-local wall-clock values, never raw UTC instants.

## 5. Frontend plan (`react-patterns` + `tanstack` + `form-implementation-guideline.md` + visual skills)

- **One field = one `form.Field`** with pure `validators.onChange`, `completeWhen` for live feedback, `role="alert"` errors, `aria-invalid`, `LoadingButton disabled={!canSubmit || precondition}`, two-column `grid sm:grid-cols-2` for short fields, `labelEnd` for live status.
- **TanStack Query**: vocabulary (plans, customers) via `queryOptions` read models, standalone cache keys, long `staleTime`; mutations invalidate minimal keys (`['invoices']`, `['payments']`, `['memberships']`).
- Back-date warning (renderer-local, no IPC change): `effectiveIssueDate < MAX(finalized issue dates in read model)` → non-blocking notice _"Back-dated: newer invoices exist after <date> — gaps permitted, number will use <dateKey> series."_ (NOT "sequence already exists" — those differ.) Payment-before-issue → same warn-only treatment.
- Changes:
  - `renderer/.../memberships/sale/components/order-summary.tsx:19-53` — add single day-only `Billing date` field using `catalog/components/catalog-date-picker.tsx:13-25` pattern (`yyyy-MM-dd`), default `todayInOrgTz`. Thread through `sale/page.tsx:87-112,788-805` (extend `OrderSummary` props with `billingDate + onBillingDateChange` → `form.setFieldValue`).
  - `invoices/components/new-invoice-dialog.tsx:879-946` — Issue Date picker before Finalize; confirm line shows `preview?.preview` recomputed from the picked date (pass `issueDate` to preview; still non-reserving).
  - `finance/components/record-payment-dialog.tsx:82,247-250,339-347` — switch `DateTimePicker` to date-only for `paymentDate`; default = linked Invoice `issuedAt` when opened from allocation context, else today.
  - `memberships/components/renew-membership-dialog.tsx:64-93,228-265,340-345` — add shared date picker (same component as sale); assert `joiningDate/startDate/issueDate` independence (§7 triple-date test).
  - Renew entry (ADHOC): `dashboard/components/membership-expirations-table.tsx:36-88` add Renew item in `row-actions.tsx:30-75`; `member-details-sheet.tsx:380-417` footer Renew button → `setRenewTarget` → existing `<RenewMembershipDialog>` (pattern from `CustomerDetailPage.tsx:217-224`). Dialog lazy + remounted per open.
- Timezone source: org query (`identity/queries.ts`), fallback `Asia/Kolkata` (matches `identity/constants.ts:18-25 TIMEZONES[0]`). Note: `api.ts:24 updateOrganization` is currently a stub + `IDENTITY_UPDATE_ORGANIZATION` has no handler — do NOT depend on editing timezone in this issue; read-only use.

## 6. Excel export detail

- `main/ipc/export.ts` — add `isodate` enum member; add optional validated `timezone`.
- Shared primitives (§4.3) used here: `parseStoredDate` (SQLite-aware: `raw.replace(' ','T') + 'Z'` if no offset, mirroring `renderer/lib/format.ts:16`) then `utcToOrgWallTime(input.timezone ?? orgDefault)`.
- Conversion table:

| Column format                                      | Parse                       | Convert                                                                                                  | Write                          |
| -------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `date` / `isodate` (`YYYY-MM-DD`)                  | wall date, no time          | noon-anchor in effective tz (per user call "shift everything," anchored at 12:00 so it cannot flip days) | Excel Date + `DATE_FORMAT`     |
| `datetime` (SQLite `"YYYY-MM-DD HH:MM:SS"` or ISO) | SQLite-aware → true instant | exact instant → tz wall time                                                                             | Excel Date + `DATETIME_FORMAT` |

- Invariant: **a source `date` has no time component — exporting it must never change the calendar day** (dedicated regression test).
- `main/application/export.ts:143-178`: unify `date | isodate | datetime` branches through the primitives; `date` currently falls through as raw string — normalise to Date so `numFmt` applies. Keep `DATE_FORMAT='dd MMM yyyy'`, `DATETIME_FORMAT='dd MMM yyyy, hh:mm AM/PM'`.
- `renderer/features/export/api.ts:12-18` + `components/export-excel-button.tsx:51-57` — accept + pass `timezone` (from org query) alongside `currency`.
- Affected callers verified: `date` (membership-table, customers, invoices-table `issuedAt`, payments-table `paymentDate`, receivables, expirations), `datetime` (leads, cold, collections `receivedAt`, follow-ups `dueAt`, credits, refunds), `isodate` (payments-due-table — currently broken by IPC gap).

## 7. Tests (mandatory per AGENTS.md — unit first)

- `tests/main/application/billing-issue-date.test.ts` (new): finalize with back-date drives `dateKey` + `finalized_at`; absent → today; invalid calendar rejected; **atomic final state**: failure leaves number=DRAFT, dates NULL, sequence rolled back; success leaves number+dates committed together.
- `tests/main/application/membership-sale-issue-date.test.ts` (new): sale with shared date sets both invoice + payment dates; `created_at` stays now; renew same; **triple-date test**: `joiningDate=2025-01-01`, `startDate=2026-10-01`, `issueDate=2026-09-15` verified independently (catches issue-date-as-start-date bug).
- Repository/DB (new, real Drizzle + isolated SQLite — application tests must not pass against mocks while SQLite is wrong): `updateNumber` org+id scoping; cross-org `id=123` isolation (Org A op never mutates Org B); sequence atomic increment / get-or-create / rollback / attempted-concurrent; note existing global UNIQUE.
- `tests/main/application/export-timezone.test.ts` (extend `export.test.ts:95,109,202`): boundary matrix — date-only `2026-09-01 → 01 Sep 2026`; SQLite `2026-09-01 06:30:00 → 12:00 PM Kolkata`; UTC `2026-09-01T06:30:00Z → 12:00 PM`; near-boundary `2026-09-01 00:30:00Z → 06:00 AM`; previous-day `2026-08-31 18:30:00Z → 01 Sep 12:00 AM`; `2026-08-25` never becomes Aug 24; **one DST zone** (e.g. `America/New_York`); `isodate` passes IPC schema.
- `tests/.../finance-payment-date.test.ts`: YYYY-MM-DD regex rejects bare strings/time-only.
- Same-source test: Invoice screen, PDF, Outstanding Balance derivation, Excel all read `finalized_at ?? created_at`.
- Preload/IPC parity test: `currency`/`isodate`/`timezone` agree across `preload/index.ts`, `ipc/export.ts` Zod, `application/export.ts`.
- Renderer: validation-rule unit + component gating tests (`npm test`); `typecheck` + `lint` clean; dialog lazy/remount check.
- Electron operational test (only for the file-write path): renderer → preload → IPC → export → valid `.xlsx`; business rules stay in vitest (do not boot Electron per test).

## 8. Review & refactor pass

After implementation, re-read with `react-patterns` (no derived state in `useEffect`, no `window.api` outside `api/client.ts`), `drizzle` (builder API, no `db.query.*`), `tanstack-query` (hierarchical keys, `queryOptions`, minimal invalidation). Remove any new `new Date().toISOString().slice(0,10)` without zone; route through the shared utils (not `leads.ts`). Confirm no `await` inside any `withTransaction` callback and no new `db.transaction()` calls.

## 9. Docs to update on implementation

- `docs/04-billing-and-invoicing.md` (§Finalization: Issue Date input, number-follows-date rule, atomicity + gap policy).
- `docs/05-payments-and-finance.md` (paymentDate regex, warn-only pre-date rule).
- `docs/09-ui-dashboards-and-reporting.md` (export timezone + `isodate` fix; group revenue by `finalized_at`, not `created_at`).
- `docs/02-customers-and-memberships.md` (renew shortcut entry points; triple-date meanings).
- `docs/adr/0010-invoice-number-follows-issue-date.md` (new — uncomfortable trade-off, §12).
- Implementation note `docs/110-billing-dates-excel-renew.md` (ordered prefix per AGENTS.md).

## 10. Acceptance (mirrors issue #110, hardened)

- [ ] Back-dated + future Invoice/Payment via all 3 forms; PDFs + Outstanding Balance correct and mutually consistent (same canonical field).
- [ ] Exports match Organization wall clock for all date/datetime/isodate columns; date-only never flips days.
- [ ] Renew from expiration creates new Membership row with correct `duration_days_snapshot`; triple dates independent.
- [ ] Finalize is atomic (number+dates together or full rollback incl. sequence); back-date gaps permitted, failure gaps impossible.
- [ ] No bare UTC-slice date creation remains in touched paths; IPC `isodate` + validated `timezone` accepted; no `await` inside tx callbacks.
- [ ] Renderer back-date warning is local-only; IPC protocol unchanged.

## 11. Implementation order (dependency order — UI last)

1. Shared date/time primitives (+ move `orgTimezone` out of `leads.ts`).
2. Contracts / IPC schemas (Zod: `issueDate`, paymentDate regex, `isodate`, validated `timezone`; preview accepts optional date).
3. DB posture: confirm global UNIQUE (no migration) + sequence concurrency contract.
4. `invoiceRepo.updateNumber` (org-scoped).
5. Billing finalization (atomic number+dates).
6. Membership sale + renewal (shared issueDate).
7. Finance payment handling (regex, warn-only pre-date).
8. PDF/read-model consistency (`finalized_at ?? created_at` everywhere).
9. Excel conversion (primitives + matrix).
10. Renderer forms (pickers, gating, local warnings).
11. Renew entry points.
12. Tests (unit → repo/DB → parity → Electron path).
13. Docs (+ ADR-0010).
14. Full regression review (§8).

## 12. ADR-0010 (to be written as `docs/adr/0010-invoice-number-follows-issue-date.md`)

> Invoice numbers follow the selected issue date rather than creation order. Consequently, entering an older invoice after newer invoices may produce numbers whose embedded dates do not follow creation chronology. Existing finalized invoices are never renumbered. Back-dated gaps are accepted as an audit consequence of late entry. `created_at` preserves when the row was typed; `finalized_at` preserves the commercial paper date at day precision.
