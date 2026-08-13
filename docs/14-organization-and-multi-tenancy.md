# Module 14 — Organization & Multi-Tenancy Readiness

**Bounded context:** cross-cutting root — every other module's data now hangs off this one.
**Depends on:** nothing (it's the anchor).
**Feeds into:** literally every module (01–13). This module doesn't add new business behavior; it adds a **scoping dimension** to all existing behavior.

## Why you're right to add this now, even though v1 has exactly one organization

This is the correct moment to add it. Retrofitting a tenant/organization boundary into a schema *after* dozens of tables exist without one is one of the most expensive refactors a CRM-style product can go through — every query gains a new `WHERE org_id = ?`, every foreign key gains a sibling column, and every place that "obviously" only ever had one organization now has to be audited for leaks. Doing it structurally at day one, even for a single-organization offline install, costs almost nothing and buys you the option to become multi-tenant later without a rewrite.

Think of it as **"single-tenant deployment of a multi-tenant-shaped schema"** — not "single-tenant schema we'll multi-tenant later."

## The core concept: Organization

An **Organization** is the top-level business entity the software is being run for — in your case, one gym (or gym chain, later). Everything else — People, Leads, Customers, Memberships, Plans, Offers, Invoices, Payments, Staff/Users — belongs to exactly one Organization.

```text
Organization
  id
  slug                    unique, e.g. "fitzone-aurangabad"  — see below, this is how a
                           user or a login screen *identifies* which org to talk to
  name                    e.g. "FitZone Aurangabad"
  legal_name              for invoicing/tax purposes, may differ from display name
  billing_email           the address *you* (the software provider) bill this org at
  timezone
  currency                e.g. INR
  created_at
  status                  ACTIVE / SUSPENDED / TRIAL   (future: for your own SaaS billing)
  plan_tier               [future] which pricing tier of your CRM this org is on
```

**Why a `slug` field now, on top of the numeric `id`?** A slug is a short, unique, human-typeable identifier (`fitzone-aurangabad`) rather than an opaque internal id. It's the thing a login screen, a URL, or a support conversation ("go to fitzone-aurangabad.yourapp.com" or "enter your organization code: FITZONE") would use to say *which organization* someone means — the numeric `id` stays purely internal. This becomes important the moment a User can belong to more than one Organization (see Module 15's revised identity model below): the app needs a stable, user-facing way to say "log into *this* one," and an internal auto-increment id is not that.

Notice the last two fields are not about the gym's members — they're about **your relationship with the gym as your customer**, once this product is offered to multiple gyms. That's a deliberate, useful distinction:

```text
"Customer" (Module 02)   = a person who joined THIS gym
"Organization"           = the gym itself, which is YOUR customer as the software vendor
```

Don't conflate these two meanings of "customer" — they live at different layers and will confuse everyone (including future-you) if merged.

## What changes in every other module

Every table introduced in Modules 01–13 gains an `organization_id` column, and every query gains an implicit `WHERE organization_id = :current_org`. Concretely:

```text
leads.organization_id
customers.organization_id
membership_plans.organization_id
offers.organization_id
memberships.organization_id
invoices.organization_id
payments.organization_id
```

Nothing else about those modules' business rules changes. A Lead is still a Lead, a Freeze is still recorded the same way — it's simply now scoped underneath an Organization, the same way it's scoped underneath a Customer.

**One deliberate exception: `users` does *not* get a plain `organization_id` column.** See Module 15 — a User's relationship to an Organization is now many-to-many (one staff member's login can, in principle, be a member of more than one gym, each with a possibly different role), so that link lives in a separate `organization_membership` join table instead of a single foreign key on `users`. This is the one place where "every table gets `organization_id`" doesn't apply verbatim, and it's worth remembering as the exception, not the rule.

## Worked example: why this scoping matters even with one organization today

```text
Today (v1, single org):
  Organization: "FitZone Aurangabad" (id = 1)
  All customers, leads, invoices carry organization_id = 1
  The UI never shows an org picker — there's only ever one, selected
  automatically at app startup.

Later (if you sell this to a second gym on the same install, or move
to a hosted multi-tenant version):
  Organization: "FitZone Aurangabad" (id = 1)
  Organization: "PowerHouse Nagpur" (id = 2)

  Rahul Sharma (customer of org 1) and a different Rahul Sharma
  (customer of org 2) are two completely separate rows — no risk of
  their data merging, because every query already filters by
  organization_id. No schema migration was needed to reach this
  point; the boundary was there from day one.
```

## Technical decision, explained intuitively

**Why `organization_id` on every table instead of, say, a separate SQLite database file per organization?**
Both are legitimate multi-tenancy patterns (row-level scoping vs. database-per-tenant), but for *this* application the row-level approach is the better fit: it's simpler for a single offline installation (one file, one connection, no juggling multiple SQLite files), it makes cross-organization reporting trivial if you ever build an admin view across your gym customers, and it's the pattern that scales cleanly if you eventually move to a hosted multi-tenant server with one shared Postgres/SQLite-per-tenant-later decision still open. Database-per-tenant becomes attractive only once you have many large tenants with strict data-isolation/compliance requirements — not the case here yet.

**Why does an offline single-org installation need an `organization_id` column at all, if there's only ever one row in the `organizations` table?**
Because the *code* shouldn't know that. If application logic is written as "there's only one org, so I can skip the filter," then the day you do add a second org (or centralize multiple installs into one hosted backend), every single query in the codebase needs to be found and fixed. If the filter is *always* present — even when it's filtering against a single-row table — turning on multi-tenancy later is a data change, not a code change. This is the same "make the rare case configurable, not hard-coded" principle used for Lead Stage (Module 01) and Freeze policy (Module 02), applied at the schema's root.

**How does Organization creation actually work in v1?**
On first launch, the app runs a setup wizard: the user enters gym name, currency, timezone, and possibly an initial Owner/Admin user (see Module 15). This creates the single Organization row and the first User row, both silently referencing each other. There is no "create another organization" UI exposed to the gym staff in v1 — that capability is reserved for a future admin/back-office tool that *you*, the software provider, would use to provision new gym customers, not something the gym's own front-desk staff ever sees.

## What NOT to build yet (matches Module 12's philosophy)

- No organization switcher UI (there's only one to switch to).
- No cross-organization admin console — that's a separate future product surface for you as the vendor, not part of this gym-facing app.
- No per-organization feature flags/billing tiers — the `plan_tier`/`status` fields above are placeholders worth reserving in the schema, not something v1's UI needs to act on.

---
