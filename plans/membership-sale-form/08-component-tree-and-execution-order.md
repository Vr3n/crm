# 08 — Component Tree & Execution Order

## 8.1 — File tree (UI-only slice)

```
src/renderer/src/features/memberships/sale/
├── page.tsx                         # route wrapper @ /memberships/sell
├── components/
│   ├── lead-section.tsx             # §02.1 — AutocorrectCombobox + identity card + duplicate guard
│   ├── plan-section.tsx             # §02.2 — AutocorrectCombobox + caption + override badge
│   ├── offer-section.tsx            # §03.1 — AutocorrectCombobox + type/value linked controls
│   ├── dates-section.tsx            # §04.3 — two DatePickers + derived hint
│   ├── pricing-section.tsx          # §03.2 — Base/Discount/Final + optional Tax/RegFee accordion
│   ├── payment-section.tsx          # §05.2-3 — Paid + Method + due/change derivation
│   ├── order-summary.tsx            # §01.2 — sticky Tally-style card + aria-live total
│   └── dialogs/
│       ├── duplicate-lead-modal.tsx # §02.1 — ConflictError on inline lead create
│       ├── overpay-dialog.tsx       # §05.4 — Credit vs Change choice
│       └── trial-guard-dialog.tsx  # §03.2 — final=0 trial confirm
├── hooks/
│   ├── useSalePricing.ts            # §03.1 — pure calc(4 discount types → discount/final)
│   └── useSaleDates.ts              # §04.2 — daysForDuration, addDaysInclusive, daysBetween
├── utils/
│   ├── money.ts                     # §03.2 — parseRupeesToPaise, formatPaiseToRupees (mirror domain)
│   └── dates.ts                     # §04.2 — date helpers, todayInZone('Asia/Kolkata')
├── api.ts                           # §07 — window.api.sale.* facade (IPC)
├── queries.ts                       # §07 — queryOptions for searchLeads/Plans/Offers + sale mutation
├── validation.ts                    # §07 — mirrored Zod field validators + completeWhen predicates
└── index.ts                         # re-exports for lazy imports

src/shared/contracts/
├── sale.ts                          # Zod schemas: searchLeadsInput, saleInput, invoiceDownloadInput
└── ipc.channels.ts                  # channels: SALE_CREATE, LEADS_SEARCH, CATALOG_SEARCH_PLANS/OFFERS, INVOICES_DOWNLOAD_PDF

src/renderer/src/lib/validation.ts  # extended with sale money/date validators (shared-domain mirror)
```

All new dialogs are `React.lazy + <Suspense fallback={null}>` (`form-implementation-guideline.md:75`, `leads-pipeline.md:255`).

---

## 8.2 — TanStack Query — keys & options

| Query | Key | staleTime | Invalidation trigger |
|---|---|---|---|
| `searchLeads(query)` | `['autocorrect-options','lead',query]` | 30_000 | `leads:create` in inline dialog → invalidate `['autocorrect-options','lead']` |
| `searchPlans(query)` | `['autocorrect-options','plan',query]` | 300_000 | `catalog:createPlan` → invalidate `['autocorrect-options','plan']` |
| `searchOffers({planId,query})` | `['autocorrect-options','offer',{planId,query}]` | 300_000 | `catalog:createOffer` → invalidate `['autocorrect-options','offer']` |
| `sellMembershipMutation` | `mutation(['sale','create'])` | — | onSuccess → invalidate `['leads']`, `['customers']`, `['memberships']`, `['invoices']` + toast + navigate |

Keys are **standalone**, outside `['memberships']`/`['leads']`, so unrelated list mutations don't refetch vocabularies (`form-implementation-guideline.md:81`, `leads-pipeline.md:86-90`).

Read counts mimic the leads pipeline pattern: 3 vocab searches (one per combobox query string) + detail prefetch for the selected rows — no batched `IN` needed for this form.

---

## 8.3 — IPC contracts (shape, deferred backend impl)

