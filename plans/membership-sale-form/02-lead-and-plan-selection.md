# 02 — Lead & Plan Selection

## 2.1 — Lead section (required)

### Control choice — AutocorrectCombobox

**Why**: `Q34` "Auto correct combobox is better UI" + `docs/implementation-details/leads-pipeline.md:150-195` production precedent: Source / Plan-interest / Goal all use `AutocorrectCombobox` with `search*` endpoints (`LIKE`, capped 20, debounced, `canCreate` gated). Reusing it gives free-text-aware search, inline creation, and consistent `reference-data.ts` caching. A virtualized table was rejected — leads are found by name/phone fragments, not by scanning a paginated list.

### Behaviour

- **Query**: `leads:searchLeads` (new read model — extend `src/main/application/leads.ts` query side only for this plan). Params `{query: string, limit: 20}`. Backend: `WHERE organization_id=? AND (people.full_name LIKE %q% OR people.phone LIKE %q%) AND leadStages.active=1` order by `updated_at DESC`. `queryOptions` key `['autocorrect-options','lead',query]` with `staleTime 30_000` (scoped per field so plan/offer caches don't bleed — `leads-pipeline.md:194` pattern).
- **Empty helper**: "Search by name or phone" + `Create new lead` ghost button always visible (opens `new-lead-dialog.tsx` via `React.lazy + Suspense fallback={null}` — `form-implementation-guideline.md:75`).
- **Duplicate-phone guard** (`Q8`): phone `UNIQUE(org, phone)` at `sales.ts:31`. If the inline `new-lead-dialog` submit throws `ConflictError`, intercept in the sale page (don't auto-close). Show **Duplicate Lead modal** (this form's `duplicate-lead-modal.tsx`):
  > Phone `1234567890` already belongs to **John Doe** — Lead #42 · Stage NEGOTIATION · Owner Priya. [Select existing lead] [Keep editing]
  Selecting fills `leadId` and closes modal.

- **Post-selection preview**: under the combobox, a compact identity card (`docs/implementation-details/leads-pipeline.md:223` style): avatar letter, `full_name · phone` (masked), `email`, `stage` chip, and if `customers` row exists for that `person_id` → `Recurring · N memberships · last plan Yearly` pills (from a lightweight `leads:leadCustomerSummary` read). No other auto-fill — loyalty context only.

- **Validation**: field `leadId: number | null`, `required`. Live evaluation per `form-implementation-guideline.md:18-24`: red `aria-invalid` when `touched||submitted` and empty; green `data-valid` on `leadId>0` + `CheckCircle2` in the reserved helper line. Guard `if(v!=='') field.handleChange(Number(v))` if the combobox returns string ids (`leads-pipeline.md:145` Radix guard pattern generalized).

- **Permissions**: creation gated on `lead.create` (`can()` check), but viewing/search is `lead.view`. Hidden creation button is UX only — backend re-enforces (`docs/implementation-details/leads-pipeline.md:173`).

### A11y

- `Label "Member (Lead) *"` with `aria-describedby` hint `"Search existing people or create a new lead"` and error id.
- Combobox uses `aria-expanded`, focus moved into input on expand (`ecomdesignpro` progressive disclosure pattern).

---

## 2.2 — Plan section (required)

### Control choice — AutocorrectCombobox (again)

**Why**: plans are reference data with the same growth dynamics as sources (`catalog.ts:13-60`). Searching by name with inline creation mirrors the lead field and keeps the page's interaction vocabulary to one pattern. A table picker was rejected — plan list is <100 items, search is faster than scanning.

### Behaviour

- **Query**: `catalog:searchPlans` (new) — `WHERE organization_id=? AND active=1 AND name LIKE %q%` order `name`, limit 20. Cache key `['autocorrect-options','plan',query]`.
- **Caption on select**: `₹10,000 · QUARTERLY (90 days) · Tax 18% · Reg fee ₹500` built from `membershipPlans.base_price_minor / tax_rate_bps / registration_fee_minor` (`catalog.ts:26-39`). Shows immediately under combobox.
- **Seeding + override affordance** (`Q11` "Plan will just help us set initial amount… comparison from selected plan and sold membership"):

  On select: seed `basePriceRupees = plan.base_price_minor/100` (formatted `10,000`), `durationDays`, `tax_rate_bps`, `registration_fee_minor`. Keep `planId` FK. Then allow edits to `basePrice`, `discountAmount`, `tax`, `regFee`, and even `endDate` independently. Track a `planDirty` flag: if any of those diverge, show badge `Edited — differs from plan · ₹12,000 → ₹10,800 (−10%)` with a `Reset to plan` link that rewrites seeded fields. This satisfies "snapshot comparison" for later membership history (`docs/03:33`).

- **Create Plan inline**: `plan-dialog` (the existing catalog `plan-dialog` if present; otherwise the plan form from `docs/implementation-details/billing-forms.md` / `catalog-plans-and-lead-fk.md`) opened via lazy import. On creation, invalidate `['autocorrect-options','plan']` so the new plan appears.

- **Validation**: `planId` required (changed from optional per `Q10` to honour `memberships.plan_id NOT NULL` at `membership.ts:62` — making it optional would require a migration or a synthetic "Custom" sentinel, rejected). Error `"Choose a plan"` on `touched||submitted`.

- **OTel / caching**: same standalone cache as leads — lead mutations don't refetch plan options (`form-implementation-guideline.md:81-83`).

### Layout

- Card grouping keeps Lead and Plan as the two anchoring choices at the top; both are two-up on `sm` via `grid gap-3 sm:grid-cols-2` only if a future design adds a side field — current single column keeps scan order linear.

### References

- `plans/membership-form-querstions-solutions.md:7-11` (offer=FK, plan required, override flexibility).
- `docs/03-catalog-and-offers.md:9-33` (catalog mutability + snapshot principle).
- `docs/implementation-details/leads-pipeline.md:150-195` (AutocorrectCombobox backend + renderer patterns).
- `src/main/db/schema/catalog.ts:13-60` (plan columns), `membership.ts:51-93` (snapshot fields).
