# 03 — Offer & Pricing Engine

## 3.1 — Offer section — filtered, editable discount

### Why AutocorrectCombobox again

Same rationale as Lead/Plan (02). `Q12`: "Filter offers whose `applicable_plan_ids` contains the chosen plan. Yes, show validation error if Offer doesn't apply." The Offer picker's dataset is naturally filtered by the already-chosen Plan, so a combobox that re-queries when `planId` changes is the simplest fit.

### Behaviour

- **Query**: `catalog:searchOffers` — `(organization_id=? AND active=1 AND (applicable_plan_ids='[]' OR JSON_CONTAINS(applicable_plan_ids, planId))) AND name LIKE %q% AND date(valid_from)<=date('now') AND (valid_to IS NULL OR date(valid_to)>=date('now'))` order `name`, limit 20. Cache key `['autocorrect-options','offer', {planId, query}]` — planId in key so switching plans busts the offer cache.
- **Row display**: `20% · valid Jan 1–31 · 47/100 used · Fixed amount` (type pill + `max_usage`/redemptions remaining from `offerRedemptions` count).
- **On select, reveal two linked fields** (per `Q4` "auto fill the Discount type and Discount Value inputs"):

  ```
  [Discount Type ▾] [Discount Value __ ]   → live labelEnd "20% → ₹1,000"
  ```

  * `discount_type` `Select`: `PERCENTAGE | FIXED_AMOUNT | OVERRIDE_PRICE | FREE_PERIOD` (from `catalog.ts:108`).
  * `discount_value` `Input` (unit-annotated: `%` / `₹` / `₹ override` / `months`).
  * Both editable; changing either recomputes `discountAmountRupees` (see §3.2). If the user edits `discountAmountRupees` directly, the type/value pair flips to "Custom" state (segments unselected, hint "Overridden").

- **Discount math (single pure function, shared preview + backend validation)**

  Given `baseRupees` (already formatted ₹) → convert to paise for math, then format back:

  ```
  PERCENTAGE:     discount = base * value/100           (value 0..100, may be 20 → 20%)
  FIXED_AMOUNT:   discount = value                       (₹ value)
  OVERRIDE_PRICE: discount = max(0, base - value)        (value is final price in ₹)
  FREE_PERIOD:    discount = 0; endDate += months*30     (value is months int)
  final = max(0, base - discount)   // clamp; validation flags if discount>base
  ```

  Monotonic reasoning from `docs/03-catalog-and-offers.md:74-82` + `catalog.ts:98-110` (`value_minor` semantics vary by type).

- **Applicable-plan validation**: if a previously selected Offer becomes inapplicable after Plan change, keep `offerId` but show inline error `Offer "Student 20%" does not apply to plan "Monthly Basic"` (`role=alert`) and block submit until cleared or changed. Same for expired / inactive offers.

- **Sale-time minima**: hint (non-blocking) if `base < offer.min_purchase_minor` → "Offer requires minimum purchase ₹X".

### Alternative considered

Inline numeric-only polymorphic input (type `%|₹` inside one field) was rejected — for recurring professional use, explicit type+value are clearer and debuggable (see Gumroad `DiscountInput.tsx` pattern of two fieldsets: `percent` vs `cents`, and `ux.stackexchange.com/78814` — dual linked fields beat single polymorph for audit).

---

## 3.2 — Pricing fields — Base / Discount Amount / Final Price

### Labels & binding

- `Base Price *` — editable `₹` currency input. On Plan select, seeded from `plan.base_price_minor`; thereafter independent.
- `Discount Amount` — editable but normally derived. `labelEnd` shows the breakdown: `20% → ₹1,000` or `₹1,000 fixed` or `Override → ₹4,000 final` or `Free 1 month`.
- `Final Price` — computed `base - discountAmount`, form-read + editable override. Overriding breaks Offer sync (segments show Custom). Undo via `Reset to plan/offer`.
- Optional rows (collapsed accordion `Q22` "Add them, but make them optional"): `Tax` (rate `18%` → amount `₹720` derived from `base/ final` per line) and `Registration Fee`. Accordion closed by default; opened state persists per session.
- **Money verbs**: the clerk types **rupees** (e.g. `10000`, `5240.22`, `65029.41` per `Q35`), no paise hint. Stored & calculated as **paise** (×100) in the submit payload only.

