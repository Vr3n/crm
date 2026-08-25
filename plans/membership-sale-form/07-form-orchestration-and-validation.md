# 07 — Form Orchestration & Validation

## 7.1 — Stack mandate (AGENTS.md §1-5)

| Layer | Choice | Why (reference) |
|---|---|---|
| Form state | `TanStack Form v1` (`@tanstack/react-form`) — one `useForm`, no local field state | `AGENTS.md:2` "mandatory to use react-patterns + tanstack skills"; `docs/form-implementation-guideline.md:10-16` — every new capture form uses `useForm` + `form.Field` + `FieldGroup` + `FormField` + `Field` + `LoadingButton` |
| Data fetching | `TanStack Query` `queryOptions` read models, never props drilling | Same guideline + `docs/implementation-details/leads-pipeline.md:82-94` (`leadsListOptions`, `referenceDataOptions` with standalone keys) |
| Controls | `shadcn/ui` (`Input`, `Select`, `Textarea`, `Dialog`, `Button`, `Calendar`, `Popover`) + shared `FormField` (`components/ui/form-field.tsx`) + `Field` + `LoadingButton` + `FieldGroup` | Guideline §16 |
| Currency masking | Custom `utils/money.ts` wrapping `Intl.NumberFormat('en-IN')` + pure `parseRupees`/`formatPaise` | §03 decision; never `type="number"` per HMRC/etch research |
| IDs | Numeric SQLite ids everywhere (already `types.ts` convention) | `leads-pipeline.md:95` |

---

## 7.2 — `useForm` shape

```ts
type SaleFormValues = {
  leadId: number | null
  planId: number | null
  offerId: number | null
  discountType: '' | 'FIXED_AMOUNT'|'PERCENTAGE'|'OVERRIDE_PRICE'|'FREE_PERIOD'
  discountValue: string           // rupees or % or months, raw input text
  basePriceRupees: string         // e.g. "5,240.22" (raw/masked text), required
  discountAmountRupees: string    // derived but editable override text
  finalPriceRupees: string        // derived paise→rupees display text
  taxRupees: string               // optional, collapsed accordion
  registrationFeeRupees: string   // optional
  startDate: string               // YYYY-MM-DD UTC ISO date
  endDate: string                 // YYYY-MM-DD UTC ISO date
  paidAmountRupees: string        // required, partials allowed
  paymentMethod: ''|'CASH'|'UPI'|'CARD'|'BANK_TRANSFER'|'CHEQUE'|'OTHER'
  overpayDisposition: null|'CREDIT'|'CHANGE'
  isTrial: boolean
  trialDays: number | null
}
defaultValues: { leadId:null, planId:null, offerId:null,
  discountType:'', discountValue:'', basePriceRupees:'', discountAmountRupees:'', finalPriceRupees:'',
  taxRupees:'', registrationFeeRupees:'',
  startDate: todayISO('Asia/Kolkata'), endDate: computedInclusiveEnd(todayISO, durationDays),
  paidAmountRupees:'', paymentMethod:'', overpayDisposition:null, isTrial:false, trialDays:null }
```

`isTrial` + `trialDays` hold the Trial Guard dialog state inside the form (not outside).

---

## 7.3 — Validation — per-field + form-level

### Reactive evaluation rule (verbatim from guideline)

A field is *evaluated* (error shown, `aria-invalid` set) when **any** of:
1. it has been **touched** (blurred/interacted),
2. the form has been **submitted**, or
3. its `completeWhen(value)` flips **true** (e.g. paise-parsable currency).

An external `extraError` (async/server `VALIDATION_ERROR`) is always invalid. `role="alert"` renders the message; controls style from `aria-invalid`/`data-valid` (red/green + success icon) — `docs/form-implementation-guideline.md:18-26`.

### Field validators (`validators={{onChange: fn}}`)

Pure `return string|undefined`, each has a `completeWhen`:

- `leadId`: `return v? undefined : "Choose a member (lead)"`
- `planId`: same ("Choose a plan").
- `offerId`: optional; extra validator when both plan & offer present checks `applicable_plan_ids` gating → "Offer does not apply to this plan".
- `basePriceRupees`: parse → `paise>0? undefined : "Base price required"` (trial path allows 0 but intercepts via dialog, not field valid).
- `discountAmountRupees`: `parse>=0 && parse<=base ? undefined : "Discount exceeds base"`.
- `finalPriceRupees`: derived; no direct validator — revalidated on submit via cross-field.
- `startDate`/`endDate`: date validators + cross-field (see §7.4).
- `paidAmountRupees`: `required && parse>=0`; paise precision checked (stripped to 2 decimals).
- `paymentMethod`: `required`.

### Form-level validator (the only place that should veto `canSubmit` for dependent inputs)

