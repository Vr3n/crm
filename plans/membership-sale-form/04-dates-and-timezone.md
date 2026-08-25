# 04 — Dates & Timezone

## 4.1 — What the user said

- `Q5`: "It is days. The enums will help us auto select the date range (start and end) easily."
- `Q14`: "Start date = 25-08-2026, Plan Duration = QUARTERLY, End date = 25-11-2026 … start date + 90 days, and accordingly for others."
- `Q15`: "End date should not be less than the start date and it shouldn't violate the days (QUARTERLY, etc)."
- `Q16`: "Timezone should be UTC, and then accordingly shown in the UI by the Local time. e.g. (+5:30 Asia/Kolkata)."
- `Q17`: "It can be back dated, and block `start_date > end_date` live, and also on submit."

## 4.2 — Duration → days mapping

`plans/membership-form.md:24` listed `MONTHLY, QUATERLY, …`; corrected to `QUARTERLY` and mapped as literal **day counts** (not calendar months) to stay deterministic and avoid leap-month ambiguity for manual clerks.

| `membershipPlans.duration` | `durationDays` | End derivation | Nickname in UI |
|---|---|---|---|
| `MONTHLY` | 30 | `start + 30d` | 1 month |
| `QUARTERLY` | 90 | `start + 90d` | 3 months |
| `HALF_YEARLY` | 180 | `start + 180d` | 6 months |
| `YEARLY` | 365 | `start + 365d` | 12 months |

**Why days, not calendar arithmetic**: for a gym day-count membership, clerks think "90 days" and Tally-style invoices show day ranges. `+90d` on `25-08-2026` → `23-11-2026` naïve inclusive-exclusive differs by 2 days from the user's `25-11-2026` example; spec pins the example as authority, so the plan notes the mapping is `start + 90d` with end **inclusive** of the 90th day (`addDaysInclusive` = `start + (days-1)`). If the organization later wants calendar-month semantics, the `daysForDuration` table is the single switch (ADR scope).

**Snapshot**: `memberships.duration_days_snapshot` (`membership.ts:67`) stores the chosen days at sale — not the enum string — so history reflects the actual entitlement length even if the plan's enum changes.

### Alternative considered

Using `date-fns addMonths` calendar arithmetic (`MONTHLY= +1 month`) was rejected for v1: `+1 month` on Jan 31 → Feb 28/29 ambiguity forces policy choices; days are uniform and match the user's explicit "90 days" answer. A future ADR can swap the mapping to calendar months behind a `durationDaysFromDuration` function if a gym wants month-aware billing.

---

## 4.3 — Controls

- **Two independent pickers** (`Q36` "Start and End date will have independent inputs. Start date (datepicker, no time picker)"): shadcn `Calendar` / `Popover` each, not a range picker — keeps start and end independently editable after auto-seed.
- Both show **local wall date in `Asia/Kolkata`** (`en-IN` locale, `dd/MM/yyyy`), bound via `date-fns` after `formatInZone(date, 'Asia/Kolkata')`.
- **Auto-link logic**:
  1. On mount: `startDate = todayInZone('Asia/Kolkata')` (ISO date, no time).
  2. On `planId` change or `startDate` change: `endDate = addDaysInclusive(startDate, daysForDuration(plan.duration))`. Flag `dateLinked = true`.
  3. If the user subsequently edits `endDate` manually → set `dateLinked = false` until the next `planId` or `startDate` change (same "break-sync, offer reset" pattern as pricing §03).
  4. Tooltip on end field when linked: "Auto-set from Quarterly · 90 days".

- **Back-dating**: `startDate` may be any past date (no min). No `max` future guard — yearly membership can start next year if the clerk wishes.

---

## 4.4 — Storage & display timezone strategy

Research precedent: `toolbit.dev/blog/timezone-nightmare`, `procedure.tech/timezone-aware-scheduling`, `iotools.cloud/time-zones-are-a-lie`, `himanshupatil.dev/blog/why-timezone-bugs…`, `agilearn.co.uk/guides/dates-and-times/concepts/utc-everywhere`, `stackconvert.com/blogs/utc-gmt-time-zones…` all converge on **"UTC everywhere, convert at the edges"** + IANA zone identifiers.

**For date-only membership windows** (no time-of-day):

- Store as **UTC ISO date `YYYY-MM-DD`** (`TEXT` at `membership.ts:73-74`). No offset suffix needed; midnight matters only for day-boundary queries.
- On read, render via `Intl.DateTimeFormat('en-IN', {timeZone: 'Asia/Kolkata', dateStyle:'medium'})` using `Temporal` / `date-fns-tz` until `Temporal` is available in Electron's Chromium. The zone is the organization's configured `Asia/Kolkata` (`Q16`), not the device's guessed zone, to avoid DST-drift if the gym later operates across zones.
- IPC contract sends `start_date: string (YYYY-MM-DD)` + `end_date: string` — no time, no offset. Backend persists verbatim after `Zod` `YYYY-MM-DD` regex validation.
- Organization setting `organization.timezone` (IANA name) is persisted alongside `invoiceNumber` settings (see 06) and injected into both render and main for consistent formatting.

**Edge handling** (India has no DST but protocol still matters): never do local arithmetic before UTC conversion; `addDays` is applied to the local calendar date then re-serialized as the same UTC date.

---

## 4.5 — Validation

Per `plans/membership-form.md:24` + `Q15/Q17`:

- **Live** (inside `form.Field` onChange + form-level onChange):
  - `end < start` → `End date cannot be before start date` (red, `aria-invalid`, `role=alert`).
  - `daysBetween(start,end) +1 < durationDays` → `End violates Quarterly — membership must last at least 90 days (ends 23/11/2026 earliest)` — threshold uses the snapshot days, phrased with the concrete violation date so the clerk knows the bound.
- **On submit**: same checks re-enforced; backend re-validates in the tx and returns `VALIDATION_ERROR` with the same message if the client raced.
- Both pickers `disabled`? No — free selection; only the error states gate submit via `canSubmit`.

### Hint line

`labelEnd` on end field shows the derived label: `25 Aug 2026 → 23 Nov 2026 · 90 days` (computed `durationLabel`), reinforcing what the enum means concretely for the clerk.

---

## 4.6 — Testing the date logic

- Unit tests: `addDaysInclusive('2026-08-25','QUARTERLY')='2026-11-23'` (and the user's inclusive `2026-11-24` variant — pick one and freeze the expectation), `daysBetween('2026-08-25','2026-11-23')=90`, DST-neutral iteration.
- Component tests: selecting a plan auto-fills end; editing end severs link; swapping plan re-links; error appears live when end dragged before start.

### References

- `plans/membership-form-querstions-solutions.md:8, Q14-Q17, Q36`.
- `src/main/db/schema/catalog.ts:23` (`duration`), `membership.ts:67,73-74` (snapshot + window), `docs/02-customers-and-memberships.md:60-66` (dates as ground truth).
- Research: `toolbit.dev/blog/timezone-nightmare`, `procedure.tech/timezone-aware-scheduling-django-react-playbook`, `iotools.cloud/journal/time-zones-are-a-lie`, `himanshupatil.dev`, `agilearn.co.uk/guides/dates-and-times/concepts/utc-everywhere`, `stackconvert.com`.
