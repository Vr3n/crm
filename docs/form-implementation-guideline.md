# Form Implementation Guideline

The canonical rulebook for building **capture forms and dialogs** in this app. Every new form
(member capture, payment, offer, settings, …) must follow it. It is the forms companion to the
table guide (`docs/table-ui-design-guide.md`) and the renderer architecture
(`docs/implementation-details/architecture.md`).

## Stack

- **State:** TanStack Form v1 (`@tanstack/react-form`) — one `useForm`, no local form state.
- **Data:** TanStack Query — dialogs get their vocabulary (sources, stages, plans, …) from
  `queryOptions` read models, never from props drilling.
- **Controls:** shadcn/ui primitives (`Input`, `Select`, `Textarea`, `Dialog`, `Button`), the
  shared `FormField` (`components/ui/form-field.tsx`) and `Field` (`components/ui/field.tsx`),
  `LoadingButton` for submit, `FieldGroup` for sections.

## The reactive evaluation rule

A field is *evaluated* (error shown, `aria-invalid` set) when **any** of:

1. it has been **touched** (blurred / interacted),
2. the form has been **submitted**, or
3. its `completeWhen(value)` predicate flips **true** (e.g. a 10-digit mobile number).

An external `extraError` (async / server error) is always treated as invalid, regardless of
state. `role="alert"` renders the message; controls style themselves from
`aria-invalid` / `data-valid` (red / green + success icon).

## Must-dos

- **One field = one `form.Field`** with a pure `validators={{ onChange: … }}` function that
  returns an error string or `undefined`. Derive `completeWhen` for live feedback.
- **Submit gating:** `LoadingButton disabled={!canSubmit || <precondition>}`. `canSubmit` alone
  is not enough when a dependent value only exists after an async load (e.g. the source
  dropdown): keep an explicit guard until that value is actually present.
- **Default-valued selects:** seed the value only after its `queryOptions` data loads and the
  value is still empty. Prefer seeding **into `defaultValues`** (the field is then visible on the
  very first paint when the vocabulary is already cached) with a `useEffect` fallback for the
  cold path; both guards keep a real user pick. Because dialogs are **remounted per open**, the
  seed runs fresh every time — no `open`-reset effect needed.
- **Radix Select guard:** Radix fires `onValueChange('')` once on mount when the initial value
  is `''` and items arrive later. Guard every Radix select feeding an id field:
  `if (v !== '') field.handleChange(Number(v))`.
- **Label-row slot:** a live counter/status that belongs next to the label (e.g. the phone
  "digits remaining") goes in the `labelEnd` prop — `Field` renders it right-aligned on the
  label row, opposite the label — not inside the input.
- **Immediate feedback for typed numeric fields:** judge the first digit as soon as it is typed
  (before length checks) so the user learns the format instantly; show a live digit counter and
  cap the input length.
- **Two-column layout** for short fields: group related fields (phone + email, plan + goal) in a
  `grid gap-3 sm:grid-cols-2`; keep section gaps at `gap-3` via `FieldGroup`. Give fields
  `min-w-0` so grid cells never overflow.
- **Separate validation from the value:** phone parsing/formatting lives in the shared domain
  (`src/main/domain/phone.ts`); the renderer mirrors the same rules for live evaluation
  (`src/renderer/src/lib/validation.ts`). Keep the two in sync — the test suites on both sides
  assert the same table of cases.
- **Accessibility:** every control gets a real `<label for>` via `FormField`, an
  `id`-linked hint/error (`aria-describedby`), `role="alert"` on errors, and a disabled submit
  until the form is valid.

## Indian phone rule (shared)

Accepted values for the phone field (mirrored in `phone.ts` and `validation.ts`):

- **Mobile:** 10 digits starting **6–9**, optionally prefixed `+91` / `0091` / `91` / `0`.
  Stored as the bare 10-digit number (the identity key).
- **Landline:** an STD-prefixed number (`0` + 9–10 digits, e.g. `0221234567`) or a 10-digit
  local starting **2** (e.g. `2212345678`). Stored as entered.

Wrong starting digit → immediate error: `Start with 6-9 (mobile) or 0/2 (landline)`.
The country-code prefix must stay **inside** the anchored regex
(`^(?:\+91|0091|91|0)?([6-9][0-9]{9})$`) so a `91…` mobile is never misread as `91` + 8 digits.

## Performance

- Dialogs that pull heavy module graphs (leads dialogs, pickers) are **`React.lazy` +
  `<Suspense fallback={null}>`** and only mount when opened, so the page's initial render pays
  no cost for them (this halved cold-lead-dialog RAM pressure).
- Vocabulary queries use a **standalone cache key** and long `staleTime` so list mutations don't
  refetch them.
- Mutations invalidate the minimal query keys, and read models are shared via the query cache
  (detail pages read from the list cache).

## Acceptance checklist

- [ ] Built with `useForm` + `form.Field`; no local `useState` for field values.
- [ ] Every field has label + `aria-describedby` hint/error and `role="alert"` on errors.
- [ ] Live evaluation on touch / submit / complete; wrong first digit errors immediately.
- [ ] Submit disabled until valid (including the async-precondition guard).
- [ ] Radix selects guard the `''` mount event (`if (v !== '') field.handleChange(Number(v))`).
- [ ] Live counters/status render via the `labelEnd` label-row slot, not inside the input.
- [ ] Values parsed/normalized on the backend by the shared domain; renderer rules mirrored.
- [ ] Two-column short-field rows, `gap-3` sections, `min-w-0` grid children.
- [ ] Unit tests for validation rules + component tests for gating/errors/payload
      (`npm test`); `typecheck` and `lint` clean.
- [ ] Dialog lazily loaded and remounted per open (fresh state, no stale values).
