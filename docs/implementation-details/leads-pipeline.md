# Implementation Details — Leads / Sales Pipeline (Module 01)

This document is the implementation-level counterpart to `docs/01-people-leads-sales.md`
and the sales design in `docs/backend-plan/01-sales.md`. It covers the **real, SQLite-backed**
leads pipeline: how the renderer talks to the backend, how the data layer is shaped, and the
recent additions (plan interest / goal / notes capture, TanStack Query/Form refactors).

## Scope of this pass

- Wire the entire leads surface (pipeline list, lead detail, stage moves, activities,
  follow-ups, mark-lost, new lead) to the real `node:sqlite` backend through the typed
  IPC bridge — replacing the mock data layer.
- Restore the business-facing lead fields (**plan interest, goal, notes**) that the original
  mock form captured, now persisted on the `leads` table via migration v5.
- Harden the renderer data layer with TanStack Query `queryOptions` and convert the capture
  dialogs to TanStack Form (validated, `canSubmit`-gated).

## Architecture

Strictly follows `docs/08-persistence-and-electron-architecture.md`:

```
React renderer → preload bridge (window.api.leads.*) → main IPC handlers
  → application use cases (src/main/application/leads.ts)
    → domain (src/main/domain/lead.ts) → repositories (src/main/repositories/sales.ts)
      → SQLite via drizzle (src/main/db)
```

Renderer code never imports the SQLite driver; every write/read goes through typed IPC
channels (`src/shared/contracts/sales.ts` + `src/shared/contracts/ipc.channels.ts`),
with Zod validation at the IPC boundary.

## Backend

### `leads:list` — the single pipeline read model

The whole leads feature renders from one query (`listLeads`): base rows join person / stage /
source / owner / lost-reason, and the nested arrays (activities, follow-ups, stage history)
are fetched in three batched `IN` queries keyed by lead id — four SQL round-trips total,
regardless of page size. Filters (`search`, `stageId`, `sourceId`, `ownerUserId`, `range`)
map to indexed columns; `range` resolves to an org-timezone day boundary
(`localDayUtcRange`). Migration v4 added `idx_leads_org_source`.

### `recordActivity` returns `{ activityId }`

Stage moves must reference a real activity (Module 01 robustness rule: "every stage change is
caused by a recorded activity"). The move dialog therefore calls `recordActivity` (a NOTE) first
and passes the returned `activityId` into `moveStage`. The contract gained
`recordedActivitySchema`; preload (`index.ts` / `index.d.ts`) was updated.

### Migration v5 — `leads` extra fields

Adds nullable `plan_interest`, `goal`, `notes` TEXT columns to `leads`. Generated with
`npx drizzle-kit generate --name leads_extra_fields`, wired into the `?raw`-bundled runner
(`src/main/db/migrations.ts`) as version **5** (versions 1–2 are reserved by the legacy runner).
`tests/db/migrations.test.ts` updated for the new version set `[0,3,4,5]`.

### Migration v6 — seed sales reference data for existing orgs

Databases whose org was created **before** `setupOrganization` provisioned sales reference data
(roles+stages+sources+activity types+lost reasons) have the tables but no rows, so `createLead`
fails with `INVALID_STATE_TRANSITION No initial lead stage is configured`. Since v1 allows only one
org per install, the org can never be re-setup. Hand-written idempotent data migration
(`20260819100000_seed_sales_reference_data`) inserts the `SEED_STAGES` / `SEED_SOURCES` /
`SEED_ACTIVITY_TYPES` / `SEED_LOST_REASONS` rows (`src/main/db/seed.ts`) for every org that has
zero rows in that table. Registered as version **6** in `src/main/db/migrations.ts`;
`tests/db/migrations.test.ts` updated for the version set `[0,3,4,5,6]` plus a focused test that
builds an "old org with no stages" database, runs migrations, and asserts the seeded pipeline
(`NEW` initial → `WON`/`LOST` terminal) survives a second migration run.

### `createLead`

- Enforces `LEAD_CREATE`, parses the phone via `IndianPhoneNumber` (mobile **or** landline), uses the org's initial
  stage from the stage machine, dedupes the person by normalized phone, enforces one active
  lead per person.
- Persists `planInterest` / `goal` / `notes` (trimmed; blank → `NULL`).
- **Owner is auto-assigned to the signed-in user** (session `userId`) — there is deliberately
  no owner picker at creation; reassignment happens via `assignLead` (records an
  `OWNER_CHANGE` activity).

## Renderer data layer

- `features/leads/api.ts` — thin IPC facade over `window.api.leads.*`.
- `features/leads/queries.ts` — `leadsListOptions = queryOptions({...})` (page 1, limit 200,
  `staleTime: 30_000`); `useLeads` consumes it directly; `useLead(id)` spreads it with a
  `select` + `enabled` so the detail reads from the shared list cache (no extra round-trip).
  Mutations are created by a `useLeadMutation` factory that invalidates `['leads']` on success
  and surfaces stable `ApiError` messages.
- `features/leads/reference-data.ts` — `referenceDataOptions = queryOptions({...})` with a
  `staleTime` of 5 min and a **standalone key** `['reference-data']` (outside the `leads`
  prefix) so lead mutations don't refetch the vocabulary on every write. `getLeadMaps` builds
  the id ↔ name maps; `sourceKeyFromName` / `stageKeyFromName` / `lostReasonKeyFromName` /
  `activityTypeKeyFromName` resolve backend names to canonical renderer keys.
- `features/leads/mapping.ts` — `mapLeadRow` hydrates the IPC row (including the new
  `planInterest` / `goal` / `notes`) into the display `Lead`.
- `features/leads/types.ts` — numeric SQLite ids everywhere; `NewLeadInput` carries the
  optional `planInterest` / `goal` / `notes`.

## Capture dialogs (TanStack Form)

### The reactive form standard — `FormField`

The auth forms' UX (red `aria-invalid` on error, green `data-valid` once complete, a
`CheckCircle2` success check in the reserved helper line) is now the app-wide standard,
extracted into `src/renderer/src/components/ui/form-field.tsx` and used by **every** lead
dialog (`AuthGate` delegates to it too).

