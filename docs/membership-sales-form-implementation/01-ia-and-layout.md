# 01 — IA & Layout — Implementation

Implementation counterpart to `plans/membership-sale-form/01-ia-and-layout.md` (and `plans/membership-sale-form/00-overview-and-glossary.md` §0.2). This file records **what was actually shipped** for the scaffold phase, including the three post-plan tweaks requested on 2026-08-25.

## Scope of this pass

- Ship the full-page shell so later phases (02–07) have a real route and visual grid to bind into.
- No field logic, no pricing math, no IPC — placeholders only.
- Keep the change-set minimal and reviewable (single route + 3 new components + 2 entry-point rewires).

## Decisions carried from the plan (and why they were kept)

### Single scrolled page + sticky Order Summary, not a stepper

Plan §1.1 rejected a paginated wizard per NN/g "Forms vs Applications" (long forms for repeated expert use belong on one page) and `atticusli.com` chunking data (+2-4 transition friction points, cumulative exits 8%→10%). Implementation kept this: `/memberships/sale` is one continuous scroll (`MembershipSalePage`). The Tally invoice tracer (`help.tallysolutions.com/guidelines-template-based-invoice-customisation` — single sheet with grouped totals) was also kept as the visual reference for the summary card.

### Two-column balance (≥`lg`)

Plan §1.1 `left 2/3 : stacked cards | right 1/3 : sticky Order Summary` was kept at `grid lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]` (`src/renderer/src/features/memberships/sale/page.tsx:40`). Mobile collapses to the bottom bar (`lg:hidden` sticky footer) exactly as planned.

### Card system

Each section is a `Card rounded-2xl border bg-card shadow-sm` with a numeric step badge (`size-7 rounded-full bg-primary`) and `CardDescription` helper text (`components/sale-section-card.tsx`). `FieldGroup gap-3` and `min-w-0` grid children are already in place for the next phases (`docs/form-implementation-guideline.md:52`).

## What diverged from the plan (post-plan requests, 2026-08-25)

### 1 — Anchor nav — removed (commented)

Plan §1.1 specified a thin pill bar `Lead — Plan — Offer — Dates — Pricing — Payment` with `IntersectionObserver` scroll-spy. On 2026-08-25 the request was to remove it ("it's unnecessary, just comment it").

**Implementation**: `features/memberships/sale/components/sale-anchor-nav.tsx` was kept in the tree for quick re-enable. Its import and mount in `features/memberships/sale/page.tsx:6` and `page.tsx:35` are commented out with the note `// commented per request — uncomment when anchor nav needed`. No route or behaviour change; the component remains tested-by-presence for the next phase that may want it (e.g. when the form grows to 12+ fields again).

### 2 — Plan + Offer in one flex row

Plan originally stacked `Plan` and `Offer` as two full-width cards (sequential `gap-4`). Request: "The plan, and offer should be flexed in single row."

**Implementation**: both cards are now wrapped in `grid gap-4 sm:grid-cols-2` (`page.tsx:56`). At `<sm` they stack; at `≥sm` they sit side-by-side (two-up vocabulary grouping — natural since `Offer` is filtered by `Plan`). Mirrors the existing catalog's two-up pattern and keeps the page shorter.

### 3 — Dates + Pricing in one flex row

Same request extended on the next turn: "Dates & pricing should be in single row flexed."

**Implementation**: `SaleSectionCard id="dates"` (`step 4`) and `id="pricing"` (`step 5`) are now wrapped in `grid gap-4 sm:grid-cols-2` (`page.tsx:81`). Same `sm` breakpoint. Justification matches Plan|Offer: both are short, coupled (plan duration drives end date, which neighbours base price), and side-by-side reduces vertical travel before reaching Payment.

### 4 — Submit below the Order Summary card

Plan §1.1/§1.3 placed a placeholder submit bar at the **bottom of the left column** (`previous page.tsx:110` — `flex items-center justify-between border bg-card px-5 py-4`). Request: "The submit button should be below the preview `Order Summary` card."

