# AutocorrectCombobox — implementation details

Implementation of the reusable autocomplete + "create on the fly" combobox specified
in `docs/components/shadcn-autocomplete-create.md`. It adapts a TanStack Form field
(which owns the selected backend ID) to an async, TanStack Query-backed search with a
create mutation that auto-selects the returned ID.

## Files

- `src/renderer/src/components/autocorrect-combobox.tsx` — the component + exported types.
- `tests/renderer/autocorrect-combobox.test.tsx` — 15 tests (unit, jsdom, TanStack Query client).

## Public API

```ts
export type AutocorrectOption<TId extends string | number = string> = {
  id: TId
  label: string
  description?: string
}
export type SearchOptions<TId> = (query: string, signal?: AbortSignal) => Promise<AutocorrectOption<TId>[]>
export type CreateOption<TId> = (label: string, signal?: AbortSignal) => Promise<AutocorrectOption<TId>>
export interface AutocorrectFieldAdapter<TId> { name?; state.value; state.meta; handleChange; handleBlur }
```

Props: `field`, `search`, `create`, plus UI knobs (`label`, `description`, `placeholder`,
`searchPlaceholder`, `emptyMessage`, `minSearchLength` (default 2), `debounceMs` (default
300), `disabled`, `className`, `selectedOption`).

The field adapter is a **structural slice** of TanStack Form's `FieldApi` — plain `TId | null`
for `state.value` and `handleChange(value: TId | null)`. That keeps the combobox decoupled
from react-form while remaining a drop-in for any `FieldApi` (the `handleChange` signature is
structurally compatible with react-form's `Updater<TData>`).

## Ownership split

| Concern | Owner |
| --- | --- |
| Selected backend ID, validation, blur | TanStack Form field (via `field.handleChange` / `field.handleBlur`) |
| Async search + create, caching, invalidation | TanStack Query |
| Open state, search text, transient display label, highlight | Component-local state |

Transient UI state is `open`, `query`, `activeValue`/`navigatedQuery` (the cmdk highlight),
`cachedSelected` (display label when `selectedOption` isn't supplied), and `createError`.

## Data flow

- **Search**: `useQuery({ queryKey: ['autocorrect-options', debouncedQuery] })`, enabled only
  while `open && !disabled && searchable` (`debouncedQuery.length >= minSearchLength`). Debounce
  uses the existing `useDebouncedValue` hook (default 300 ms). `staleTime: 30_000` keeps recent
  queries cached; `placeholderData: keepPreviousData` keeps the previous results visible (dimmed,
  `opacity-60`) while the next query resolves, so the list never flashes empty.
- **Create**: `useMutation`. On success: cache the returned option for the display label,
  `field.handleChange(createdOption.id)`, close the popover, and
  `invalidateQueries({ queryKey: ['autocorrect-options'] })` so the created value appears in
  later searches. On failure: keep popover and query intact, show `CREATE_ERROR` inline.
- **Select existing**: `field.handleChange(option.id)` + close + blur. No Query round-trip.

## Highlight / Enter semantics (the tricky part)

cmdk only auto-highlights the first item through a **multi-item registration race**: when the
second `CommandItem` registers, cmdk re-runs its "select first item" pass — but by then the
first item's `data-value` is set. With a single result nothing is ever highlighted, so Enter
(which selects `[aria-selected="true"]`) would silently do nothing.

Instead of relying on that race, the component **derives the highlight** — no state-updating
effects:

- `autoHighlight` = first result's id, but only when `querySettled` (debounced query equals the
  trimmed query) and the data is **not** `placeholderData` (old results for a newer query must
  not be highlighted).
- User arrow navigation (cmdk `onValueChange`) records `activeValue` + the `debouncedQuery` it
  happened in (`navigatedQuery`).
- `effectiveValue = activeValue !== null && navigatedQuery === debouncedQuery ? activeValue : autoHighlight`.

So a new query always re-highlights its own first result; navigation sticks only while the query
doesn't change; typing clears navigation. The "+ Add" option is deliberately **never** in the
auto-highlight path (it isn't a result), so Enter can't create accidentally — creating always
requires a click or ArrowDown + Enter.

`Command` gets `value={effectiveValue}` / `onValueChange` and `shouldFilter={false}` (the app
does the filtering server-side; this also makes `CommandEmpty` render only when zero items are
mounted). Both `value` and `onValueChange` are wired to the same derived state, so there's no
controlled/uncontrolled warning and no feedback loop (cmdk's controlled-value sync does not
re-emit `onValueChange`).

## A11y & form integration

- Trigger is a `Button` with `role="combobox"`, `aria-expanded`, `aria-controls` (the Command id),
  `aria-invalid`, and `aria-describedby` pointing at the Field's error/hint ids.
- `Command` gets an accessible `label` (falls back to "Search options") via the shadcn Command
  wrapper; `CommandInput` is `autoFocus` on open.
- A visually-hidden `aria-live="polite"` region announces "Searching for …" / "Adding …" status.
- Error state mirrors the app's form conventions (`Field`, red border + `aria-invalid`, inline
  `role="alert"` messages with a **Retry** button for search failures).
- A ghost "Clear selection" button (absolute, top-right) is shown only when a value is selected;
  it calls `field.handleChange(null)`.

## Test strategy

15 tests over the shipped behavior — no test ever submits the harness `<form>`, so Enter-not-
submitting is asserted explicitly:

- no search while closed; debounce collapses keystrokes to one query; nothing below
  `minSearchLength` (with the hint text shown).
- loading state + status announcement; single-result **auto-highlight so Enter selects**.
- selecting an existing option stores **only its ID** (never the label) in the field.
- add option: create mutation called with the trimmed query, created ID stored, popover closed,
  `autocorrect-options` cache invalidated; failure keeps popover + query and shows the error.
- exact-match hides the add option (case-insensitive).
- search error renders `role="alert"` + retry re-queries; create error uses a distinct message.
- blur validation: the harness's required validator (`value ? [] : ['Please select a customer.']`)
  surfaces via `aria-invalid` + the Field error.
- arrow-key navigation (ArrowDown × 2 + Enter selects the third result), clear button, no
  duplicate pending creates while `isPending`.

`tests/renderer/setup.ts` provides `renderWithClient` (QueryClient + user-event + Radix
popover-friendly jsdom stubs). Harness passes `debounceMs={0}` except in the debounce test.

## Verification

```bash
npx vitest run --project components tests/renderer/autocorrect-combobox.test.tsx   # 15/15
npm run typecheck      # clean (node + web)
npx eslint src/renderer/src/components/autocorrect-combobox.tsx tests/renderer/autocorrect-combobox.test.tsx  # clean
npm test               # full suite green
```

## Known gaps

- No demo page / route wiring (explicitly deferred).
- `cachedSelected` keeps only the most recently selected option in state; edit forms should pass
  `selectedOption` to avoid a flash before the real option loads.
- Creates don't show an in-flight spinner on the add item; the button is merely disabled while
  `createMutation.isPending` (with the `aria-live` announcement).