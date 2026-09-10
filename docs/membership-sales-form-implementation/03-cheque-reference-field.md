# Cheque reference field in the membership sale form

## Change summary

When the operator selects **CHEQUE** as the payment type in the Order
Summary (right column of the Memberships → Sale page), an **optional**
"Cheque number" text field appears directly below the Payment Type dropdown.
The value is informational only and never blocks the sale.

If a number is entered, it is persisted to the created payment's
`reference` column, so it appears on the payment receipt PDF (`Ref:` line,
already wired in `src/main/application/pdf.ts`) and in payment records.
The field is invisible for every other payment method.

## Decision

Persist to `payments.reference` (existing nullable text column, documented as
"UTR / cheque no.") rather than keeping it UI-only or adding a dedicated
`cheque` column, per the schema in `docs/05-payments-and-finance.md` and the
existing `record-payment` dialog which uses the same column for the same
purpose (`placeholder="UTR / cheque no."`).

## Files touched

- `src/shared/contracts/membership-sale.ts`
  - Added `reference: z.string().max(200).nullable().optional()` to
    `sellMembershipInputSchema`.
- `src/main/application/memberships.ts`
  - Payment insert in `sellMembership` now persists `input.reference ?? null`.
    (The identical-looking insert in `renewMembership` is intentionally left
    unchanged — that contract has no reference field.)
- `src/renderer/src/features/memberships/sale/components/order-summary.tsx`
  - New props `chequeNumber?: string` / `onChequeNumberChange?`.
  - Conditional field rendered only when `paymentMethod === 'CHEQUE'`
    (max length 200, monospace styling to match the money inputs).
  - Replaced the inline `PAYMENT_METHODS` array with the shared
    `@/lib/payment-methods` vocabulary.
- `src/renderer/src/features/memberships/sale/page.tsx`
  - New `chequeNumber` form field, wired through to `OrderSummary`.
  - On submit: `reference: paymentMethod === 'CHEQUE' ? chequeNumber.trim() || null : null`.

## Rules enforced

- Optional: no validation, no required-marker, no submit gating.
- Reference is only sent for CHEQUE sales (trimmed, empty → `null`).
- UI mirrors the existing label-above-input + `grid gap-1.5` field pattern in
  the card (`docs/form-implementation-guideline.md`).

## Tests

- `tests/main/application/memberships.test.ts` — CHEQUE sale persists
  `payments.reference`; non-cheque sale stores `null`.
- `tests/renderer/order-summary.test.tsx` — field renders only for CHEQUE,
  and typing reports through `onChequeNumberChange`.
- `tests/shared/contracts.test.ts` — optional reference accepted, >200 chars
  rejected.

Run `npm test`, `npm run lint`, `npm run typecheck` to verify.