```ts
// src/shared/contracts/sale.ts (Zod)
saleCreateInputSchema = z.object({
  leadId: z.number().int().positive(),
  planId: z.number().int().positive(),
  offerId: z.number().int().positive().nullable(),
  discountType: z.enum(['FIXED_AMOUNT','PERCENTAGE','OVERRIDE_PRICE','FREE_PERIOD']).nullable(),
  discountValue: z.number().finite().optional(), // meaning varies by type
  basePricePaise: z.number().int().min(0),
  discountPaise: z.number().int().min(0),
  finalPricePaise: z.number().int().min(0),
  taxPaise: z.number().int().min(0).default(0),
  registrationFeePaise: z.number().int().min(0).default(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paidPaise: z.number().int().min(0),
  paymentMethod: z.enum(['CASH','UPI','CARD','BANK_TRANSFER','CHEQUE','OTHER']),
  overpayDisposition: z.enum(['CREDIT','CHANGE']).nullable(),
  isTrial: z.boolean().default(false),
  trialDays: z.number().int().min(1).nullable(),
  idempotencyKey: z.string().uuid(),
  durationDays: z.number().int().positive(), // snapshot for memberships.duration_days_snapshot
})
// response: { ok:true, data:{ membershipId, invoiceId, invoiceNumber, pdfPath? } }
// errors: VALIDATION_ERROR, CONFLICT (duplicate), PERMISSION_DENIED,
//         OFFER_NOT_APPLICABLE, DISCOUNT_EXCEEDS_BASE, INVOICE_NUMBER_COLLISION, NOT_FOUND

invoicesDownloadPdfInputSchema = z.object({ invoiceId: z.number().int().positive() })
```

Contracts follow `backend-implementation-guidelines.md:15-16` — explicit Input/Output/Errors, `Zod` at IPC boundary, renderer never touches `window.api` except through `api.ts`.

Backend ownership (application layer owns transaction, repositories receive `tx`, one tx for the whole sale — `backend-implementation-guidelines.md:5`, `docs/06:45`) is **not part of this UI plan**; forms just emit paise ints.

---

## 8.4 — Tests (mirroring leads pattern)

Based on `docs/implementation-details/leads-pipeline.md:223-262` (19-files/306-tests split, `test.projects` node vs jsdom).

### Validation unit — `tests/renderer/sale-validation.test.ts` (jsdom `validation` project)

- `parseRupeesToPaise` ← `"10,000"`→`1000000`, `"5240.22"`→`524022`, `"65029.41"`→`6502941`, 3 decimals rounded, empty→`NaN`.
- Discount math matrix: 4 types × in-range / exceed / zero cases, `discount>base` error predicate.
- Date helpers: every duration enum → correct days, `end<start` / `end violates duration` predicates, back-dating allowed.
- Payment derivation: `paid<final → due`, `paid==final→full`, `paid>final→change/credit` helper.

### Component — `tests/renderer/sale-page.test.tsx` + `tests/renderer/sale-dialogs.test.tsx`

- Live red/green evaluation on base price, `CheckCircle2` + `aria-invalid`, `labelEnd` breakdown presence.
- Money cap: typing 3 decimals blocked / rounded on blur; `,` grouping visible on blur.
- Plan select seeds base + tax + durationDays + end; editing base shows "Edited — differs" badge & reset link.
- Offer select filters by plan; incompatible offer shows `role=alert`; changing plan busts offer options.
- Dates: selecting plan auto-fills end; editing end severs link; plan swap re-links; `end<start` errors live + on submit.
- Paid: partial shows `Amount Due`; exact shows `Paid in full`; overpay opens Credit vs Change dialog; choice reflected in summary; editing paid back below threshold clears disposition.
- Zero-final flow: `final=0` submit intercepts Trial Guard dialog — confirm with trial days.
- Inline banner: `ApiError` with `error.code` shown inline, form stays dirty.
- Submit gating: button disabled until `leadId && planId && paymentMethod && canSubmit`; `LoadingButton` idempotency.
- Accessibility: every select guards `if(v!=='')`, `element.scrollIntoView` + pointer-capture stubs mocked (jsdom gaps — same as `tests/renderer/setup.ts`).

Setup reuse: `tests/renderer/setup.ts` extended with `window.api.sale.*` mocks (`searchLeads/Plans/Offers` → canonical fixtures), `renderWithClient` pattern, lazy dialog pre-imports to avoid first-transform cost (`leads-pipeline.md:262-268`).

---

## 8.5 — Routing & shell

- AppRoutes entry: `{ path: 'memberships/sell', element: <SalePage />, handle:{ title:'Sell membership', permissionConjunction: ['membership.create','invoice.create','payment.record'] } }`
- Global nav: add **New Membership Sale** CTA in dashboard's outline buttons row (`plans/dashboard-ui-design.md:10-15` already anticipates a CTA there) + optional breadcrumb.

---

## 8.6 — Execution phases (UI-only)

All phases produce **frontend code only**; each phase is a vertical, reviewable increment.

### Phase A — Scaffolding

- Create `features/memberships/sale/` file tree + `SalePage` shell (route, anchor nav, split layout, empty sections).
- Add `queryOptions` + `api.ts` facades with stubbed search (mock data) so layout renders in isolation.
- Acceptance: page mounts at `/memberships/sell`, cards & summary render, anchor nav scrolls, responsive split collapses `<lg`.

### Phase B — Lead & Plan pickers (02)