Evaluation rule (matches auth): a field is *evaluated* once it is **touched**, the form was
**submitted**, or its `completeWhen(value)` predicate flips true (e.g. a 10-digit mobile) — so
inputs react live, not only after blur. An external `extraError` (async checks) is always
treated as invalid. Two usage modes:

- **Input convenience**: pass `leading`/`trailing` addons + input props; `FormField` renders
  the `<Input>` in an `InputGroup` (name, phone, email, follow-up title/due).
- **Render-prop**: pass `children` receiving `{ id, value, invalid, valid, describedBy, onBlur,
  onChange }` to spread onto custom controls (Select, Textarea, DateTimePicker).

The `Field` helper renders `<label for>` + a reserved helper line that swaps
hint/error (`id = <name>-hint` / `<name>-error`, wired via `aria-describedby`; errors use
`role="alert"`). Controls style themselves from `aria-invalid` / `data-valid`.

### Dialogs

- `new-lead-dialog.tsx` — Name (required), Phone (required — accepts **mobile or landline**,
  live digit counter in the **label row** (right-aligned opposite the label, via the new
  `labelEnd` slot), strips non-digits, caps at 10; a wrong starting digit errors immediately),
  Email (**optional** — empty is valid, formats validate granularly), Source (the
  **`AutocorrectCombobox`** — searches `lead_sources` live and can create a brand-new source on
  the fly), Plan interest, Goal (both also `AutocorrectCombobox`, over the free-text vocabulary
  below), Notes. `useCreateLead`
  skips the toast so backend errors surface in an inline `role="alert"` banner. Success shows
  `Created!` then auto-closes after 700 ms. Dialog remounts per open, so state is fresh every
  time (no reset effect). Short fields sit two-up (`grid gap-3 sm:grid-cols-2`: phone + email,
  then plan + goal) with `FieldGroup gap-3` and `min-w-0` grid children so nothing overflows.
