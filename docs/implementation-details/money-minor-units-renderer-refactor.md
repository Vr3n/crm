# Money Minor-Units Renderer Refactor

> Sub-issue: [#98](https://github.com/Vr3n/crm/issues/98) (of #97)
> Status: Implemented

Applies the currency-aware money library (`src/shared/contracts/money.ts`) end-to-end so that
every monetary quantity in the renderer is an integer count of minor units, formatted only at the
rendering edge via `formatMinor`, and parsed from staff-typed decimal strings via `parseToMinor`.
This removes the legacy major-unit (`formatMoney` / `formatMoneyExact` / `rupeesToMinor`) split-brain
and the hardcoded `'INR'` / `₹` / `*100` / `/100` conversions scattered across ~40 call sites.

## Locked decisions

- **D1** — `AED` and `SGD` (exponent 2) were added to the shared `CURRENCIES`/`EXPONENTS` (now 16
  codes). `identity/constants.ts` re-exports the shared list instead of keeping a divergent copy.
- **D2** — Excel export converts minor → major at the cell boundary via `exponentFor(currency)` and
  uses a `currency → numFmt` map; `ExportTableInput` now carries `currency`.

## What changed

### Shared library
- `src/shared/contracts/money.ts`: added `percentToBps(percent)` (inverse of `formatRate`) and the
  `AED`/`SGD` codes.

### Renderer money module
- `src/renderer/src/lib/money.ts`: deleted `formatMoney`, `formatMoneyExact`, `rupeesToMinor` and
  the INR-defaulting `formatMinor` wrapper. It now re-exports the shared module (no currency
  defaults) plus `sanitizeMoneyInput`.
- `catalog/format.ts`, `customers/format.ts`, `dashboard/format.ts`: dropped the `formatMoney`
  re-export.

### Types → integer minor units
Finance, dashboard, collections, catalog, customers, memberships types converted from major-float
fields to `*Minor` (e.g. `amount → amountMinor`, `basePrice → basePriceMinor`, `taxRate → taxRateBps`,
`subtotal → subtotalMinor`).

### API / mapper layer
`finance/api.ts`, `dashboard/api.ts`, `collections/api.ts`, `catalog/mappers.ts` stop calling
`Number(minorToMajor(...))` and pass `*Minor` fields through unchanged. `catalog/mappers.ts` dropped
its local `bpsToPercent`/`percentToBps` helpers.

### Main process
- `finance.ts`: `getAllPayments`/`getAllRefunds`/`getAllCredits` now ship raw `amountMinor` ints
  (previously shipped `formatMinor(..., 'INR')` strings while renderer types declared `number` — a
  live type/runtime mismatch).
- `memberships.ts`: error messages keep `formatMinor` but thread the org currency.
- `pdf.ts`: `taxRate` uses `formatRate(taxRateBps)`; `PdfInvoiceLine.taxRate` is now a string.
- `export.ts`: currency-aware `numFmt` + minor→major cell conversion; `ipc/export.ts` validates
  `currency`.

### Component/dialog sweep
All `formatMoney`/`formatMoneyExact` callers now use `formatMinor(valueMinor, currency)` with
`useCurrency()`. Finance dialogs (`record-payment`, `issue-refund`, `add-credit`) parse with
`parseToMinor(value, currency)` and work entirely in minor units. Catalog forms parse/format via
`parseToMinor`/`minorToMajor`/`percentToBps`. Memberships sale preview math was reworked to minor
units.

## Invariants verified

- `formatMoney` / `formatMoneyExact` / `rupeesToMinor` / `toRupees` → 0 references.
- `formatMinor(..., 'INR')` in `src/main` → 0 references.
- `.toFixed(2)` on money fields → 0 references.
- Hardcoded `₹` in feature components → 0 references.

## Tests

- `tests/shared/money.test.ts`: added `percentToBps`/`formatRate` and `AED`/`SGD` round-trip cases.
- `tests/renderer/invoice-money.test.ts`: `rupeesToMinor`/`formatMoneyExact` → `parseToMinor`/`formatMinor`.
- `tests/renderer/allocation-section.test.tsx`: fixtures in minor units; wraps in `QueryClientProvider`.
- `tests/renderer/catalog-page.test.tsx`: display strings updated to `formatMinor` output.
- `tests/main/application/export.test.ts`: money fixtures pass minor ints; added AED case.
- `tests/main/pdf/templates.test.ts`: `taxRate` fixture is now a formatted string.