**Implementation**:
- Desktop (`≥lg`): the left-column bar was **removed**. A `Button w-full gap-1.5` with `Sell & invoice` (Sparkles icon) now lives inside the **sticky right column**, directly below `<OrderSummary />` inside the `sticky top-[72px] flex flex-col gap-4` stack (`page.tsx:114`). CTA scrolls with the preview.
- Mobile (`<lg`): the right column is `hidden lg:block`, so a separate `Button w-full lg:hidden` is rendered **below the payment card** in the left column (`page.tsx:112`). The bottom summary bar (`lg:hidden` sticky footer at `page.tsx:136`) remains as the Tally-style mini totals + `Review totals` scroll action. Both buttons are `disabled` in this scaffold phase (validation arrives in phase 07).

## Route, navigation & entry points (as shipped)

- **Route**: `AppRoutes.tsx:14` imports `MembershipSalePage` from `features/memberships/sale/page` and registers **two paths** (`AppRoutes.tsx:73`):
  ```tsx
  <Route path="memberships/sale" element={<MembershipSalePage />} />
  <Route path="memberships/sell" element={<MembershipSalePage />} />
  ```
  Primary is `/memberships/sale` (matches the new header title); `/memberships/sell` is kept as an alias to preserve the earlier plan link.
- **Header title**: `PageHeader title="Membership Sale"` (`page.tsx:24`) — updated from `Sell membership` per the 2026-08-25 header rename in `plans/membership-sale-form/01-ia-and-layout.md:14`.
- **Dashboard** (`features/dashboard/pages/DashboardPage.tsx:13`): the `New Membership Sale` quick-action now `navigate('/memberships/sale')` instead of opening the legacy `MembershipSaleDialog`. The dialog's local state/import was removed (`DashboardPage.tsx:25`).
- **Memberships list** (`features/memberships/pages/MembershipsPage.tsx:11`): `PageHeader` now takes `actions={<Button onClick={() => navigate('/memberships/sale')}><Plus/> New Membership Sale</Button>}` (`MembershipsPage.tsx:47`). Mirrors `PlansPage.tsx:53` (`New plan`) pattern.

## File tree (this phase only)

```
src/renderer/src/features/memberships/sale/
├── page.tsx                         # route shell — header, grid, card rows, submit placement
└── components/
    ├── sale-anchor-nav.tsx          # kept, commented out (re-enable by uncommenting page.tsx:6 + :35)
    ├── sale-section-card.tsx        # reusable Card wrapper (step badge + description + dashed placeholder)
    └── order-summary.tsx            # Tally-style totals card (§1.2) + sr-only live region
src/renderer/src/
├── AppRoutes.tsx                    # + memberships/sale + alias memberships/sell
└── features/
    ├── dashboard/pages/DashboardPage.tsx   # navigate instead of dialog
    └── memberships/pages/MembershipsPage.tsx # + New Membership Sale button
```

## Visual details shipped

- Cards: `rounded-2xl border bg-card shadow-sm`, `CardHeader px-5 py-4`, helper text `text-xs text-muted-foreground` (`sale-section-card.tsx`).
- Sticky summary: `sticky top-[72px]` (`page.tsx:121`), so it survives the 6-section scroll. Placeholder rows for `Base → Discount → Tax/RegFee → Final (bg-muted/50) → Paid → Due/Change`.
- Mobile footer: `sticky bottom-0 z-20 border-t bg-card shadow-[0_-4px_12px_rgba(0,0,0,0.06)] lg:hidden` (`page.tsx:136`).
- All placeholder bodies are `rounded-xl border-dashed bg-muted/20` with `text-xs text-muted-foreground` — clearly scaffold, not shippable inputs.

## Verification

- `npm run typecheck:web` — no new errors from `features/memberships/sale/*` (pre-existing finance `allocation-section.tsx` errors remain, unrelated).
- `npm run lint` — no new `eslint` errors from the 3 sale components / page.
- Manual: visit `/` → Dashboard `New Membership Sale` → lands on `/memberships/sale` with `Membership Sale` header; `/memberships` → `New Membership Sale` → same route; `Plan|Offer` and `Dates|Pricing` flex side-by-side at `≥sm`; submit visible below summary on desktop, below payment on mobile; bottom bar scrolls to pricing.

## Known gaps (to be closed by later phases)

- No real inputs, validation, or TanStack wiring — phase 07.
- `OrderSummary` values are `—` placeholders — phases 03/05 bind live pricing.
- `SaleAnchorNav` commented — phase that grows the form may re-enable it.
- `MembershipSaleDialog` file `features/dashboard/components/membership-sale-dialog.tsx` is still on disk (unused from dashboard); kept for reference until the sale page fully replaces it, then delete.
