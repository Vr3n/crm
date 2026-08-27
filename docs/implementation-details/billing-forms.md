# Billing Module — Dialog Forms (Module 04 UI)

Implementation details for the Billing capture/lifecycle dialogs. Grilled and decided in
the `/grilling` session (2026-08-22); glossary additions live in `plans/CONTEXT.md`
(Draft, Invoice Number, Billing Snapshot, Finalization). Follows
`docs/form-implementation-guideline.md` throughout.

## Decisions locked during grilling

1. **VOID = OPEN/PARTIALLY_PAID only.** `docs/module-implementations/billing.md` §4 was
   stale ("DRAFT only") and has been corrected. Abandoned DRAFTs have no terminal state:
   they are kept forever as filterable register rows (no delete command).
2. **Four surfaces**: New Invoice (two-phase), Void, Mark Uncollectible, Edit Billing
   Snapshot.
3. **Two-phase explicit creation**: pick customer → `billing:createInvoice` creates a
   DRAFT → snapshot + line editor operate against the saved draft via one IPC call per
   change → explicit Finalize. No local-only wizard state that can orphan on failure.
4. **Line sources**: manual lines and plan-seeded lines (fields stay editable after
   autofill). Callers may pass `seedPlanId` (e.g. lead conversion) to derive the picked
   plan from the catalog **query** — see "No prefill effect" below.
5. **Manual-line tax defaults to 0** (`tax_rate_bps = 0`); no tax logic in React.
6. **Finalize UX**: confirm dialog shows the *display-only* number preview from
   `billing:nextNumber` (never reserves). Backend assigns the real number in-transaction.
7. **Money entry**: staff type decimal rupees; `rupeesToMinor` (`src/lib/money.ts`)
   parses to integer paise at the boundary. First wrong keystroke errors immediately;
   parsed ₹ value renders in the `labelEnd` slot.
8. **Permissions degrade to disabled + tooltip** naming the missing code
   (`invoice.create`, `invoice.finalize`, `invoice.void`), checked via
   `can(session.permissions, session.isSuper, code)`; the backend re-checks.
9. **Reasons are required free text**, 1–500 chars, matching the Zod contracts.

## New backend surface (was missing)

- `updateBillingSnapshot` (`billing:updateSnapshot`) — DRAFT-only edit of the four
  snapshot fields; never writes back to `customers`. Contract:
  `updateBillingSnapshotInputSchema`.
- `nextInvoiceNumberPreview` (`billing:nextNumber`) — display-only peek at
  `invoice_sequence` (`repo.peekNext`), permission `invoice.view`. Returns
  `{ year, prefix, nextValue, preview }`.
- Read-model unit fix (`src/main/ipc/invoices.ts`): the DB stores paise/bps but the
  renderer read model is documented as whole rupees/percent — `buildInvoiceOutput` now
  converts (`/100`, bps `/100`). Previously amounts displayed 100×.

## Renderer layout

```text
features/invoices/
├── api.ts                                  # reads (invoices.*) + commands (billing.*)
├── queries.ts                              # useDraftInvoice, mutations, useNextInvoiceNumber
├── components/
│   ├── new-invoice-dialog.tsx              # two-phase create + finalize confirm
│   ├── lifecycle-reason-dialogs.tsx        # VoidInvoiceDialog, MarkUncollectibleDialog
│   └── edit-billing-snapshot-dialog.tsx    # DRAFT-only snapshot editor
```

Wiring:

- `InvoicesPage` mounts the New Invoice dialog lazily (`React.lazy` + Suspense, gated by
  `invoice.create`), per the forms guideline's lazy-dialog rule.
- `InvoiceDetailsSheet` footer is now status-aware: DRAFT → Edit billing details;
  OPEN/PARTIALLY_PAID → Record payment / Void / Mark uncollectible; terminal states keep
  the print/email placeholders. Lifecycle buttons disable with a permission tooltip.
- Register filter includes DRAFT (`INVOICE_STATUS_OPTIONS` no longer excludes it).

## The "no prefill effect" pattern

The lead-conversion seed (`seedPlanId`) used to need an effect to copy plan values into
the form once the catalog query resolved. Instead:

- `pickedPlan` is **derived during render**: `manualPlan ?? activePlans.find(id === seedPlanId)`.
- The entry row lives in its own component (`LineEntryForm`) whose TanStack Form
  `defaultValues` come from `lineValuesFromPlan(plan)`; it is mounted with
  `key={pickedPlan?.id ?? 'manual'}` so a late-arriving query result remounts the row
  pre-filled. No `useEffect`, no `setState` in effects (react-hooks lint clean).
- Plan picks/clears are plain event handlers that set `manualPlan`; the key change does
  the reset.

This follows react-patterns "derive during render" and keeps TanStack Query as the only
async data source.

## Money & validation rules (shared)

- `rupeesToMinor(value)`: accepts `"19200"`, `"19200.5"`, `"₹19,200.50"`; rejects >2 dp,
  negatives, non-numeric → `undefined` (caller shows error). Tested in
  `tests/renderer/invoice-money.test.ts`.
- `formatMinor(minor)` / `formatMoneyExact(rupees)`: en-IN formatting with up to 2 dp for
  draft totals inside dialogs (register stays whole-rupee `formatMoney`).
- Quantity/tax validators judge the first keystroke immediately (guideline rule).

## Tests

- `tests/renderer/new-invoice-dialog.test.tsx` — Start-draft gating + numeric customer id,
  Finalize disabled without lines, rupee→paise payload of `addLine`.
- `tests/renderer/invoice-reason-dialogs.test.tsx` — reason required (incl. whitespace-only
  rejection), verbatim reason passthrough for void/uncollectible.
- `tests/renderer/invoice-money.test.ts` — parse/format table.

Note: `form.useStore` doesn't exist in this TanStack Form version — reactive reads use
`useStore(form.store, selector)` from `@tanstack/react-store` (same as the lead dialogs).
Dialog components never read `form.state.*` during render for gating; they subscribe.

## Pre-existing failures (not from this work)

The working tree contains unrelated WIP in leads/sales/finance (`allocation-section.tsx`
has compile errors; leads bulk-follow-up tests fail). Verified those fail on the dirty
tree and pass on a clean HEAD stash — untouched by this feature.
