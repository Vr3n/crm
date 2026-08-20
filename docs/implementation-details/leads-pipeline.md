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

Full suite: **19 files / 306 tests passing**; `typecheck:node`,
`typecheck:web`, and `lint` (0 errors) are clean.

### Lazy-loaded dialogs (RAM)

The seven lead dialogs are `React.lazy` + `<Suspense fallback={null}>`, so their module graphs
(and everything they import) are only parsed once a dialog is first opened — the initial page
load no longer pays for them. This directly addresses the cold-lead-dialog RAM spike: leaked
child windows were pinning a full React alternate-fiber tree + V8 context. (Route-level
lazy-loading in `AppRoutes.tsx` remains future work.)

## Bulk selection toolbar (follow-up / activity / move / delete)

A bulk-action toolbar appears on the left of the Table/Board tab row while rows are selected
(**table view only**; switching views clears the selection). It shows the selected count and,
left to right: **Schedule follow-up**, **Schedule activity**, **Move Stage**, and **Delete**
(with an AlertDialog confirm). Buttons wrap (`flex-wrap`) when the row is narrow.

- **Selection state** lives on the page (`LeadsPage` owns a `Set<number>`) and is passed down to
  `LeadTable` as controlled `selected` / `onSelectionChange` — the table is no longer the owner.
  The same selection powers the toolbar.
- **Move Stage** offers only stages reachable from **every** selected lead (the intersection of
  `forwardStages`), so a single choice is always a legal move for the whole batch. Leads already
  at the target are skipped by the backend.
- **Permissions mirror the backend** (`lead.delete`, `lead.update_stage`, `followup.create`,
  `lead.record_activity`): hiding the buttons is UX only, never authorization. Per the decision
  record, `lead.delete` + `lead.update_stage` are granted to **Manager** and **Sales**;
  `followup.create` + `lead.record_activity` also cover **Front Desk**; Finance (read-only) gets
  none of the four.
- **Action color coding** uses the semantic tokens so the four actions are distinguishable at a
  glance: **Schedule follow-up** cyan (`text-primary`), **Schedule activity** violet
  (`text-violet`), **Move stage** pink (`text-secondary`, with an `ArrowRightLeft` icon in the
  trigger) and **Delete** red (`text-destructive`). Icons inherit `currentColor`, and each button
  gets a matching `hover:bg-<color>/10`.
- **Schedule follow-up** opens `bulk-follow-up-dialog.tsx` — one follow-up per selected lead
  (shared title + due time). The due time uses the shared `DateTimePicker` and the backend
  rejects past dates, so "follow-up = future work" holds for the whole batch.
