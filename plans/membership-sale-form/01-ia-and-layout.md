# 01 — IA & Layout

## 1.1 — Decision: single scrolled page + sticky Order Summary, not a stepper

### Why

- **Repeated expert users** (front-desk clerks) need scan-and-tab speed. NN/g "Forms vs Applications" (2005) rule: "long forms that data-entry clerks fill out over and over are often on a single page — navigating between pages adds complexity." Our users sell dozens per day; hidden-step wizards add clicks and break revisiting earlier sections (`Q33` "easy to change previous step, less clicks").
- **Empirical chunking cost**: `atticusli.com/blog/posts/the-form-chunking-illusion` — large A/B across thousands of visitors: multi-step dropped per-page exits but **raised cumulative exits ~8%→10%**; each "Next" is a fresh commitment point. Net conversion flat for 4-15 fields. `growthlayer.app` "Form design AB testing lessons" 2026: chunking hurt completion -2% to -9% on moderate forms; crossover where multi-step wins ≈ 8+ low-cost or 6+ high-cost fields. Our form is ~10-12 fields (moderate) but clerks already know it → single page wins.
- **Tracer: Tally ERP pattern**: TallyPrime invoice templates (`tallysolutions.com/custom-invoice-templates` 2026, `help.tallysolutions.com/guidelines-template-based-invoice-customisation`) use a **single invoice sheet** with grouped blocks (header → line table → totals) and a **highlighted total**. Research Q33 explicitly asked to "design it like they do in Tally" — Tally does not paginate an invoice.
- **Interdependence**: Sections are coupled (Plan choice drives dates + base price; Offer drives discount; Paid vs Final drives due). Wizard hiding later sections prevents the glance-right summary the user asked to see "most important fields together" (`Q33`).

### What — implemented for 01 (current)

- **Route**: `/memberships/sale` primary, `/memberships/sell` alias — full-page form. Header row: title **`Membership Sale`** (`text-2xl font-semibold tracking-tight`) + org badge + `View memberships` link. Updated from `Sell membership` per request.
- **Anchor nav — removed for now**: the thin pill bar `Lead — Plan — Offer — Dates — Pricing — Payment` (`SaleAnchorNav`, `IntersectionObserver` scroll-spy) is **commented out** in `features/memberships/sale/page.tsx:35` and its import is commented (`page.tsx:6`). Component `sale-anchor-nav.tsx` is kept for quick re-enable — uncomment when needed.
- **Two-column split** (≥ `lg`):
  ```
  left  2/3 : stacked cards (gap-3) — the form
  right 1/3 : sticky top-[72px] Order Summary card (Tally-style) + Submit
  ```
  Below `lg`, summary collapses to a bottom sticky bar showing `Final · Paid · Due` (`OrderSummary` mobile bar).
- **Card rows — flexed pairs**:
  - `Plan + Offer` in one row: `grid gap-4 sm:grid-cols-2` wrapping the two `SaleSectionCard`s (`page.tsx:56`). Mirrors the catalog's two-up vocabulary grouping.
  - `Dates + Pricing` in one row: `grid gap-4 sm:grid-cols-2` wrapping `SaleSectionCard id="dates"` + `id="pricing"` (`page.tsx:81`). Single flex row on `≥sm`, stacked on `<sm`.
  - Left column now flows: `Member` → `Plan|Offer` row → `Dates|Pricing` row → `Payment`.
- **Submit placement**: moved **below the Order Summary card** on desktop (`page.tsx:114` — `Button w-full` inside the `sticky top-[72px]` right column, gap-4 stack). Mobile uses a separate `lg:hidden` full-width button below the payment card (`page.tsx:112`). The previous left-column submit bar was removed.
- **Visual grouping**: each section is a `Card rounded-2xl border bg-card shadow-sm p-5` with `CardHeader` label + helper text + `FieldGroup gap-3` inside (`form-implementation-guideline.md:52` gap & `min-w-0` grid children).
- **Two-up short fields**: `grid gap-3 sm:grid-cols-2` for `(start+end)` and `(paid+method)` — matches `docs/form-implementation-guideline.md:52`.

### Alternatives rejected

