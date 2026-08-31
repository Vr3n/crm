# Currency-Aware Money Handling

> **Issue:** [#97](https://github.com/Vr3n/crm/issues/97)  
> **Branch:** `refactor/currency-aware-money`  
> **Status:** Plan updated with five amendments; awaiting implementation  
> **Grilling session:** Completed; all decisions locked via grilling + domain research

---

## 1. Invariant

> **Every monetary quantity crossing an application boundary is a JS `number` that is
> an integer count of minor units paired with a `CurrencyCode`.** No float major unit,
> no decimal string, no formatted string becomes part of the domain model. Formatting
> happens only at the renderer edge via `formatMinor`.

## 2. Context

Money is stored as integer minor units, but conversion is hardcoded `100` across ~25 sites. Two live bugs:

1. `toRupees = Math.round(minor / 100)` **drops fractional minor units** — `toRupees(24525) === 245` instead of `245.25` (`src/shared/contracts/money.ts:22`).
2. `fromRupees = Math.round(rupees * 100)` hits the float trap — `fromRupees(1.005) === 100` because `1.005 * 100 === 100.49999999999999` (`src/shared/contracts/money.ts:25`).

Additionally, the invoice read model ships **whole-unit floats** (`z.number()`) via `toRupees`, while the finance read model ships **integer minor units** (`z.number().int()`) — a split-brain inconsistency (`src/shared/contracts/invoices.ts:28-32` vs `src/shared/contracts/finance.ts:16`). The renderer's `build.ts` recomputes subtotal/total from lines in floats (`src/renderer/src/features/invoices/build.ts:12-29`), contradicting the "no component does money arithmetic" design.

---

## 2. Research summary

### Tally ERP
- Fixed internal precision: amounts stored as integer × 10,000 (4 decimals, regardless of currency).
- Per-currency "Number of decimal places" configured in the Currency Master (paise = 2, Dinar = 3, Dong = 0).
- Display rounding applies the currency's decimal count at the edge.
- Does NOT use ISO 4217 exponent lookup; relies on user-configured currency master.

### Industry (Stripe, Modern Treasury, Dinero.js, Finexly)
- **Minor units + ISO 4217 exponent** is the universal standard. Never hardcode `100`.
- `Money = integer minor units + currency code`. Exponent is per-currency (INR=2, JPY=0, KWD=3).
- No floats cross any boundary. Decimal appears only at the rendering edge.
- `Intl.NumberFormat` knows each currency's exponent — feed it exact strings to avoid double round-trip.
- Dinero.js v2: `toDecimal` returns exact string; rounding modes: `halfEven`, `halfUp`, etc.; `bigint` backend available (but not IPC-serializable); 166 ISO 4217 currencies; `allocate` for largest-remainder distribution.

### Rounding (LegalClarity, Sovos/EN 16931, Simplicate, MoneyWorks, ATO GST)
- **Tax: half-up is legislated** (EN 16931, ATO GST Act, US "5/4 rule"). Invoice `taxTotal = Σ(rounded line taxes)`. Never re-round the total.
- **Invoices: round-away-from-zero** (Simplicate, MoneyWorks switched default from banker's). Invoices/VAT must match accounting records; banker's drift is unacceptable at invoice level.
- **General accounting: banker's (half-even)** is the IEEE 754 default; removes systematic upward bias over many rows.
- **Line-level vs document-level:** Some jurisdictions round per-line (taxable supply rule); some round the total (total invoice rule). Our system does line-level (half-up per line, sum lines to total). Correct for India GST.
- **Reconciliation technique (future need):** When rounded line taxes don't sum to the document-level rounded total, adjust the first line (Simplicate/MoneyWorks approach). Not needed now; note for multi-rate invoices later.

### JS specifics (Modern Treasury, Dinero.js)
- `number` is IEEE-754 double, safe to 2⁵³. For gym CRM amounts (well under ₹92 trillion), `number` is fine.
- `bigint` is NOT JSON-serializable — unusable across Electron IPC (contextBridge).
- Defend with `z.number().int().safe()` on inputs; document the 2⁵³ bound.

---

## 3. Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | All money read-models ship **integer minor units**; renderer formats | Consistent; matches finance.ts (already correct) |
| 2 | Ship totals from main; **delete** `features/invoices/build.ts` recompute | No renderer money arithmetic (EN 16931 total-chain) |
| 3 | Half-even only at input parse; **half-up for tax/discount** | Tax is legislated half-up (EN 16931 / ATO GST); invoices half-up; parse is low-stakes |
| 4 | Currency threaded from `Organization.currency` via context/hook | Single source; v1 is single-currency per Module 14 |
| 5 | Parse **rounds half-even** on excess decimals | Consistent default (IEEE 754); low-stakes; single `parseToMinor` |
| 6 | `exponentFor` **throws** on unknown code | Fail-fast; compile-time literal union catches most cases |
| 7 | Rates ship as **integer `taxRateBps`** | No percent floats; mirrors minor-unit rule |
| 8 | Scope **expands** to all money read-models + PDF | Consistency across the whole app |
| 9 | `discountValueMinor` overload → **separate follow-up** | Naming collision (paise vs percent) |
| 10 | **Hand-roll** the module (no Dinero.js) | Covers parse/format/exponent; zero new deps; matches build-size philosophy |
| 11 | Currency typed as a **literal union** for compile-time safety | Catches cross-currency mistakes at compile time |

---

## 4. Core module — `src/shared/contracts/money.ts`

### Types

```ts
export const CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'JPY', 'KRW', 'VND', 'CLP', 'ISK',
  'KWD', 'BHD', 'OMR', 'JOD', 'TND'
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]

const EXPONENTS: Record<CurrencyCode, number> = {
  INR: 2, USD: 2, EUR: 2, GBP: 2,                // 2-decimal currencies
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0,        // zero-decimal currencies
  KWD: 3, BHD: 3, OMR: 3, JOD: 3, TND: 3          // 3-decimal currencies
}

export interface Money {
  amount_minor: number   // integer minor units; zod: .int().safe()
  currency: CurrencyCode
}
```

### Functions

```ts
/**
 * Look up exponent (minor units per major unit) for a currency code.
 * This is a common subset of ISO 4217, not a complete implementation.
 * Unknown codes throw — fail-closed, not fallback-to-2.
 */
export function exponentFor(code: string): number {
  if (!(code in EXPONENTS)) throw new Error(`Unknown currency: ${code}`)
  return EXPONENTS[code as CurrencyCode]
}

/**
 * Exact minor → major conversion as a decimal string.
 * Pure digit-splitting, no floats.  "24525" + exp 2 → "245.25"
 */
export function minorToMajor(minor: number, code: CurrencyCode): string {
  const exp = EXPONENTS[code]
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(minor)
  const digits = String(abs)
  if (digits.length <= exp) return sign + '0.' + digits.padStart(exp, '0')
  return sign + digits.slice(0, -exp) + '.' + digits.slice(-exp)
}

/**
 * Parse a currency decimal string → integer minor units.
 * Half-even rounding on excess digits (string-based, no IEEE-754 conversion).
 * Rejects negative and `+`-prefixed inputs (nonnegative invariant).
 * Returns undefined on invalid input.
 */
export function parseToMinor(input: string, code: CurrencyCode): number | undefined {
  const GLYPHS = /[\s,₹$€£¥]/g
  const cleaned = input.replace(GLYPHS, '')
  if (cleaned === '' || cleaned.startsWith('-') || cleaned.startsWith('+')) return undefined

  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned)
  if (!match) return undefined

  const whole = match[1]
  const frac  = match[2] ?? ''
  const exp   = EXPONENTS[code as CurrencyCode]

  if (frac.length <= exp) {
    const minor = Number(whole + frac.padEnd(exp, '0'))
    return Number.isSafeInteger(minor) ? minor : undefined
  }

  // Round excess fractional digits half-even on the full digit string.
  const digits = whole + frac
  const scale  = frac.length - exp
  const kept   = digits.slice(0, -scale)
  const excess = digits.slice(-scale)
  const half   = '5' + '0'.repeat(scale - 1)
  const up =
    excess > half ? true
    : excess < half ? false
    : Number(kept[kept.length - 1]) % 2 === 1

  const keptNum = Number(kept) + (up ? 1 : 0)
  if (String(keptNum).length > exp) {
    const newWhole = String(Number(whole) + 1)
    const minor = Number(newWhole + '0'.repeat(exp))
    return Number.isSafeInteger(minor) ? minor : undefined
  }

  const result = String(keptNum).padStart(exp, '0')
  const minor = Number(whole + result)
  return Number.isSafeInteger(minor) ? minor : undefined
}

/**
 * Format minor units for display using Intl.NumberFormat (exact string).
 *
 * Runtime assumption: `Intl.NumberFormat.format(decimalString)` on V8/ICU 78
 * (Electron 43 / Node 25) preserves exact decimal digits when the input is a
 * stringified decimal — it does NOT round-trip through the IEEE-754 double.
 * This is pinned by a regression test near 2^53. Not a general JS guarantee.
 */
export function formatMinor(minor: number, code: CurrencyCode, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code
  }).format(Number(minorToMajor(minor, code)))
}

/** Format basis points as a percent string (e.g. "18%"). */
export function formatRate(bps: number): string {
  return `${Math.round(bps) / 100}%`
}
```

### Zod schemas (update `moneySchema`)

```ts
export const currencyCodeSchema = z.enum(CURRENCIES)

export const moneySchema = z.object({
  amount_minor: z.number().int().safe(),
  currency: currencyCodeSchema
})
```

---

## 5. Change inventory

### Main process

| File | Change |
|---|---|
| `src/main/ipc/invoices.ts` | Drop `toRupees`; ship `unitPriceMinor`, `discountMinor`, `taxAmountMinor`, `lineTotalMinor`, `subtotalMinor`, `taxTotalMinor`, `totalMinor`, `paidMinor`, `outstandingMinor` (all `z.number().int()`). Remove `buildInvoiceOutput` conversion. |
| `src/main/ipc/dashboard.ts` | Drop `Math.round(.../100)` at lines 270, 290, 343, 363; ship minor ints. |
| `src/main/ipc/collections.ts` | Drop `Math.round(.../100)` at lines 137, 143, 210, 216; ship minor ints. |
| `src/main/ipc/customers.ts` | Drop `toRupees` at lines 140-199; ship minor ints. |
| `src/main/application/finance.ts` | Drop `toRupees` at lines 745-901; error messages via `formatMinor`. |
| `src/main/application/memberships.ts` | Drop `/ 100` error messages at lines 99, 167; use `formatMinor`. Tax math (`Math.round(... / 10000)`) stays half-up — no change. |
| `src/main/pdf/templates/shared.ts` | `formatRupees` → currency-aware: accepts `(amountMinor, currency)`, uses `formatMinor`. |
| `src/main/domain/pricing.ts` | No change (tax/discount stay half-up). Documented `Math.round` is correct. |

### Contracts

| File | Change |
|---|---|
| `src/shared/contracts/invoices.ts` | `unitPrice: number` → `unitPriceMinor: z.number().int()`; `discountAmount` → `discountMinor`; `taxAmount` → `taxAmountMinor`; `lineTotal` → `lineTotalMinor`; `taxRate: number` → `taxRateBps: z.number().int()`; `subtotal/total/paidAmount/outstanding` → `*Minor: z.number().int()` |
| `src/shared/contracts/money.ts` | Full rewrite (see §4 above) |
| `src/shared/contracts/identity.ts` | `currency: z.string()` → `currency: currencyCodeSchema` |
| Dashboard/collections/customers contracts | `amount: number` → `amountMinor: z.number().int()` (corresponding fields) |

### Renderer

| File | Change |
|---|---|
| `src/renderer/src/lib/money.ts` | Rewrite: `formatMoney`/`formatMinor`/`rupeesToMinor` → currency-aware using `formatMinor`/`parseToMinor` from shared module. Drop hardcoded `'INR'`. |
| `src/renderer/src/features/invoices/types.ts` | `unitPrice: number` → `unitPriceMinor: number`; `taxRate: number` → `taxRateBps: number`; all `*Amount` fields → `*Minor: number`; `subtotal/total/paidAmount/outstanding` → `*Minor: number` |
| `src/renderer/src/features/invoices/build.ts` | **Delete** `grossLine`, `buildInvoice` recompute. Totals now shipped from main. |
| `src/renderer/src/features/catalog/mappers.ts` | `toRupees`/`fromRupees` → `minorToMajor`/`parseToMinor` (minor↔major via strings, not `*100`/`/100`). |
| `src/renderer/src/features/memberships/sale/page.tsx` | `Math.round(... * 100)` → `parseToMinor`; `Math.round(... / 100)` → `formatMinor`. |
| `src/renderer/src/features/finance/components/issue-refund-dialog.tsx` | `Math.round(Number(value.amount) * 100)` → `parseToMinor`. |
| `src/renderer/src/features/finance/components/record-payment-dialog.tsx` | `Math.round(... * 100)` → `parseToMinor`. |
| `src/renderer/src/features/finance/components/add-credit-dialog.tsx` | `Math.round(Number(value.amount) * 100)` → `parseToMinor`. |
| `src/renderer/src/features/customers/components/detail/lifetime-card.tsx` | Drop hardcoded `'INR'`; use `useCurrency()` hook. |
| `src/renderer/src/features/invoices/components/new-invoice-dialog.tsx` | `rupeesToMinor` → `parseToMinor`; `formatMinor` from shared; `taxRateBps / 100` → `formatRate(taxRateBps)`. |

### New (renderer)

| File | Purpose |
|---|---|
| `src/renderer/src/hooks/use-currency.tsx` | Hook reading `Organization.currency` from identity query. Single source of truth for renderer formatting. |

### Unchanged (no action)

| File | Reason |
|---|---|
| `src/main/domain/pricing.ts` | Tax (`Math.round(... / 10000)`) and % discount (`Math.round(... / 100)`) stay half-up — legislated. |
| `src/main/application/billing.ts` | Tax per-line computation stays half-up. |
| `src/main/domain/identity.ts` | `currency: string` (DB layer) — validated at contract boundary. |

---

## 6. Tests

### New: `tests/shared/money.test.ts`

**Conversion round-trips:**
- `minorToMajor(24500, 'INR') === '245'`
- `minorToMajor(24525, 'INR') === '245.25'` ← regression for minor-units-loss bug
- `minorToMajor(0, 'INR') === '0'`
- `minorToMajor(1234, 'JPY') === '1234'` (zero-decimal)
- `minorToMajor(1234, 'KWD') === '1.234'` (three-decimal)
- `minorToMajor(10050, 'EUR') === '100.50'`

**Parse half-even:**
- `parseToMinor('245', 'INR') === 24500`
- `parseToMinor('245.25', 'INR') === 24525`
- `parseToMinor('245.254', 'INR') === 24525` (below half, rounds down)
- `parseToMinor('245.255', 'INR') === 24525` (half-even: kept `2` even → rounds down)
- `parseToMinor('245.265', 'INR') === 24526` (half-even: kept `6` even → rounds down)
- `parseToMinor('245.275', 'INR') === 24528` (half-even: kept `7` odd → rounds up)
- `parseToMinor('1.005', 'INR') === 100` (half-even: kept `0` even → rounds down)
- `parseToMinor('245.995', 'INR') === 24600` (carry overflow)
- `parseToMinor('99.999', 'INR') === 10000` (carry overflow)
- `parseToMinor('', 'INR') === undefined`
- `parseToMinor('abc', 'INR') === undefined`
- `parseToMinor('₹19,200.50', 'INR') === 1920050` (currency glyphs stripped)

**Zero-decimal currencies (exp=0):**
- `parseToMinor('1500', 'JPY') === 1500` (exact)
- `parseToMinor('1500.4', 'JPY') === 1500` (below half)
- `parseToMinor('1500.5', 'JPY') === 1500` (half-even: `1500` last digit `0` even → down)
- `parseToMinor('1501.5', 'JPY') === 1502` (half-even: `1501` last digit `1` odd → up)

**Three-decimal currencies (exp=3):**
- `parseToMinor('1.234', 'KWD') === 1234` (exact)
- `parseToMinor('1.2345', 'KWD') === 1234` (half-even: kept `4` even → down)
- `parseToMinor('1.2355', 'KWD') === 1236` (half-even: kept `5` odd → up)

**Negative and `+` rejected (nonnegative invariant):**
- `parseToMinor('-1.00', 'INR') === undefined` (negative rejected)
- `parseToMinor(' -1.00 ', 'INR') === undefined` (whitespace + negative rejected)
- `parseToMinor('₹-1.00', 'INR') === undefined` (glyph + negative rejected)
- `parseToMinor('+1.00', 'INR') === undefined` (plus rejected)

**Exponent lookup:**
- `exponentFor('INR') === 2`
- `exponentFor('JPY') === 0`
- `exponentFor('KWD') === 3`
- `exponentFor('XXX')` throws

**Invariant:** `parseToMinor(minorToMajor(m, c), c) === m` for a sample of values × currencies.

**Format:** `formatMinor(24525, 'INR')` returns a string containing `245.25`.

**Runtime regression (V8/ICU):** `formatMinor(N, 'INR')` for a near-2⁵³ minor value returns the exact string representation — pinned by test, not a language guarantee.

### Updated existing tests

- `tests/main/pdf/templates.test.ts:142,297` — update expected from `paise / 100` to `formatMinor`.
- `tests/main/application/billing.test.ts` — minor changes where `toRupees` was used.
- Renderer money tests (`tests/renderer/invoice-money.test.ts`) — update for new contract shapes.
- Catalog mapper tests — update for `minorToMajor`/`parseToMinor`.

---

## 7. Docs

### `plans/CONTEXT.md` — add to Money section

```markdown
**Currency**:
An ISO 4217 code naming the unit of account (INR, USD, ...). Source of truth for the
minor-unit exponent. An Organization has one Currency.
_Avoid_: Symbol, "₹"

**Minor unit**:
The smallest unit of a Currency (paise, cent, fils). Money is stored and transmitted
as an integer count of minor units.
_Avoid_: cents, paise (as code terms)

**Exponent**:
How many minor units make one major unit (INR = 100, so exponent 2). Looked up per
Currency, never a literal constant.
_Avoid_: Scale, factor, "the 100"

**Major unit / display amount**:
The human-facing decimal quantity (₹245.25), produced only at the rendering edge from
minor units.
_Avoid_: Rupees (INR-specific), amount (untyped)

**Basis point (bps)**:
One hundredth of a percent, the integer form of a tax/discount rate. Not a currency.
_Avoid_: Percent (as a float)
```

### `docs/adr/0001-money-integer-minor-units.md`

> **Money is integer minor units with an ISO 4217 exponent; no floats cross any boundary.**
>
> Money crosses process boundaries and the read models as an integer count of a currency's
> minor units plus that currency code, and is converted to a display string only at the
> rendering edge. The minor/major ratio is an ISO 4217 exponent looked up per currency
> from a **deliberate common subset** (INR/USD=2, JPY=0, KWD=3); unknown codes throw
> (fail-closed, not fallback-to-2). This is not a complete ISO 4217 implementation.
>
> Input parsing rounds excess digits half-even; tax and percentage discounts keep half-up
> (legislated for GST/VAT). `formatMinor` feeds an exact decimal string to
> `Intl.NumberFormat` — this is a **runtime-tested assumption** pinned to Electron 43 /
> Node 25 (V8 + ICU 78), guarded by a near-2⁵³ regression test, not a general JS
> guarantee.
>
> This replaces an earlier convention where the invoice read model shipped whole-unit
> floats and the renderer recomputed totals.
>
> **Considered alternatives:** Decimal strings on the wire; half-even everywhere; hardcoded
> `100`. All rejected for the same reason: no float at any boundary, tax rounding must be
> half-up per legislation, and the exponent is not always 2.
>
> **Consequences:** All read-model contracts change from `number` to `int`; renderer types
> change correspondingly; `build.ts` recompute is deleted; currency threading needed via
> identity context.

### `docs/04-billing-and-invoicing.md` §34 — update

- Replace the "integer paise" example with currency-agnostic language referencing minor units and exponent.
- Add invariant: `subtotal === Σ(lineTotal)` and `total === subtotal + taxTotal`; never re-round totals.
- Note: when multi-rate invoices cause line-level rounding drift, adjust the first line to reconcile (not needed now; documented for future).

### Issue #97 — update body

- Remove "fallback 2" → throw on unknown
- Add expanded scope: dashboard/collections/customers/PDF read-models + renderer types + `taxRateBps`
- Add: delete `build.ts`, currency context/hook, literal-union type, safe-int bound
- Clarify: half-even is parse-only; tax/discount stay half-up

---

## 8. Follow-up issue (to file)

**Title:** `discountValueMinor` overloads percent vs minor units under one name

**Body:** `pricing.ts` uses `discountValueMinor` for both `PERCENTAGE` (whole percent 1–100) and `FIXED_AMOUNT`/`OVERRIDE_PRICE` (minor units). Rename (e.g. `discountValue` + type discriminator) once #97 lands.

---

## 9. Edge cases demonstrated

The following were validated in a live herdr pane using the current (buggy) `fromRupees`/`toRupees`:

| Input | `fromRupees` | `toRupees` | Bug? |
|---|---|---|---|
| `245` | `24500` | `245` | ✓ round-trip |
| `245.25` | `24525` | `245` | ✗ minor units dropped |
| `1.005` | `100` | `1` | ✗ float artifact (100.499...→100, not 100.5→101) |
| `245.255` | `24526` | `245` | ✗ excess precision silently rounded + minor units dropped |
| `0` | `0` | `0` | ✓ |

After fix, all five cases produce correct results (verified against the test expectations in §6).

---

## 10. Execution order

1. **Core module** — rewrite `src/shared/contracts/money.ts` (types + functions + zod).
2. **Contracts** — update `invoices.ts`, `identity.ts`, dashboard/collections/customers contracts.
3. **Main IPC** — update `invoices.ts`, `dashboard.ts`, `collections.ts`, `customers.ts`.
4. **Main application** — update `finance.ts`, `memberships.ts` error messages.
5. **PDF** — update `formatRupees` → `formatMinor`.
6. **Renderer money** — rewrite `lib/money.ts`; create `use-currency.tsx` hook.
7. **Renderer types** — update `invoices/types.ts`; delete `build.ts`.
8. **Renderer callers** — mappers, sale page, finance dialogs, lifetime card, invoice dialog.
9. **Tests** — new `tests/shared/money.test.ts`; update existing.
10. **Docs** — CONTEXT.md, ADR, `04-billing-and-invoicing.md`, issue #97 body update.
11. **File follow-up issue** — `discountValueMinor` overload.

Run `npm run typecheck && npm run test` after each step to catch regressions early.
