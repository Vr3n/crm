# Renderer Major→Minor Units Refactor

> **Status:** Plan complete; decisions D1 and D2 locked; ready for execution
> **Prerequisite:** `refactor/currency-aware-money` branch (shared module + contracts already merged)
> **Scope:** Eliminate all legacy major-unit formatters, convert all renderer types to minor units, thread currency everywhere, unify currency list

---

## 0. Resolved decisions

**D1 — AED/SGD in shared currency list.** ✅ Resolved: **Add AED + SGD to shared.**
- Append `AED` (exp=2) and `SGD` (exp=2) to `CURRENCIES` and `EXPONENTS` → 16 codes.
- `identity/constants.ts` re-exports shared `CURRENCIES` (delete local array).
- No org-edit option lost.

**D2 — Export money values.** ✅ Resolved: **Export converts minor→major.**
- `ExportTableInput` gains `currency: CurrencyCode`.
- Renderer passes **minor ints** in all money columns.
- `export.ts` converts minor→major numeric via `exponentFor(currency)` before writing to the cell.
- Uses a `currency→symbol` map for the `numFmt` string (replacing `MONEY_FORMAT = '₹#,##0.00'`).

---

## 1. Critical correction: main-process read models

**Live bug found:** `getAllPayments`/`getAllRefunds`/`getAllCredits` in `main/application/finance.ts` return `amount: formatMinor(p.amountMinor, 'INR')` — a **formatted string** like `"₹1,180.00"` — while renderer types declare `amount: number`. This is a type/behavior inconsistency, and violates "minor units end-to-end."

The original plan's step 7 framed these as "thread org currency instead of 'INR'". **Wrong framing:** these must stop formatting entirely and ship raw integer `amountMinor`, exactly like `getOutstandingInvoices` already ships `totalMinor`/`paidMinor`.

Affected lines in `main/application/finance.ts`:
- `:745` — `amount: formatMinor(p.amountMinor, 'INR')` → `amountMinor: p.amountMinor`
- `:753` — `amount: formatMinor(a.amountMinor, 'INR')` → `amountMinor: a.amountMinor`
- `:825` — same pattern for refunds
- `:896` — same pattern for credits
- `:901` — same pattern for credit applications

After fix: `finance/types.ts` `Payment.amount` → `amountMinor: number` (integer), and `finance/api.ts` passes it through without any conversion.

---

## 2. Shared library — add `percentToBps` + AED/SGD

`src/shared/contracts/money.ts`:
- Add `percentToBps(percent: number): number` = `Math.round(percent * 100)` (inverse of `formatRate`; accepts decimal percent → integer bps).
- This consolidates scattered `Math.round(x * 100)` calls in `new-invoice-dialog.tsx:398`, `catalog/mappers.ts:35`, and any future bps conversion.
- Append `'AED'` and `'SGD'` to `CURRENCIES` array. Add `AED: 2, SGD: 2` to `EXPONENTS`.

---

## 3. Renderer lib — delete legacy wrappers

`src/renderer/src/lib/money.ts`: delete everything except:
- Re-export all of `@shared/contracts/money` (no currency default anywhere).
- `sanitizeMoneyInput` (input sanitizer, not a formatter — stays local).

**Delete:** `formatMoney`, `formatMoneyExact`, `rupeesToMinor`, and the INR-defaulting `formatMinor` wrapper.

---

## 4. Delete `formatMoney` re-export from three format shims

Keep their non-money helpers; drop only the re-export line:

| File | Line | Delete | Keep |
|---|---|---|---|
| `features/catalog/format.ts` | `:1` `export { formatMoney } from '@/lib/money'` | formatMoney | `formatDate`, `formatPercent`, `todayIso` |
| `features/customers/format.ts` | `:3` `export { formatMoney } from '@/lib/money'` | formatMoney | `formatShortDate`, `formatMonthYear`, `daysUntil`, `monthsSince` |
| `features/dashboard/format.ts` | `:3` `export { formatMoney } from '@/lib/money'` | formatMoney | `daysUntil`, `daysSince` |

---

## 5. Types → integer minor units (exhaustive)

Every `number` monetary field becomes `*Minor: number` (integer). Tax/discount rates become `taxRateBps: number` (integer).

### `src/renderer/src/features/finance/types.ts`

| Interface | Field | Change |
|---|---|---|
| `Payment` | `amount` | → `amountMinor: number` |
| `PaymentAllocation` | `amount` | → `amountMinor: number` |
| `Refund` | `amount` | → `amountMinor: number` |
| `Credit` | `amount` | → `amountMinor: number` |
| `CreditApplication` | `amount` | → `amountMinor: number` |
| `FinanceInvoice` | `total` | → `totalMinor: number` |
| `FinanceInvoice` | `paid` | → `paidMinor: number` |