- **Schedule activity** opens `bulk-activity-dialog.tsx` — a type select (defaulting to the first
  active type that isn't an internal `OWNER_CHANGE`/`STAGE_CHANGE` bookkeeping type) plus a note,
  recorded against every selected lead.
- All four mutations clear the selection on success (`onSuccess`), hiding the toolbar. Both bulk
  dialogs are `React.lazy` + `<Suspense>` like the single-lead dialogs and own their mutations —
  `LeadsPage` passes `leadIds` (snapshot of the selection) + `onSuccess={clearSelection}`.

### Backend: `leads:delete` and `leads:bulkMoveStage`

- `deleteLeads` is gated on `lead.delete`, verifies every id belongs to the org (NotFoundError,
  all-or-nothing), then deletes children in dependency order inside one transaction —
  `lead_stage_history` → `lead_activities` → `lead_followups` → `leads` (FKs have no CASCADE
  and `PRAGMA foreign_keys` is ON). The **person row is preserved** (a person can hold other leads).
- `bulkMoveLeadStage` is gated on `lead.update_stage`. Every lead is validated against the stage
  machine up front (all-or-nothing); the strict-move rule requires a real activity per stage
  change, so each moved lead records a **NOTE** activity (`Bulk move to <STAGE>`) and a stage
  history row inside the single transaction. Returns `{ moved }`.
- Contracts: `deleteLeadsInputSchema` (`leadIds`, 1..200), `bulkMoveLeadStageInputSchema`,
  `bulkMoveLeadStageResultSchema`. Channels `leads:delete` and `leads:bulkMoveStage` are bridged
  through preload (`window.api.leads.deleteLeads` / `.bulkMoveStage`) and the TanStack hooks
  `useDeleteLeads` / `useBulkMoveStage` (invalidate `['leads']` + toast on success).

### Migration v7 — `lead.delete` for existing orgs

Adds the `lead.delete` permission row (if missing) and grants it to the **Manager** and **Sales**
starter roles of **existing** organizations (orgs created after this migration get it from
`SEED_ROLES` at org-setup instead). The migration is self-guarded: `INSERT OR IGNORE` for the
permission, and the grant `INSERT … SELECT` only matches rows that don't already have it, so it is
idempotent.

### Backend: `leads:bulkScheduleFollowup` and `leads:bulkRecordActivity`

- `bulkScheduleFollowUp` is gated on `followup.create` (the same code as the single-lead flow).
  It trims the title and validates the due date **once up front** — a past date throws
  `ValidationError` before anything is written. Every id must belong to the org
  (`NotFoundError`). All rows are inserted in one `withTransaction`; returns `{ scheduled }`.
- `bulkRecordActivity` is gated on `lead.record_activity`. It resolves the activity type once and
  inserts a row per lead inside one transaction — all-or-nothing. Returns `{ recorded }`.
- Contracts: `bulkScheduleFollowUpInputSchema` (`leadIds` 1..200, `title`, `dueAt`),
  `bulkScheduleFollowUpResultSchema` (`{ scheduled }`), `bulkRecordActivityInputSchema`
  (`leadIds`, `typeId`, `note`, **required** `occurredAt`), `bulkRecordActivityResultSchema`
  (`{ recorded }`). Channels `leads:bulkScheduleFollowup` / `leads:bulkRecordActivity` are
  bridged through preload (`window.api.leads.bulkScheduleFollowup` / `.bulkRecordActivity`) and
  the TanStack hooks `useBulkScheduleFollowUp` / `useBulkRecordActivity` (invalidate `['leads']`).
- Both follow the same all-or-nothing contract as `deleteLeads` / `bulkMoveLeadStage`: validate
  everything up front, then commit once.

## Edit lead (owner-or-admin)

Editing a lead's **details** (name / phone / email / source / plan interest / goal / notes) is an
**owned** action: only the lead's owner or an admin can edit it.

- **Permission `lead.edit`** is added to the catalog (`src/main/db/permissions.ts`) and granted to
  the **Manager** and **Sales** starter roles (consistent with `lead.delete`). Owner (super) and
  Admin (super) inherit it automatically. Front Desk keeps read-only lead access. Org-setup
  seeding (`SEED_ROLES`) covers new orgs; **Migration v8** (`grant_lead_edit`) grants it to the
  Manager and Sales roles of **existing** orgs, idempotently (`INSERT OR IGNORE` permission +
  `NOT EXISTS` grant, mirroring v7).
- **Backend use case `editLead`** (`src/main/application/leads.ts`): requires `lead.edit`, then
  enforces ownership — `if (!session.isSuper && lead.ownerUserId !== session.userId)` →
  `ForbiddenError`. After the gate it reuses the create-time validations: `IndianMobileNumber`
  parse, source must exist (`NotFoundError`), person must exist, and the NOTE activity type must
  be configured. Inside one `withTransaction` it re-checks phone uniqueness (a phone owned by a
  **different** person → `ConflictError`; the person's own number passes), updates the person row
  (`full_name` / `phone` / `email`), updates the lead (`source_id` / `plan_interest` / `goal` /
  `notes`), and appends a **NOTE** activity (`Lead details updated`) to preserve the audit trail.
  Returns `void`.
- **Contract / transport:** `editLeadInputSchema` (`leadId` + the same fields as
  `createLeadInputSchema`), channel `leads:edit`, IPC handler (validates → use case → envelope),
  preload bridge `window.api.leads.editLead`, TanStack hook `useEditLead` (invalidate `['leads']`
  + toast).
- **Renderer UX** (`edit-lead-dialog.tsx`, `React.lazy` like the other dialogs):
  - Opened from a **Pencil icon** in a new **Actions column** of the table (right-aligned,
    `stopPropagation` so it never opens the detail page) and from a **Pencil icon in the card
    footer** on the board.
  - The Actions column only renders when **at least one** listed lead is editable
    (`leads.some(canEditLead)`), so a read-only role never sees empty column chrome; per-row the
    button renders only for owned leads.
  - `canEditLead(lead)` on the page = `can(..., 'lead.edit') && (isSuper || lead.owner?.id ===
    userId)` — hiding is UX only, the backend re-enforces ownership.
  - The dialog is **prefilled** from the lead (comboboxes use the `selectedOption` prop of
    `AutocorrectCombobox`), reuses the same live validation as `new-lead-dialog`, submits via
    `useEditLead`, and auto-closes ~700ms after success.

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
- `tests/main/application/leads.test.ts` — `bulkMoveLeadStage` moves several leads with a NOTE
  activity + stage history each, skips leads already at the target, rejects terminal targets and
  unknown ids, and is `lead.update_stage`-gated; `deleteLeads` removes leads with their
  activities / follow-ups / stage history while preserving the person row, and is
  `lead.delete`-gated.
- `tests/main/application/leads.test.ts` — `bulkScheduleFollowUp` schedules one follow-up per
  selected lead (title trimmed), rejects a past due date before writing anything, throws
  `NotFoundError` on an unknown id, and is `followup.create`-gated; `bulkRecordActivity` records
  one activity per selected lead, throws `NotFoundError` for an unknown lead or type, and is
  `lead.record_activity`-gated.
- `tests/main/ipc/sales.test.ts` — `LEADS_DELETE` and `LEADS_BULK_MOVE_STAGE` add their envelopes
  (valid, malformed-input, and permission-denied cases); `LEADS_BULK_SCHEDULE_FOLLOWUP` and
  `LEADS_BULK_RECORD_ACTIVITY` add valid / malformed / `PERMISSION_DENIED` envelopes.
- `tests/db/migrations.test.ts` — expected version set includes 8; idempotency count = 7; a new
  case simulates an org that predates the `lead.delete` / `lead.edit` grants and asserts Manager +
  Sales receive them (Front Desk does not), and that a re-run is a no-op.
- `tests/main/application/leads.test.ts` — `editLead` persists person + lead changes and appends a
  `Lead details updated` NOTE activity; the owner (non-super) can edit their own lead; a different
  owner with `lead.edit` is still rejected (`ForbiddenError`); a super edits a lead they do not
  own; unknown lead / source → `NotFoundError`; a phone owned by another person → `ConflictError`
  (the person's own number passes); a role without `lead.edit` is denied. The `signInAs` helper
  creates a brand-new staff member in a role and switches the session to exercise ownership.
- `tests/main/ipc/sales.test.ts` — `LEADS_EDIT` adds valid / malformed-input / `PERMISSION_DENIED`
  envelopes.
- `tests/renderer/leads-page.test.tsx` — the edit action shows per owned lead in the table, hides
  for leads owned by someone else, the Actions column disappears entirely for roles without
  `lead.edit`, the board card footer shows the same icon, and the dialog opens prefilled and saves
  through `editLead`. `tests/renderer/setup.ts` pre-imports `edit-lead-dialog` (with the two bulk
  dialogs) so the lazy dynamic import resolves instantly in tests.
- `tests/renderer/leads-page.test.tsx` — the toolbar appears only with a selection, bulk move
  sends the intersection-corrected target, scheduling a follow-up / logging an activity sends
  every selected id through the bulk dialogs (due date picked via the `DateTimePicker`), the
  delete confirm fires `deleteLeads`, permissions hide the actions, and switching to Board clears
  the selection. `tests/renderer/setup.ts` pre-imports the two bulk dialogs so their
  `React.lazy` dynamic imports resolve instantly in tests (the first-transform cost is paid at
  setup instead of during a click).

## Source filter reads the org's reference data

- `LeadFilters` now filters by `sourceId: number | 'ALL'` instead of the canonical
  `SourceKey` (`types.ts`). `filterLeads` compares `l.sourceId !== filters.sourceId`, so
  matching is against the real SQLite id rather than the lossy `sourceKeyFromName` mapping
  (custom sources previously collapsed into `OTHER` and could never be targeted).
- The filter dropdown in `lead-filters.tsx` is populated from `useReferenceData()` (the same
  TanStack Query cache the lead forms use) — active sources only (`s.active`), so an admin
  adding a source via `createSource` (which invalidates `referenceKeys.all`) makes it appear
  here immediately. `Lead.source`/`SOURCES` remain for display and metric grouping.
- `LeadFilters` triggers the reference-data query on page mount (previously it only loaded when
  a dialog opened); this is shared cache so the lazy dialogs now hydrate instantly, and the
  5-minute `staleTime` prevents refetch churn.
- The three filter selects (Stage / Source / Owner) gained `aria-label`s, matching the
  selection-toolbar's `aria-label="Move stage"` pattern — they had no accessible name before.

## Known gaps / notes

- The lead-level `notes` column is the domain "Note" (informational context), distinct from
  Activity — it is not surfaced on the timeline (matches the domain model and the previous UI).
- No owner picker at creation (auto-assigned); reassignment is via the assign flow.
- WON remains unreachable in v1 (conversion is Module 02); the convert dialog is removed.
- Reference-data vocabulary is admin-seeded; runtime edits currently cover **creating a source**
  in the lead form (`settings.manage`); editing/deactivating the rest of the vocabulary at
  runtime remains future work.