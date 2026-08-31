# Form Error Surfacing — message-only, convention-aligned

## Problem

Backend errors leak the IPC channel/module string and machine-readable code to
users. Different form dialogs handle errors inconsistently — some only toast,
some only show an inline banner, and backend errors never attach to the input
they belong to. There is no shared error-message helper; raw `e.message` flows
into toasts across finance, identity, invoices, and membership-sale, risking
the Electron `Error invoking remote method '…': DomainError: …` string
reaching the UI.

## Design convention (professional / a11y standard)

- **Field validation errors → inline under the input.**  
- **Form/server errors → persistent banner + toast.**  
- **Message only.** Never render `error.code`, IPC channel names, or
  `DomainError` class names. Branch on `error.code` in code (ADR-0006);
  render `message` to users.

This maps onto the app's existing pattern: `new-lead-dialog.tsx` already
shows a message-only `role="alert"` banner.

## Scope

All capture forms and dialogs that submit to a backend mutation.

## Plan

### Phase A — Message-only helper + toast standardization

**New** `src/renderer/src/lib/errors.ts`:

```ts
export function getErrorMessage(err: unknown, fallback: string): string
```

- Returns `err.message` when `isApiError(err)` (from
  `shared/contracts/errors`).
- Returns `fallback` for every other error — never the raw Electron
  serialization string.

**Edit** mutation `onError` handlers to use it:

| File | Change |
|------|--------|
| `features/leads/queries.ts` | Delete local `errorMessage`; import shared helper |
| `features/finance/queries.ts:78` | `toast.error('Something went wrong', { description: getErrorMessage(e, fallback) })` |
| `features/identity/queries.ts:50` | Same |
| `features/invoices/queries.ts:96,115,130,167` | Same |
| `features/memberships/sale/queries.ts:20-23` | `toast.error(getErrorMessage(e, 'Could not sell membership'))` |
| `features/catalog/queries.ts:87,103,118,132,148,162` | Surface the real message (currently swallowed) |

### Phase B — Reusable header banner

**New** `src/renderer/src/components/ui/form-error-banner.tsx`:

Extract the `role="alert"` block from `new-lead-dialog.tsx:215-223` into
a reusable component.

**Edit** each mutating form to render `<FormErrorBanner message={…} />`
at the top of the form body, derived from its mutation's `.error` via
`getErrorMessage`:

- Leads: `new-lead-dialog`, `edit-lead-dialog` (swap inline banner),
  `mark-lost-dialog`, `log-activity-dialog`, `move-stage-dialog`,
  `follow-up-dialog`, `edit-follow-up-dialog`, `bulk-move-stage-dialog`,
  `bulk-follow-up-dialog`, `bulk-activity-dialog`
- Finance: `record-payment-dialog`, `add-credit-dialog`,
  `issue-refund-dialog`
- Identity: `org-edit-dialog`, `add-staff-dialog`
- Invoices: `new-invoice-dialog`, `edit-billing-snapshot-dialog`,
  `lifecycle-reason-dialogs`
- Catalog: `plan-form-dialog`, `offer-form-dialog`
- Membership sale: `memberships/sale/page.tsx` (swap `serverError`
  banner)

### Phase C — Field-level attachment (input it belongs to)

- **Client validation** already renders field errors inline via
  `Field`/`FormField` — no change needed.
- **Backend field-mappable errors** (phone dedup): add a renderer-side
  `code → field` map in `new-lead-dialog` and `edit-lead-dialog`
  (`CONFLICT → 'phone'`), feeding the existing `extraError` prop on the
  phone `FormField`. No backend change.

### Phase D — Tests + docs

- Unit test `getErrorMessage`: returns `message` for `ApiError`, fallback
  otherwise, never code/module.
- Extend `tests/renderer/new-lead-dialog.test.tsx:252`: assert
  message-only text, and presence in banner + phone field + toast.
- Add `docs/form-error-surfacing.md`.

## Verification

`npm test`, `typecheck` (node + web), `lint`.

## Deferred (v1.1+)

- Backend `field` hint on `IpcError` + `ErrorField` shared catalog +
  ADR amendment.
- Multi-field `fields[]` errors.
- Global sanitization beyond `getErrorMessage`.