### Currency masking (detailed)

Research `jch/posts/2024-11-01-html-currency-input`, `etch.co/blog/money-input`, `hmrc-design-pattern`, `uxpatterns.dev/patterns/forms/currency-input`:

- Input element: `<input type="text" inputmode="decimal" autocomplete="off" pattern="^\d{1,3}(,\d{3})*(\.\d{0,2})?$">`
  Never `type="number"` (rejects `,`, shows spinners, inconsistent decimals).
- On focus: show raw `5240.22` (no commas). On blur: format to `5,240.22` via `Intl.NumberFormat('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})`. If the user typed no dot, assume `.00` on blur (not during typing — per `101 UX Principles #53` "Don't add decimal places while typing" — pre-filling `.00` mid-type leads to eBay ₹1000-vs-₹10 errors).
- Cap **2 fraction digits**: third digit blocked on keydown; pasted value with 3 decimals → round half-up on blur + helper hint "Rounded to 2 decimals".
- Allow commas and ₹ symbol to be pasted — strip on parse: `parseRupees(s) = Math.round(parseFloat(s.replace(/[^\d.-]/g,''))*100)` with guard for `NaN`.
- Validation coexists with masking: `basePriceRupees` left empty → `Base price required`; non-numeric (after strip) → `Enter a number`; >2 decimals before blur → soft hint then rounded.
- Right-align (`text-right font-mono tabular-nums`), hint side `aria-describedby`. `aria-label="Base price in Indian rupees"` (`uxpatterns` a11y).
- JS grouping uses `en-IN` (lakh grouping: `10,00,000` vs `1,000,000`) since org is India — research confirms grouping improves scan for large amounts.

### Reactive calculation & ownership

- Live calc in the renderer uses a **pure shared function** `useSalePricing.ts#calculateSale({basePaise, discountType, discountValue, overrideDiscountPaise?}) → {discountPaise, finalPaise}` — preview only. Authoritative total is computed again **in the backend transaction** inside `SellMembership` (per `docs/08:52` "React should not own membership pricing rules"). UX preview and backend must converge; divergence throws `VALIDATION_ERROR` banner on submit and keeps form dirty for correction.
- `finalPaise = max(0, basePaise - discountPaise)`; if `discountPaise > basePaise` show inline error `Discount exceeds base` (per `Q13` "If it exceeds show the error") and block submit; do not silently clamp.

### Zero / free-trial guard (`Q21`)

- `base>0` required for normal flow, but `final=0` is allowed **only as a free trial**. On submit attempt with `finalPaise===0`, intercept with **Trial Guard dialog** (modal, not inline): title "Free trial membership — confirm trial and adjust duration?" — asks "How many trial days?" with default `duration_days_snapshot` (e.g. 7) and a day picker. Confirm proceeds; cancel keeps user on pricing. This prevents "clerk might submit unknowingly" soft guard requested in `Q21`.
- Trial detail onward shows `Trial` badge on membership history (derived from `final=0`).

### Display behaviour in Order Summary

- Summary mirrors the three fields live, animating value changes 120ms with `aria-live="polite"` on the `Final` row.
- When Offer is selected, show "You saved ₹1,000 (20%)" sublabel in summary — per NN/g & voucherify "Show discount impact immediately — percentage and absolute savings".
- Custom override hint lives in `labelEnd` inside the form, not just in summary, so the clerk sees it at the point of typing.

### References

- `plans/membership-form-querstions-solutions.md:4-7, Q13, Q18-Q22, Q35-Q37`.
- `docs/03-catalog-and-offers.md:13-30` (snapshot + discount types), `catalog.ts:98-110`, `docs/04-billing-and-invoicing.md:34-42` (paise), `backend-implementation-guidelines.md:10` (Money).
- Currency research: `hmrc-design-pattern/currency-input`, `uxpatterns.dev/patterns/forms/currency-input`, `jch.github.io/posts/2024-11-01-html-currency-input`, `etch.co/blog/money-input`, `saltdesignsystem.com/salt/patterns/formatted-input`, `101 UX Principles #53`.
- Discount UX: `ux.stackexchange.com/questions/78814`, `antiwork/gumroad#DiscountInput.tsx`, `voucherify.io`, `nngroup.com/articles/applying-discounts`, `ecomdesignpro.com/discount-code-ux-cart-abandonment`.