- Wire `AutocorrectCombobox` for leads & plans, duplicate-phone modal, plan override/badge logic, three inline create dialogs (lead/plan/offer stubs).
- Validation: required checks, `aria-invalid`/`data-valid`, Radix guard.
- Acceptance: searchable picks, inline creation refreshes options, plan seeds base + end date.

### Phase C — Offer & Pricing engine (03)

- Offer combobox filtered by `planId`, discount type/value linked controls, `useSalePricing` hook, currency mask, final/amountDue derivation, zero/trial guard interception.
- Acceptance: 4 discount types produce correct discount & final; custom override path breaks Offer sync & shows `labelEnd`; 2-decimal cap & `,` grouping work; exceed-base shows error.

### Phase D — Dates & Timezone (04)

- `useSaleDates` + two DatePickers + auto-link/sever logic, `Asia/Kolkata` display, UTC ISO send, live date validation + concrete violation-date hint.
- Acceptance: plan selection auto-sets end to `start+daysInclusive`; manual end edit severs link; back-dating allowed; `end<start` guards submit.

### Phase E — Payment & Overpay (05)

- Paid + method controls, partial/overpay logic, Credit vs Change dialog, optional Tax/RegFee accordion, due/change live in section + summary.
- Acceptance: partial shows amber Due; overpay opens dialog; choice badges swap; method required blocks submit.

### Phase F — Order Summary, Invoice/PDF & Success (01 + 06)

- Sticky summary completion (all rows, emphasis states, motion, `aria-live`), submit wiring (paise contract, idempotency key, `LoadingButton`), success navigation to membership detail / Tally invoice page, PDF download IPC stub + Windows + shadcn toast with `Open folder`, invoice-number preview.
- Acceptance: successful submit navigates, toast & native notification path verified (Electron `Notification` mocked in test), filename `<CRO-…>_<Name>_<dt>.pdf` shown.

### Phase G — Validation, a11y & tests (07)

- Form-level cross-field validators, inline `role=alert` banner, gating (`!canSubmit || !leadId || !planId || !paymentMethod`), `role=alert` mapping, lazy dialog suspense, performance (staleTime, mutation invalidation), full unit+component coverage.
- Acceptance: `typecheck:node|web` + `lint 0` + `npm test` (node + components) passing; inline banner surfaces each mocked business `error.code`.

### Recommended build order within the sale feature

`Scaffolding → Lead → Plan → Offer → Pricing → Dates → Payment → Summary/PDF → Validation & tests`

Pricing waits on Offer (Offer drives discount), Dates waits on Plan, Payment waits on Pricing (Paid vs Final), Summary waits on all derived values — dependencies are real; phases above can be compressed (C+ D in parallel if the pricing hook is independent) but at least do Lead→Plan before Offer.

---

## 8.7 — Non-goals (explicitly deferred)

- Backend tx, `SellMembership` use case, `invoiceSequence` generation — planned later; these plan docs assume the IPC contracts exist.
- Permission enforcement beyond renderer's `can()` UX gating (`Q30`) — backend is source of truth.
- Triple-layer GST split (CGST/SGST) line rendering — v1 shows single `tax` amount per `billing.ts:74-77`.
- Multi-day recurring sale (e.g. renewal vs initial sale) — one sale path only.

---

## 8.8 — Definition of done for the UI plan

- [ ] Route live at `/memberships/sell` with IA + summary as specified (`01`)
- [ ] All 6 sections usable with AutocorrectCombobox / date pickers / currency mask (`02-05`)
- [ ] Reactive math correct across all 4 discount types and overpay dispositions (`03/05`)
- [ ] UTC / `Asia/Kolkata` display correct, duration mapping pinned by tests (`04`)
- [ ] Invoice snapshot contract emits paise ints; PDF stub writes to Downloads (`06`)
- [ ] TanStack Form/Query patterns fully honoured, a11y + lazy + gating correct (`07`)
- [ ] Unit + component tests passing, `typecheck` + `lint` clean (`07/08.4`)
- [ ] Post-submit navigates to membership detail; "Sell another" reachable (`01/06`)

### References

- `AGENTS.md:2-5` (skills: `design-taste-frontend`, `high-end-visual-design`, `react-patterns`, `tanstack`, `drizzle`) + `skills-lock.json`.
- `docs/form-implementation-guideline.md:10-96`, `docs/implementation-details/leads-pipeline.md:150-272`.
- `docs/01-people-leads-sales.md`, `02-customers-and-memberships.md`, `03-catalog-and-offers.md`, `04-billing-and-invoicing.md`, `05-payments-and-finance.md`, `06-domain-model-backbone.md`, `08-persistence-and-electron-architecture.md`, `backend-implementation-guidelines.md:5-16`.
- `src/main/db/schema/{catalog,membership,billing,sales}.ts`; `src/main/application/leads.ts` (query patterns).
- Internet research grouped citations captured in 01/03/04.