### `src/renderer/src/features/dashboard/types.ts`

| Interface | Fields |
|---|---|
| `DashboardSummary` | `amountDue` → `amountDueMinor`, `total` → `totalMinor` |
| `NewMember` | `amount` → `amountMinor` |

### `src/renderer/src/features/collections/types.ts`

| Interface | Fields |
|---|---|
| `CollectionRow` | `amount` → `amountMinor`, `total` → `totalMinor` |

### `src/renderer/src/features/catalog/types.ts`

| Interface | Fields |
|---|---|
| `Plan` | `basePrice` → `basePriceMinor`, `registrationFee` → `registrationFeeMinor`, `taxRate` → `taxRateBps` |
| `Offer` | `minPurchase` → `minPurchaseMinor`, value for `FIXED_AMOUNT`/`OVERRIDE_PRICE` → minor (`PERCENTAGE`/`FREE_PERIOD` stay whole) |
| Plan/Offer version | `basePrice`/`fee` → `*Minor` |

### `src/renderer/src/features/customers/types.ts`

| Interface | Fields |
|---|---|
| `Membership` | `price` → `priceMinor`, `discount` → `discountMinor`, `registrationFee` → `registrationFeeMinor` |
| `MembershipFreeze` | `fee` → `feeMinor` |
| `CustomerInvoice` | `subtotal` → `subtotalMinor`, `tax` → `taxMinor`, `total` → `totalMinor`, `paidAmount` → `paidAmountMinor`, `outstanding` → `outstandingMinor` |

### `src/renderer/src/features/memberships/types.ts`

| Interface | Fields |
|---|---|
| `MembershipRow` | `price` → `priceMinor`, `discount` → `discountMinor`, `registrationFee` → `registrationFeeMinor` |

---

## 6. API / mapper layer — drop `minorToMajor` round-trips

Stop converting minor→major before types. Pass `*Minor` through.

### `src/renderer/src/features/finance/api.ts`

- Delete `minorToMajor` import.
- `:52` — `total: Number(minorToMajor(p.totalMinor, ...))` → `totalMinor: p.totalMinor`
- `:53` — `paid: Number(minorToMajor(p.paidMinor, ...))` → `paidMinor: p.paidMinor`
- `:89` — `amount: input.amountMinor` (already minor, stop converting)
- `:97` — `amount: a.amount` → `amountMinor: a.amountMinor`

### `src/renderer/src/features/dashboard/api.ts`

- `:22,23,34,45,46` — pass `*Minor` fields directly.

### `src/renderer/src/features/collections/api.ts`

- `:10,17` — pass `*Minor`.

### `src/renderer/src/features/catalog/mappers.ts`

- `:34,35` — delete local `bpsToPercent` and `percentToBps` (use shared `formatRate` and `percentToBps`).
- `:51,57,89,101,137,162` — pass `*Minor` fields.

### `src/renderer/src/features/customers/api.ts` and `memberships/api.ts`

- Same treatment: locate all `minorToMajor` round-trips, remove them, pass `*Minor` through.

---

## 7. Main-process — ship minor ints (critical fix)

### `src/main/application/finance.ts`

| Line | Current | Fix |
|---|---|---|
| `:745` | `amount: formatMinor(p.amountMinor, 'INR')` | `amountMinor: p.amountMinor` |
| `:753` | `amount: formatMinor(a.amountMinor, 'INR')` | `amountMinor: a.amountMinor` |
| `:825` | (refund amount, same pattern) | `amountMinor: r.amountMinor` |
| `:896` | (credit amount, same pattern) | `amountMinor: c.amountMinor` |
| `:901` | (credit application amount, same pattern) | `amountMinor: a.amountMinor` |

Remove the now-unused `formatMinor` import if no other usage remains in that file.

### `src/main/application/memberships.ts`

- `:100,168` — keep `formatMinor` (error messages are legitimately formatted), but thread org currency (look up org → `currency`, or accept it in the command context).

### `src/main/application/pdf.ts`

- `:172` — `Math.round(l.taxRateBps / 100)` → `formatRate(l.taxRateBps)` (use shared `formatRate` for display).

### `src/main/application/export.ts`

- Delete `MONEY_FORMAT = '₹#,##0.00'` constant at `:49`.
- Add `CURRENCY_FORMATS: Record<CurrencyCode, string>` map:
  ```ts
  const CURRENCY_FORMATS: Record<CurrencyCode, string> = {
    INR: '₹#,##0.00', USD: '$#,##0.00', EUR: '€#,##0.00', GBP: '£#,##0.00',
    JPY: '¥#,##0', KRW: '₩#,##0', VND: '₫#,##0', CLP: '$#,##0',
    ISK: 'kr#,##0', KWD: 'د.ك#,##0.000', BHD: 'د.ب#,##0.000',
    OMR: 'ر.ع#,##0.000', JOD: 'د.ا#,##0.000', TND: 'د.ت#,##0.000',
    AED: 'د.إ#,##0.00', SGD: 'S$#,##0.00'
  }
  ```
