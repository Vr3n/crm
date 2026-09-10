# 107 — Lead Uniqueness Detection

Reactive, client-side duplicate detection for the lead forms: while the user types, the
form probes the backend for an already-existing person so "this lead already exists" is
caught **before** submit — never as a failed round-trip.

## Summary

New IPC endpoint `leads:checkPerson` answers the "is this person already on file?"
question live. The New-Lead and Edit-Lead dialogs debounce the typed name/phone/email,
run the probe once the phone is a valid Indian number and the name is non-empty, and
react with two distinct states:

- **Block (red, `role="alert"`, submit disabled)** — the phone belongs to a person whose
  normalized name matches what was typed. Same **name + phone together** is the
  unique-together key: that person's lead already exists, so the form refuses.
- **Warn (amber, "can still use it")** — the phone belongs to a **different** person, or
  the email belongs to someone else. Advisory only: the number/email may be attached to
  multiple leads, so the form stays submittable.

## Decisions

1. **Always block on name+phone.** A same name+phone person blocks regardless of whether
   that person's lead is open/won/lost — two people with the identical identity is a data
   entry mistake. (A same-phone/different-name person is allowed to attach.)
2. **Email is advisory only.** Phone is the identity key; an email collision on a different
   person never blocks — only a yellow warning.
3. **Edit mode excludes the lead's own person.** The edit dialog passes `excludePersonId`,
   so a number typed back exactly as stored never flags the lead itself. A match against
   any *other* person is a hard conflict (the edit backend already enforces this).
4. **Incomplete/invalid input never throws.** The application layer parses the phone with
   `IndianMobileNumber.parse` inside a try/catch — while the user is mid-typing the probe
   simply reports "all clear" instead of erroring the form.

## Files Changed

### Backend (new endpoint)

| File | Change |
|---|---|
| `src/shared/contracts/sales.ts` | `checkLeadPersonInputSchema` (`fullName`, `phone`, `email?`, `excludePersonId?`), `personBriefSchema`, `leadPersonAvailabilitySchema` (`phoneTaken`, `sameNamedPerson`, `matchedPerson: PersonBrief \| null`, `emailTaken`, `emailOwnerName`) + types |
| `src/main/domain/lead.ts` | `normalizePersonName` (trim, collapse whitespace, lowercase) + `samePersonName(a, b)` — the unique-together comparator |
| `src/main/repositories/sales.ts` | `personRepo.findByEmail(organizationId, emailLower, excludePersonId?)` — case-insensitive match on `lower(email)`, scoped to the org |
| `src/main/application/leads.ts` | `checkLeadPersonAvailability(input)` — requires `lead.view`; parses phone (no-match on failure), finds by phone, compares names, resolves email owner |
| `src/shared/contracts/ipc.channels.ts` | `LEADS_CHECK_PERSON: 'leads:checkPerson'` |
| `src/main/ipc/sales.ts` | `handle(LEADS_CHECK_PERSON, checkLeadPersonInputSchema, …)` |
| `src/preload/index.ts` / `index.d.ts` | `leads.checkPerson(input)` facade + types |

### Backend (dependency)

`src/main/repositories/sales.ts` now imports `ne` from `drizzle-orm` for the
`excludePersonId` predicate.

### Frontend (reactive UI)

| File | Change |
|---|---|
| `src/renderer/src/features/leads/api.ts` | `checkPerson` IPC delegate |
| `src/renderer/src/features/leads/queries.ts` | `useLeadPersonAvailability(input)` — `enabled: Boolean(input)`, `retry: false`, `staleTime: 1000`, no refocus refetch |
| `src/renderer/src/features/leads/components/new-lead-dialog.tsx` | Debounced probe; phone `extraError` (block) + phone/email `warning`; submit gating `\|\| personExists \|\| availabilityChecking` |
| `src/renderer/src/features/leads/components/edit-lead-dialog.tsx` | Same probe with `excludePersonId: lead.personId`; any other-person phone match blocks |
| `src/renderer/src/components/ui/field.tsx` | `FieldWarning` (amber, `aria-live="polite"` — never an `alert`) + warning-first precedence (error > warning > hint) |
| `src/renderer/src/components/ui/form-field.tsx` | New `warning` prop — forwards `data-warning` to the control, suppresses the green success check while warned |
| `src/renderer/src/components/ui/input.tsx` | `data-warning:border-amber-500` etc. (error styling wins over warning) |

## UI copy

- **Block (red, under phone):** `A lead for {name} already exists — open their existing record instead.`
- **Amber (phone):** `This number is already on file for {name} — you can still attach the lead to them.`
- **Amber (email):** `This email already belongs to {name} — you can still use it.`

## Accessibility

- A blocked phone renders as `role="alert"` (`#phone-error`) — announced instantly.
- Amber warnings render as a polite `<p aria-live="polite">` (`#phone-warning` / `#email-warning`),
  never `role="alert"`, because they must not interrupt or block.
- `aria-describedby` points at whichever message is showing; the input carries
  `aria-invalid` for errors and `data-warning` for ambers.

## Testing

- `tests/domain/lead-name.test.ts` — `normalizePersonName` / `samePersonName`
  (whitespace + case folding, no two-words-considered-same).
- `tests/main/application/leads.test.ts` → `checkLeadPersonAvailability` — all-clear,
  same-name match, name mismatch on a taken phone, name normalization, excludePersonId,
  email-warning-only, invalid phone → all-clear, permission denial.
- `tests/e2e/lead-duplicate.spec.ts` (Playwright, real Electron) — creates a reference
  lead, then live-asserts block (red + disabled submit), phone amber, email amber, and
  the backend guard still on submit.

## Note: IPC error messages across the bridge

The E2E surfaced that Electron's contextBridge clones the preload's thrown
`ApiError` into a plain `Error` in the renderer realm — `instanceof ApiError`
fails and `code` is dropped, but `message` survives. Relying on `isApiError`
therefore made every dialog show its generic fallback ("Could not create lead")
instead of the real backend message. Dialogs and toasts now display through
`errorMessage(err, fallback)` in `src/shared/contracts/errors.ts`, which reads
the surviving `message` off any `Error`. Branching on `code` in the renderer is
still not possible for bridge-cloned errors (documented in preload `call`).

## Run

```sh
npm run typecheck:node && npm run typecheck:web
npm run lint
npm test
npm run test:e2e          # builds + runs Playwright (real Electron)
```