- **Paginated wizard (3-5 steps)**: rejected per chunking data; would add 2-4 transition friction points with no field reduction. `uxmatters.com` ("Pagination in Web Forms") notes wizard helps only when "users don't have a lot of domain expertise or go through the process rarely" — opposite of clerks.
- **Dialog**: rejected per `plans/membership-form.md:5` "Full page form" intent and scope to show plan vs sold comparison history.

### References

- `plans/membership-form-querstions-solutions.md:33` ("You decide... less clicks, easy to navigate") + `Q34-Q36`.
- `help.tallysolutions.com/customise-and-print-templates`, `help.tallysolutions.com/guidelines-template-based-invoice-customisation`, `tallysolutions.com/smart-moves/expert-insights/why-branded-invoice-design-matters` (template extensibility, highlight total).
- `nngroup.com/articles/forms-vs-applications`, `nngroup.com/articles/wizards`, `atticusli.com`, `growthlayer.app`, `uxmatters.com/mt/archives/2010/03/pagination-in-web-forms-evaluating-the-effectiveness-of-web-forms.php`, `productphilosophy.com/articles/forms-friction-surfaces-field-drop-off`, `ezpa.ge/multi-step-vs-single-page-forms`.
- `docs/08-persistence-and-electron-architecture.md:52` (React owns rendering, not pricing), `depth-elevation-guidelines.md`, `table-ui-design-guide.md`.

---

## 1.2 — Order Summary card — the Tally "totals block"

Grouped totals are the scanning anchor in every Tally layout ("add a separate section for payment instructions… highlight total payable" — tallysolutions guide). Card content from top to bottom:

1. Plan line: `Monthly Basic · QUARTERLY (90 days)` (muted, updates on plan pick).
2. Divider.
3. `Base Price` → formatted `₹5,000.00` (right-aligned tabular figures).
4. `Discount` → `-₹1,000.00` (`text-amber-600` when applied, plus `20% Student Offer` sublabel).
5. Optional `Tax` / `Registration fee` rows (render only when >0; collapses otherwise).
6. Heavy divider + `Final Price` (`text-base font-semibold` + `bg-muted/50` row — Tally's shaded total).
7. `Paid` + `Payment method pill` (`CASH` etc.).
8. Emphasis row (conditional):
   - `Amount Due ₹2,000` (`text-amber-600 bg-amber-50`) when `paid < final`
   - `Change Due ₹600` (`text-emerald-600 bg-emerald-50`) or `Credit ₹600` (`text-sky-600 bg-sky-50`) when `paid > final` per overpay choice
   - `Paid in full ✓` (`text-emerald-600`) when exact.

Micro-interaction: numbers use CSS transitions 120ms + `aria-live="polite"` on the `Final/ Due/Change` rows so screen readers announce recalcs. Header title is **`Membership Sale`** (updated per request).

---

## 1.3 — Responsive behaviour — as shipped

- `≥lg`: split as above; summary `position: sticky` so it survives scroll through all 6 sections. Submit is part of the sticky stack (below summary), so CTA scrolls with the preview.
- `<lg`: summary is a bottom bar (`h-14 border-t bg-card` with 3 pills + `Review totals`). Tap scrolls to pricing. Submit is a separate `lg:hidden` button below the payment card, so mobile CTA is in-flow, not trapped in the bottom bar.
- `sm` breakpoint flexes the two card pairs: `Plan|Offer` and `Dates|Pricing` go 1-col `<sm`, 2-col `≥sm`.
- Anchor nav is not rendered (`commented`), so no `lg` offset shift needed.
- Keyboard flow: `Tab` traverses left-column inputs linearly; summary is `aria-hidden` for tab order (decorative for sighted glance, screen readers hear live region instead).

---

## 1.4 — Post-submit destination

On successful `membership.sell` tx, `router.push(/memberships/:membershipId?from=sale&invoice=:invoiceNumber)` (`Q38` "Go to membership detail page or maybe a special page which is structured like a Tally invoice"). That detail page reuses the same summary card but rendered from the **snapshot** (immutable invoice lines). "Sell another" ghost button stays in header of the success state if the user prefers to remain on the sale page. Header title for the sale page itself is **`Membership Sale`**.

---

## 1.5 — Accessibility of the IA

- Anchor nav is `<nav aria-label="Form sections">` with anchor links — not a tablist (no trapped focus).
- Cards have `aria-labelledby` pointing at their `h2` section titles.
- Sticky summary duplicated as an off-screen live region for screen readers so totals are reachable without scrolling.