- `ExportTableInput` interface: add `currency: CurrencyCode`.
- In the data row loop (`:117-119`), when `col.format === 'money'`:
  - Receive `raw` as a **minor int** (integer).
  - Convert: `const major = raw / Math.pow(10, exponentFor(currency))`.
  - Write `major` to the cell (numeric, not string).
- In cell styling (`:131-132`): `cell.numFmt = CURRENCY_FORMATS[input.currency]`.
- All callers of `exportTableToExcel` must pass `currency` and ensure money columns contain minor ints.

---

## 8. Component / dialog sweep (exhaustive)

Every site below switches from a legacy formatter to `formatMinor(v, currency)` / `parseToMinor(s, currency)` / `formatRate(bps)` / `percentToBps`, threading `useCurrency()`.

### Finance components (import `formatMoney`/`formatMoneyExact`)

| File | Action |
|---|---|
| `finance/components/payments-table.tsx` | `formatMoney(p.amount)` → `formatMinor(p.amountMinor, currency)` |
| `finance/components/credits-table.tsx` | same pattern |
| `finance/components/refunds-table.tsx` | same pattern |
| `finance/components/receivables-table.tsx` | same pattern (incl. `invoiceDue`) |
| `finance/components/payments-metrics.tsx` | same |
| `finance/components/refunds-metrics.tsx` | same |
| `finance/components/reports-metrics.tsx` | same |
| `finance/components/method-share-card.tsx` | same |
| `finance/components/revenue-breakdown-card.tsx` | same |
| `finance/components/collection-report-card.tsx` | same |
| `finance/components/credit-detail-sheet.tsx` | same |
| `finance/components/refund-detail-sheet.tsx` | same |
| `finance/components/payment-detail-sheet.tsx` | same |
| `finance/components/allocation-section.tsx` | `formatMoneyExact(v)` → `formatMinor(v, currency)` |
| `finance/components/issue-refund-dialog.tsx` | `:153,155,207,236` — `formatMoneyExact(v)` → `formatMinor(v, currency)` |

### Finance dialogs (parse side)

| File | Line | Current | Fix |
|---|---|---|---|
| `finance/components/record-payment-dialog.tsx` | `:92,98` | `parseToMinor(String(...), 'INR')` | `parseToMinor(String(...), currency)` |
| `finance/components/add-credit-dialog.tsx` | `:49` | `parseToMinor(String(...), 'INR')` | `parseToMinor(String(...), currency)` |
| `finance/components/issue-refund-dialog.tsx` | `:78` | `parseToMinor(String(...), 'INR')` | `parseToMinor(String(...), currency)` |

### Catalog components

| File | Action |
|---|---|
| `catalog/components/plan-table.tsx` | `formatMoney(p.basePrice)` → `formatMinor(p.basePriceMinor, currency)` |
| `catalog/components/plan-versions-dialog.tsx` | same |
| `catalog/components/plan-price-timeline.tsx` | same |
| `catalog/components/plan-metrics.tsx` | same |
| `catalog/components/offer-form-dialog.tsx` | same |
| `catalog/pricing.ts` | add `currency` param to `computeDiscountLine` / note builders; `formatMoney(...)` → `formatMinor(..., currency)` |

### Customers components

| File | Action |
|---|---|
| `customers/components/detail/invoice-overview-card.tsx` | `formatMoney(...)` → `formatMinor(..., currency)` |
| `customers/components/detail/current-membership-card.tsx` | same |
| `customers/components/detail/membership-history.tsx` | same |
| `customers/components/detail/membership-overview-card.tsx` | same |
| `customers/components/detail/quick-stats-card.tsx` | same |
| `customers/components/detail/lifetime-card.tsx` | `:55` inline `Intl.NumberFormat` → `formatMinor(membership.priceMinor, currency)` |

### Collections components

| File | Action |
|---|---|
| `collections/components/collections-table.tsx` | same |
| `collections/components/collection-summary.tsx` | same |
| `collections/components/payment-details-sheet.tsx` | same |

### Dashboard components

| File | Action |
|---|---|
| `dashboard/components/member-details-sheet.tsx` | same |
| `dashboard/*` | any other `formatMoney` users (grep for complete list) |

### Memberships