- `move-stage-dialog.tsx` — strict move flow; the `scheduleOn` → follow-up dependency is gated
  by a **form-level validator** (the dependent inputs only mount after the checkbox flips, so a
  per-field validator can't veto `canSubmit`), with per-field validators for inline errors.
- `mark-lost-dialog.tsx`, `log-activity-dialog.tsx`, `follow-up-dialog.tsx` — TanStack Form
  with `onBlur={field.handleBlur}`; log-activity disables the type select when no activity
  types are configured; the global variants invalidate the `LeadPicker` until a lead is picked.
- `LeadDetailPage` guards non-numeric route ids (`Number.isNaN` → treat as missing).

### Radix Select guard

Radix's controlled `Select.Root` fires `onValueChange('')` once on mount when its initial
`value` is `''` and items arrive later. Feeding `Number('')` → `0` would corrupt id fields, so
**every** Radix select feeding an id field guards: `if (v !== '') field.handleChange(Number(v))`.
Caught by the component tests below.

### The source `AutocorrectCombobox`

The new-lead **Source** field is the production user of the reusable
`AutocorrectCombobox` (`docs/components/shadcn-autocomplete-create.md` + the implementation doc
`autocorrect-combobox.md`). It replaced the Radix `Select` so the source vocabulary is searched
server-side and can grow without leaving the form:

- **Backend** (`leads:searchSources` / `leads:createSource`): `sourceRepo` gained `search`
  (active sources only, `LIKE` on name, ordered by `sort_order`, capped at 20), `findByName`
  (case-insensitive, for duplicate detection) and `create` (`sort_order = max+1`, org-scoped).
  `searchLeadSources` gates on `lead.view`; `createLeadSource` gates on **`settings.manage`**,
  trims the name, rejects whitespace-only with `ValidationError` and case-insensitive duplicates
  with `ConflictError`, and owns one `withTransaction` boundary. Contracts
  (`leadSourceRowSchema` / `leadSourceSearchRequestSchema` / `createLeadSourceInputSchema`) and
  channels are in the shared contracts; preload + renderer `api.ts` expose `searchSources` /
  `createSource`.
- **Renderer**: the dialog wraps the field adapter (`handleChange` translates the combobox's
  `null` clear-sentinel to `''` for react-form's string field), maps backend rows to
  `AutocorrectOption<string>` (`String(id)` + name), and passes `canCreate` from the session
  (`settings.manage` via `can()`), so viewers can search but not create. `onCreated` invalidates
  `['reference-data']` so the source filters and row hydration pick up the new source.
- No more deterministic seeding: the field is empty on mount, submit stays gated on an actual
  pick (`sourceValue === ''`), and "Choose a source" surfaces through the combobox's field
  adapter when a pick is cleared.

### Plan interest / Goal — free-text vocabulary comboboxes

Plan interest and Goal are **free-text** business fields (TEXT columns on `leads`; the domain
models them as what the front-desk person types, not an FK). The same combobox gives them
autocomplete without a vocabulary table:

- **Backend** (`leads:searchPlanInterests` / `leads:searchGoals`): `leadRepo` gained
  `distinctPlanInterests` / `distinctGoals`, which run `SELECT DISTINCT … FROM leads` over the
  org's non-empty values matching the query (`LIKE`, case-insensitive), ordered, capped at 20.
  The application use cases (gated `lead.view`) trim, de-duplicate case-insensitively, and
  return `{ id, label }` rows where **`id === label`** — the value itself is the identity.
  *No view:* a `%…%` LIKE on a TEXT column is a scan either way, so a view would add migration
  weight without helping a small CRM; the debounce + 20-row cap keep it cheap.
- **Renderer**: both fields pass an **identity create** —
  `create: async (label) => ({ id: label, label })` — so "+ Add …" commits the typed text as-is
  (free text is preserved; nothing is persisted at create time). Search reads live from the
  backend, so a value entered on one lead appears as a suggestion on the next (after the 30 s
  search stale window). No `settings.manage` gating: creating free text is always allowed.
- The combobox **query key is scoped per field** (`['autocorrect-options', name, query]`) so the
  three fields on this form never surface each other's cached results.

`field.tsx`/`form-field.tsx` gained a **`labelEnd` slot** (right-aligned on the label row) —
the phone's "digits remaining" counter moved there from the input's trailing addon, and the
checkmark still lives in the helper line. The component tests stub
`Element.prototype.scrollIntoView` plus Radix Select's pointer-capture methods
(`hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`) which jsdom lacks.

### Indian phone rules (mobile **and** landline)

The phone field now accepts landlines in addition to mobiles, per the shared domain:

- **Mobile:** 10 digits starting **6–9**, optional `+91` / `0091` / `91` / `0` prefix — stored
  as the bare 10-digit number (the person-identity key).
- **Landline:** an STD-prefixed number (`0` + 9–10 digits, e.g. `0221234567`) or a 10-digit
  local starting **2** (e.g. `2212345678`) — stored as entered.

`src/main/domain/phone.ts` exposes `IndianPhoneNumber` (with `IndianMobileNumber` kept as a
deprecated alias delegating to it); `src/renderer/src/lib/validation.ts` mirrors the exact same
regexes for live evaluation. A wrong starting digit is reported **immediately** (first character
typed): `Start with 6-9 (mobile) or 0/2 (landline)`. A regression caught by the main-process
suite: the country-code prefix must live **inside** the anchored regex
(`^(?:\+91|0091|91|0)?([6-9][0-9]{9})$`) — pre-stripping `91` from the input before matching
misreads a valid `91…` mobile (e.g. `9100000001`) as `91` + 8 digits and rejects it.
`identity/store.ts` uses the same accepted-digits set `/^[026-9]\d{9}$/` for the org phone.

`identity-card.tsx` surfaces **Plan interest** (Tag), **Goal** (Target), and **Notes**
(FileText) on the lead detail.

## Renderer component tests (React Testing Library)

Per AGENTS.md, the renderer now has a jsdom component-test project alongside the main-process
unit project (2026 stack: `@testing-library/react` 16 + `@testing-library/dom`,
`@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`).

- `vitest.config.ts` uses **`test.projects`**: `unit` (node, `tests/**/*.test.ts` + the
  existing coverage) and `components` (jsdom, `tests/renderer/**/*.test.{ts,tsx}`, aliases
  `@`/`@renderer`, React plugin, `setupFiles: tests/renderer/setup.ts`).
- `tests/renderer/setup.ts` stubs the browser APIs jsdom lacks (`matchMedia`,
  `ResizeObserver`), sets `IS_REACT_ACT_ENVIRONMENT`, mocks the whole **`window.api` preload
  facade** fresh per test (defaults: `getReferenceData` → canonical `ReferenceData` fixture,
  `list` → empty page), and exports `renderWithClient` (new `QueryClient` with `retry: false`
  per test) plus `referenceData` / `sampleLead` fixtures. No MSW — the IPC boundary is mocked.
- `tests/renderer/validation.test.ts` — the granular `leadNameError` / `mobileError` /
  `emailError` / `isValidIndianMobile` rules, including immediate wrong-digit feedback and
  landline acceptance.
- `tests/renderer/new-lead-dialog.test.tsx` — 19 tests covering live red/green evaluation, the
  phone digit counter + cap (counter now asserted on the label row), immediate wrong-start-digit
  error, landline acceptance (`0…` and `2…`), granular phone/email errors after blur,
  `aria-describedby` wiring, the full create payload (incl. plan/goal/notes, `sourceId: 1`), the
  inline backend `ApiError` banner, submit gating until a source is picked, live backend source
  search (no seeding), picking a source (`sourceId: 2`), creating a brand-new source on the fly
  (its returned id is submitted), the viewer `settings.manage` gating (can search, cannot add),
  live backend plan-interest / goal search with picks, creating brand-new plan interest / goal as
  free text (committed verbatim), and the required error that surfaces when a picked source is
  cleared.

Full suite: **18 files / 250 tests passing**; `typecheck:node`,
`typecheck:web`, and `lint` (0 errors) are clean.

### Lazy-loaded dialogs (RAM)

The five lead dialogs are `React.lazy` + `<Suspense fallback={null}>`, so their module graphs
(and everything they import) are only parsed once a dialog is first opened — the initial page
load no longer pays for them. This directly addresses the cold-lead-dialog RAM spike: leaked
child windows were pinning a full React alternate-fiber tree + V8 context. (Route-level
lazy-loading in `AppRoutes.tsx` remains future work.)

## Main-process tests

- `tests/main/application/leads.test.ts` — createLead persists plan/goal/notes and stores blank
  values as `NULL`; `listLeads` round-trips them. `searchLeadSources` filters to active matches
  (case-insensitive, trimmed) and is `lead.view`-gated; `createLeadSource` appends at
  `max(sort_order)+1` per org, trims, and rejects case-insensitive duplicates (`ConflictError`),
  whitespace-only names (`ValidationError`), and missing `settings.manage` (`ForbiddenError`).
  `searchLeadPlanInterests` / `searchLeadGoals` return distinct free-text values from the org's
  leads (case-collapsed, org-scoped) and are `lead.view`-gated.
- `tests/main/ipc/sales.test.ts` — the `LEADS_CREATE` envelope test now sends the new fields
  and asserts they persist; `LEADS_SEARCH_SOURCES` / `LEADS_CREATE_SOURCE` add their envelopes
  (including malformed-input and permission-denied cases); `LEADS_SEARCH_PLAN_INTERESTS` /
  `LEADS_SEARCH_GOALS` add valid and malformed-query envelopes.
- `tests/db/migrations.test.ts` — expected migration versions include 5; idempotency count = 4.

## Known gaps / notes

- The lead-level `notes` column is the domain "Note" (informational context), distinct from
  Activity — it is not surfaced on the timeline (matches the domain model and the previous UI).
- No owner picker at creation (auto-assigned); reassignment is via the assign flow.
- WON remains unreachable in v1 (conversion is Module 02); the convert dialog is removed.
- Reference-data vocabulary is admin-seeded; runtime edits currently cover **creating a source**
  in the lead form (`settings.manage`); editing/deactivating the rest of the vocabulary at
  runtime remains future work.