# 06 — Invoice & PDF

## 6.1 — Invoice number generation (Q24)

### Decision

Configurable per-Organization template (`Q24` "The invoice number generation setting should be added in the Organization, The organization should be able to modify their invoice generation. Default should be `ORG_INITIALS-DDMMYY-INV_ID` e.g. `CRO-250826-01`").

### Default template

```
<CRO>-<DDMMYY>-<SEQ:02>
e.g. CRO-250826-01
where  CRO = upper initials of Organization.name (Crown Vitality → CRO)
        DDMMYY = date when invoice was finalized (not sale start)
        SEQ = per-org, per-day 2-digit sequence (01, 02… 99+ expands width)
```

- Stored on `organizations` row as `invoice_number_template` + `invoice_number_prefix` (derived from initials, editable). Template editable in Organization Settings but not on the sale form — sale form just shows the preview with the resolved number after submit (or a placeholder "CRO-250826-__" before).
- Generation inside the sale transaction uses `invoiceSequence` (`billing.ts:94-108`) scoped `UNIQUE(organization_id, year, prefix)` but now keyed by `(org, DDMMYY, prefix)` per request — or keep `(org, year, prefix)` and derive the day suffix via `last_value` + date bucket logic. Either way, uniqueness is enforced by `invoices.number UNIQUE`; collision throws `INVOICE_NUMBER_COLLISION` and the tx retries once.
- Why not row id: `docs/04-billing-and-invoicing.md:43-45` — human sequential, gap-free, independent of internal row id.

### Alternative considered

Using `INV-2026-000147` (classic `docs/04:22` example) as default was weighed; rejected because the user explicitly wants DDMMYY + initials + 2-digit day sequence for immediate date scan. The setting approach lets either format be chosen without code change — default follows the user's answer.

---

## 6.2 — Invoice lifecycle on this sale

Per `Q23` "happy path should be followed, don't violate Module 05" and `docs/04:79-108`:

- Sale transaction creates `Invoice` in `DRAFT`, adds a single `InvoiceLine` (snapshot: `description` — plan name + date window, `unit_price_minor = base_price_minor`, `discount_minor = discount_minor`, `tax_rate_bps/tax_amount_minor/line_total_minor`, `plan_id/offer_id` reporting refs — `billing.ts:60-88`), then immediately **finalizes** (`DRAFT → OPEN`, assigns `number`, `finalized_at/By`, `subtotal_minor/tax_minor/total_minor` frozen) — all inside the same tx. No separate "finalize" step for this flow.
- Abandoned drafts are never deleted (keep asRows — `docs/04:79` "never deleted"), but this sale has no abandoned branch.

---

## 6.3 — Billing snapshot

`invoices.billing_*` (`billing.ts:29-32`) and `customers.billing_*` (`membership.ts:27-31`) both snapshot at sale: `billing_name/phone/email/address` copied from the Customer/Person row into the invoice at finalize — "edits apply to the invoice only and never write back" (`docs/04:34`). Sale form exposes a small collapsed row "Billing snapshot (from profile)" with hint that editing it here would only affect this invoice (deferred — not editable in v1 of this form; shown read-only for scan).

---

## 6.4 — PDF generation & delivery (Q27-Q29)

### Source of truth

"PDF after finalized invoice + lines + billing snapshot, generate from the APP" (`Q27`) — not from live form values.

### Generation

- Library: `pdf-lib` or `jsPDF` (chosen at build time; either satisfies "generate from the APP" in Electron main where Node fs is available). Template styling follows Tally research: grouped header (org logo + invoice meta), line table, grouped totals (shaded total), payment snapshot, billing snapshot block — keeps GDPR-minimal fields but GST-compliant style.
- Trigger: on `membership.sell` success, main returns `invoiceId + number`. Renderer calls `invoices:downloadPdf({invoiceId})` (IPC). Main: fetch finalized invoice + lines via repository (snapshot data, never live plan price), render PDF buffer, write to `app.getPath('downloads')/<CRO-250826-01>_<FullName>_<ISO8601>.pdf` (`Q28` filename `<generated_invoice_number>_<customer_fullname>_<download_datetime>.pdf`), and reply with file path.

### Delivery UX

- **No preview-in-new-tab** for v1. `Q28` explicitly said "It's electron so download the pdf, and have a windows notification and also the shadcn notification that pdf has been downloaded." So:
  1. Main uses `new Notification({title: 'Invoice downloaded', body: 'CRO-250826-01_Soham Patel_…pdf', silent: false})` via Electron's `Notification` (native Windows toast).
  2. Preload bridges completion; renderer shows a shadcn `toast` `Invoice downloaded — Open folder` with `onAction` → `shell.showItemInFolder(filePath)`.
  3. Filename example: `CRO-250826-01_Soham_Patel_2026-08-25T14-32-10.pdf` (`customer_fullname` with `_`, `download_datetime` `YYYY-MM-DDTHH-mm-ss` local `Asia/Kolkata`).
- **Download folder**: exactly `app.getPath('downloads')` (`Q29` "Just download it in the Downloads folder"), not under `app.getPath('userData')` where the DB lives (`docs/08-persistence-and-electron-architecture.md:50`).

### Post-submit navigation

- Navigation already defined in `01`: membership detail / Tally-invoice page. Detail page has a secondary `Download PDF again` button that re-runs the same IPC path (regenerated from snapshot — idempotent, new filename timestamp, same invoice content).

---

## 6.5 — Permissions & security (deferred but scoped)

- `Q30` "It's conjunction of multiple permissions. We will tackle this later." — plan acknowledges the backend will gate on the set `{membership.create, invoice.create, payment.record}` (or the future `membership.sell` meta-permission). No UI permission logic beyond hiding dev-only action in this plan.
- `Q31` idempotency: main guard + renderer's `LoadingButton disabled` double-submit guard; not designed in this UI phase beyond the button + a client-generated idempotency key.

### References

- `plans/membership-form-querstions-solutions.md:23-29` (happy path, number format, overpay, downloads).
- `docs/04-billing-and-invoicing.md:33-45,79-108` (snapshot, money paise, numbering), `docs/05-payments-and-finance.md:17-36` (credit vs refund, allocations), `docs/06-domain-model-backbone.md:45` (atomic tx), `docs/08-persistence-and-electron-architecture.md:50` (app-data path ≠ install dir, used for downloads vs DB).
- `src/main/db/schema/billing.ts:14-108` (invoice + lines + sequence), `catalog.ts:118-167` (redemptions).
- Tally template research `tallysolutions.com/*`, `help.tallysolutions.com/*` (totals grouping, table layout).