`scheduleOn → follow-up` dependency in `move-stage-dialog` already uses a form-level validator (`leads-pipeline.md:136` — dependent inputs only mount after checkbox flips, so per-field can't veto). The same pattern applies here for:
- `endDate < startDate`
- `daysBetween +1 < durationDays`
- `discount > base`
- `offer inapplicable`

Implemented as `validators={{onChange: ({value}) => ({ fields: {...}, form: "End date must last at least 90 days" })}}` — surfaces in an inline banner as well as field errors.

---

## 7.4 — Submit gating

`LoadingButton disabled={!canSubmit || !leadId || !planId || !paymentMethod || isSubmitting}`

Rationale: `canSubmit` alone is insufficient until async vocabularies have resolved and the precondition value (the selected ids) is actually present (`form-implementation-guideline.md:34`). Each `AutocorrectCombobox` read populates the options async; gating on the id guards the premature `canSubmit` flicker.

Additional gating: `isTrial` dialog open → submit blocked; `overpaid && !overpayDisposition` → blocked (overpay dialog in progress).

---

## 7.5 — Error surfacing

**Field errors**: under each `FormField` in the reserved helper line, swapping hint↔error via `id=<name>-hint` / `<name>-error`, wired through `aria-describedby` and styled by `aria-invalid`.

**Inline banner** (top of page, `role=alert`): business errors from the sale tx. Format:

```
Surface ApiError banner: {code} — {message}
e.g.  DISCOUNT_EXCEEDS_BASE — Discount ₹6,000 exceeds base ₹5,000
      OFFER_NOT_APPLICABLE — Student Offer does not apply to Monthly Basic
      PERMISSION_DENIED — you need membership.sell
      INVOICE_NUMBER_COLLISION — invoice number retry (auto-retry once, then banner)
      CONFLICT — phone already belongs to John Doe (→ duplicate modal)
```

Banner mirrors `new-lead-dialog.tsx` inline `ApiError` handling (`leads-pipeline.md:130`), `Q39` "Inline banner so the user can then solve the mistakes."

**Toast**: only for success ("Membership sold — CRO-250826-01") + PDF download toast; errors stay inline, no error toasts (keeps correction context visible).

---

## 7.6 — Radix Select guard

Every Radix `Select.Root` feeding a numeric id field guards `onValueChange`: `if(v!=='') field.handleChange(Number(v))` — prevents the mount-fire `''→0` corruption caught by `new-lead-dialog` component tests (`docs/form-implementation-guideline.md:42`, `leads-pipeline.md:144`).

---

## 7.7 — Accessibility

- Every control gets a real `<label for>` via `FormField`.
- `aria-describedby` links hint/error; errors have `role="alert"`.
- Currency inputs: `aria-label="Amount in Indian rupees"` + optional `aria-describedby` pointing at the `labelEnd` breakdown.
- Date pickers: `aria-label="Start date"`, format hint `DD/MM/YYYY` as `aria-describedby`.
- Dialogs trap focus, initial focus on primary action (`Select existing lead` / `Keep as credit`), close on Esc only when safe (overpay dialog Esc → `CHANGE`).
- Combobox: `aria-expanded`, focus moved into input on expand, options `role="option"` (progressive disclosure pattern · `ecomdesignpro.com`).

---

## 7.8 — Performance & lifecycle

- **Lazy dialogs**: `duplicate-lead-modal.tsx`, `overpay-dialog.tsx`, `trial-guard-dialog.tsx`, plus the three inline create dialogs (`new-lead-dialog`, `plan-dialog`, `offer-dialog`) are `React.lazy + <Suspense fallback={null}>` — same halving of cold-dialog RAM pressure as the leads page (`leads-pipeline.md:255`).
- **Vocabulary caching**: standalone cache keys and `staleTime` 30_000-300_000 so sale-form mutations don't refetch (`form-implementation-guideline.md:81-83`). Mutations invalidate minimal keys (`['memberships']`, `['invoices']`, `['autocorrect-options','lead']` etc.).
- **Idempotency**: `isSubmitting` guard + client `idempotencyKey = crypto.randomUUID()` sent with sale payload; backend dedupes on `(organization_id, idempotencyKey)` if it exists (future slice), and the `UNIQUE(invoices.number)` index guards number collisions.
- **Tab efficiency**: `Tab` traversal linear through left-column inputs; summary is skipped in tab order (decorative) but mirrored via `aria-live`.

---

## 7.9 — Reactive wiring diagram (preview-only in React)

```
plan.pick  ──→ seed basePrice, durationDays ──→ recompute endDate (if linked)
offer.pick ──→ seed discountType/value ──→ calculate discountAmount ──┐
discount type/value edit ─────────────────────────────────────────────┼─→ final = base - discount
basePrice edit ───────────────────────────────────────────────────────┤
discountAmount edit ──→ (break Offer sync, mark Custom) ─────────────┤
tax/regFee edit ─────────────────────────────────────────────────────┘
paidAmount edit ──→ amountDue / changeDue ──→ overpay dialog toggle
startDate edit ──→ recompute endDate (if linked)
```

All arrows are synchronous pure functions (`utils/money.ts`, `utils/dates.ts`, `hooks/useSalePricing.ts`); no debounce is needed — calculations are O(1). The authoritative calc is repeated in the backend tx; preview and tx must agree.

---

## 7.10 — Money parsing helpers (mirror domain)

- `parseRupeesToPaise(s: string): number` — strips `,` `₹` spaces, validates `^\d+(\.\d{0,2})?$`, returns integer paise or `NaN`.
- `formatPaiseToRupees(paise: number): string` — `Intl.NumberFormat('en-IN').format(paise/100)` with exactly 2 fraction digits on blur.
- Kept in `src/renderer/src/lib/validation.ts` style (`form-implementation-guideline.md:52-56`) so renderer rules mirror `src/main/domain/money.ts` shared domain.

### References

- `AGENTS.md:2-5` (skill mandates), `docs/form-implementation-guideline.md:10-96` (evaluated, gating, seeding, labelEnd, Radix guard, performance, checklist).
- `docs/implementation-details/leads-pipeline.md:102-272` (FormField extraction, lazy dialogs, test stubs for `scrollIntoView` + select pointer capture, AutocorrectCombobox backend).
- `src/main/db/schema/catalog.ts`, `membership.ts`, `billing.ts`, `sales.ts` (types & uniqueness that drive validation).
- Internet patterns: `hmrc-design-pattern/currency-input`, `uxpatterns.dev`, `etch.co`, `saltdesignsystem.com`, `voucherify.io`, `ecomdesignpro.com` (a11y + progressive disclosure).
