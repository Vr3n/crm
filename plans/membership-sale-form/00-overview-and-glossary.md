# 00 — Overview & Glossary Lock

**Status**: Plan (grilling complete, answers ingested from `plans/membership-form-querstions-solutions.md:1-51`)
**Scope**: UI/UX only for the Membership Sale full-page form. Backend contracts are referenced to keep the frontend honest but not designed here (per `Q6`, `Q30` — "This plan was only for UI and UX").
**Route**: `/memberships/sell` — full-page form, not a dialog (`plans/membership-form.md:5`)

---

## 0.1 — What this form must do (frozen)

```
Lead (required) ──┬──> Customer (reused or created from Lead.person_id, per Q1/Q7)
Plan (required) ──┤     Offer (optional, filtered by applicable_plan_ids, per Q12)
                  ├──> Membership (snapshot of plan/offer terms, per docs/02 & docs/03)
Dates (start/end) ┤     Invoice (DRAFT→OPEN in same tx, number per Q24)
Pricing (₹) ──────┤     Payment (+ allocation, per docs/05)
                  └──> PDF from finalized snapshot → Downloads/<invoice>_<name>_<dt>.pdf (Q27-29)
```

Flow sections (from `plans/membership-form.md:8-12`, reworded for implementation):
1. Select Lead or create via inline lead dialog.
2. Select Plan or create via inline plan dialog.
3. Select Offer or create via inline offer dialog (reveals `discount_type` + `discount_value`).
4. Start / End date (start defaults today, end auto-derived from plan duration).
5. Base Price → Discount Amount → Final Price → Paid Amount → Amount Due / Change Due + Payment Method.

Post-submit: navigate to membership detail / Tally-style invoice view (`Q38`), with native + shadcn notification that the PDF landed in Downloads.

---

## 0.2 — Ubiquitous language (domain-modeling resolves)

Breaches in the original draft are fixed here. `plans/CONTEXT.md:1-174` is the source of truth; additions are `Membership Sale`-scoped.

| UI label | Canonical term | Storage / type | Why this wording |
|---|---|---|---|
| **Final Price** | `Final Price` (formal). `Membership Amount` retained only as deprecated alias | `memberships.final_price_minor INT (paise)`, `membership.ts:70` | `Q3`: user confirmed Final Price is correct. Prevents float `Amount` drift (`CONTEXT.md:170-174` Money = minor units). |
| **Base Price** | `Base Price` | `base_price_minor INT` (`catalog.ts:27`) | Direct copy from plan; editable override snapshotted at sale (see `docs/03-catalog-and-offers.md:13` snapshot principle). |
| **Discount Amount** | `Discount` (derived) | `discount_minor INT` (`membership.ts:69`) | Never recomputed from Offer after sale (`docs/03:13`). |
| **Amount Due** | `Amount Due = max(0, final - paid)` | derived | `Q18`: user chose partial-payment model per `docs/05-payments-and-finance.md:46`. Replaces ambiguous "Balance". |
| **Change Due / Credit** | `Change Due = max(0, paid - final)` or `Credit` | derived / `credits` table | `Q25`: overpay dialog picks return vs keep-as-credit (`docs/05:18` Credit ≠ Refund). |
| **Sell Membership** | Command `membership.sell` | single tx (`docs/06-domain-model-backbone.md:45`, `backend-implementation-guidelines.md:5`) | `Q9` proposed, deferred to backend phase — UI gates on conjunction of `membership.create + invoice.create + payment.record` until permission lands. |
| **Duration** | `Duration` enum in **days**: `MONTHLY=30, QUARTERLY=90, HALF_YEARLY=180, YEARLY=365` | `membershipPlans.duration TEXT` + snapshot `duration_days_snapshot INT` (`membership.ts:67`) | `Q5` "It is days" + `Q14` "QUARTERLY = start + 90 days". `QUATERLY` typo fixed to `QUARTERLY`. |
| **Offer** | `Offer` (pricing rule, not discount column) | `offers.discount_type/value_minor` (`catalog.ts:108-110`), 4 types | `Q4`: UI shows `discount_type` + `discount_value` and derives `discountAmount`. |
| **Lead → Customer** | `Customer` created from `Lead.person_id` (`Q1`) | `customers.person_id UNIQUE(org, person)` (`membership.ts:41`) | `people.phone UNIQUE(org, phone)` (`sales.ts:31`); reuse existing Customer for loyalty (`Q7`). |

### References that forced these choices
- `plans/CONTEXT.md:47-80` (Customer ≠ Lead, Person is anchor), `src/main/db/schema/membership.ts:15-44` and `sales.ts:14-32` (schema truth against which "optional plan" was rejected).
- `docs/02-customers-and-memberships.md:33-36` (pricing snapshot), `docs/03-catalog-and-offers.md:13-30` (base/offer snapshot), `docs/04-billing-and-invoicing.md:33-42` (money as paise), `docs/05-payments-and-finance.md:46` (outstanding derived, not counter).
- `backend-implementation-guidelines.md:10-11` (Money value object, immutable financial history).
- User answers `Q3-Q5, Q10-Q11` (required plan, snapshots are overrides).

---

## 0.3 — Validation contract (as answered)

From `plans/membership-form.md:19-25` + `Q10-Q21`:

1. Lead required.
2. Plan **required** (changed from optional per `Q10` to respect `memberships.plan_id NOT NULL` at `membership.ts:62`).
3. Offer optional; if chosen must be applicable to plan (`Q12` → error if `applicable_plan_ids` mismatch).
4. Start defaults today (`Asia/Kolkata` wall date → stored UTC `YYYY-MM-DD`, per `Q16`), editable. End auto = `start + durationDays`. Block live + on submit: `end < start` and `end - start < durationDays` (`Q15/Q17`, `Q5`). Back-dating allowed; time picker omitted (`Q36`).
5. `base_price_minor > 0` required (except `0` allowed for free trial with guard dialog `Q21`), `discount_minor >= 0`, `discount_minor <= base_price_minor` (`Q13/Q21` — exceeding shows error, not clamp-to-zero). `final = base - discount` reactive; `paid` required, may be `< final` (partial) or `> final` (overpay dialog `Q25`). `paymentMethod` required dropdown (`Q25`). Amount Due / Change derived live. Tax / registration fee optional rows (`Q22`). Money in `₹` with `,` grouping, 2 decimals only (`Q19/Q35`).

---

## 0.4 — What this sub-plan holds

| File | Phase | What it designs |
|---|---|---|
| `01-ia-and-layout.md` | IA | Single-page vs stepper decision, Tally research, anchor nav, split layout, responsive |
| `02-lead-and-plan-selection.md` | Sections 1-2 | AutocorrectCombobox reuse, duplicate-phone modal, plan override/badge, create dialogs |
| `03-offer-and-pricing-engine.md` | Section 3 + §5 pricing | Discount types, linked inputs, currency mask, reactive calc, zero-guard |
| `04-dates-and-timezone.md` | Section 4 | Days mapping, UTC↔IST, calendar math, live date validation |
| `05-payment-and-overpay.md` | Payment | Partial payments, overpay dialog (credit vs change), method dropdown, trial dialog |
| `06-invoice-and-pdf.md` | Billing | Invoice number format, snapshot, PDF generation path, Downloads + notifications |
| `07-form-orchestration-and-validation.md` | Cross-cutting | TanStack Form/Query wiring, error surfacing, a11y, idempotency, perf |
| `08-component-tree-and-execution-order.md` | Build | File tree, query keys, IPC contracts, tests, phased execution order |

Each file cites **why** (grilling outcome + research citations) and **references** (docs/schema/internet source).