| File | Action |
|---|---|
| `memberships/components/membership-table.tsx` | `formatMoney(r.price)` → `formatMinor(r.priceMinor, currency)` |
| `memberships/sale/page.tsx` | `:181,196` preview math reworked in minor; `:334,342,347,634,637,643` → `formatMinor`/`minorToMajor`; `:334` inline `restrictToTwoDecimals` → `sanitizeMoneyInput` |
| `memberships/components/plan-picker.tsx` | `:81` → `formatMinor(plan.basePriceMinor, currency)` |
| `memberships/components/order-summary.tsx` | `:60,210` → `formatMinor`/`minorToMajor` |

### Invoices

| File | Action |
|---|---|
| `invoices/components/new-invoice-dialog.tsx` | `:352` `basePrice.toFixed(2)` → `minorToMajor(plan.basePriceMinor, currency)`; `:398` `Math.round(Number(value.taxRate) * 100)` → `percentToBps(Number(value.taxRate))`; `:449` ₹+toLocaleString → `formatMinor(basePriceMinor, currency)`; `:514,536` hardcoded `(₹)` labels → currency-aware |
| `invoices/components/invoice-details-sheet.tsx` | `:159` `taxRateBps/100` → `formatRate(taxRateBps)` |
| `invoices/InvoiceDetailPage.tsx` | `:135` same |

---

## 9. Currency list unification

- `src/shared/contracts/money.ts` exports `CURRENCIES` with AED + SGD (16 codes).
- `src/renderer/src/features/identity/constants.ts:27` — delete local `CURRENCIES` array, re-export shared: `export { CURRENCIES } from '@shared/contracts/money'`.

---

## 10. Tests

### `tests/shared/money.test.ts` — add

- `percentToBps` round-trip vs `formatRate`: `percentToBps(18.5) === 1850`, `formatRate(1850) === '18.5%'`
- `exponentFor('AED') === 2`, `exponentFor('SGD') === 2` (new codes).
- `parseToMinor('100.50', 'AED') === 10050`, `parseToMinor('100.50', 'SGD') === 10050` (round-trip for new codes).

### `tests/renderer/invoice-money.test.ts` — update

- Replace `rupeesToMinor` / `formatMoneyExact` references with `parseToMinor` / `formatMinor`.

### `tests/renderer/allocation-section.test.tsx` — update

- Switch fixtures to **minor** amounts.
- Update expected strings to `formatMinor(minor, currency)`.

### `tests/renderer/catalog-page.test.tsx` — update

- Re-check `toHaveValue('500')` / `toHaveValue(18)` after minor conversion.
- `toHaveValue(500)` → `toHaveValue('500')` (now `type="text"` input).

### `tests/main/application/export.test.ts` — update

- Money column fixtures pass minor ints.
- Expected cell values adjusted for minor→major conversion via `exponentFor`.
- Add test for AED/SGD currency export.

### General sweep

- Grep all renderer tests for `toHaveValue(<number>)` on money fields; switch to `toHaveValue('string')` where inputs became `type="text"`.

---

## 11. Execution order

| Step | What | Why |
|---|---|---|
| 1 | Add `percentToBps` to shared `money.ts` (§2) | Foundation for bps conversion consolidation |
| 2 | Delete legacy wrappers from `lib/money.ts` (§3) | Breaks the old formatter |
| 3 | Delete `formatMoney` re-exports from format shims (§4) | Removes lingering aliases |
| 4 | Convert all renderer types to `*Minor` (§5) | Type-level contract change |
| 5 | Drop `minorToMajor` round-trips in api/mappers (§6) | Data flows minor through |
| 6 | Fix main read models — ship `amountMinor` ints (§7) | **The critical correctness fix** |
| 7 | Sweep all components/dialogs (§8) | Display + parse use new formatter |
| 8 | Unify currency list (§9) | Single `CURRENCIES` source |
| 9 | Update tests (§10) | Regression safety |
| 10 | `npm run typecheck && npm run test` | Verify clean |

After each step: `npm run typecheck && npm run test`. Expected: only the 2 pre-existing errors (`DataTablePaginationState`, unused `cn` in `revenue-breakdown-card.tsx`).

---

## 12. Post-refactor verification

- `grep -r 'formatMoney\|formatMoneyExact\|rupeesToMinor\|toRupees' src/renderer` returns 0 matches.
- `grep -r 'formatMinor.*INR' src/main` returns 0 matches (only error messages thread org currency).
- `grep -rn 'Math\.round.*\* 100\|Math\.round.*\/ 100' src/renderer` returns 0 matches (all bps conversions use shared helpers).
- `grep -rn '\.toFixed(2)' src/renderer/src/features` returns 0 matches on money fields.
- `grep -rn '₹' src/renderer/src/features` returns 0 matches (no hardcoded currency symbols in component labels).
- All `type="number"` money inputs use `type="text"` + `inputMode="decimal"` + `sanitizeMoneyInput`.
- No `number` type on any monetary field in any `types.ts` file without a `*Minor` suffix.
