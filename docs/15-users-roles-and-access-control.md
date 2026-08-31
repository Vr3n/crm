# Module 15 — Users, Roles & Access Control (RBAC)

**Bounded context:** cross-cutting — identity and permissions layer.
**Depends on:** Module 14 (every User belongs to one Organization).
**Feeds into:** every module that has a UI action — this module decides *who is allowed to trigger which Command* (Module 06).

## Revision: User identity is global, not per-organization

The first pass of this module assumed a User belongs to exactly one Organization (`users.organization_id`). That assumption doesn't hold once you consider a realistic case: a consultant/manager who oversees two gym locations under different organizations, or — more importantly for where this product is heading — the same person's login credentials being reusable if you ever run a hosted version where one operator manages multiple franchise locations. So this module now models **identity and organization-membership as two separate things**, the same "don't conflate stable identity with a changeable relationship" principle Module 02 used for Customer vs. Membership.

```text
User             = a login identity, global to the whole application (not scoped to one org)
Organization     = the tenant (Module 14), identified to a human by its slug
OrganizationStaff = the record that a given User belongs to a given Organization, with a Role there
Role             = a named bundle of permissions, scoped to one Organization
```

**How a User is identified, concretely: `(organization_slug, email)`, not email alone.**
Email addresses are not guaranteed unique across the whole application the way they'd need to be for a single global `email` column — the same person's email could plausibly need to sign in under two different organizations with two different memberships, and more practically, login should always happen *in the context of an organization* (the user knows which gym they work at and types/selects it), not as a blind global email lookup that then has to disambiguate "which of your 3 organizations did you mean?" after the fact. So the actual unique login key is the **pair** (organization's slug, email) — uniqueness is enforced on `(organization_id, email)`, not on `email` globally. The same email can appear under two different organizations as two logically distinct memberships; whether those two memberships resolve to the *same* underlying User row (true global identity) or two separate User rows is an implementation choice — see the schema and worked example below for the recommended shape.

## Recommended shape

```text
User
  id
  email                   NOT globally unique — see below
  password_hash
  full_name
  status                  ACTIVE / DISABLED
  created_at

Organization
  id
  slug                    unique (Module 14) — e.g. "example-gym-aurangabad"
  ...

OrganizationStaff    (this is the join that replaces users.organization_id)
  id
  organization_id
  user_id
  role_id
  status                  ACTIVE / INVITED / DISABLED   — per-org, independent of user.status
  joined_at
  UNIQUE (organization_id, user_id)

  -- the login-identifying uniqueness constraint actually lives here:
  UNIQUE (organization_id, user_email)   -- practically enforced by joining
                                          -- User.email through this table, scoped
                                          -- per organization_id

Role
  id
  organization_id         roles are scoped to one org (a gym can customize its own roles)
  name                    e.g. "Sales", "Front Desk", "Finance", "Manager", "Owner", "Admin"
  is_system_role          true for the built-in roles shipped with the app (Owner, Admin)
  is_super                true for Owner/Admin — grants all Permissions without enumerating them
  description

Permission
  id
  code                    e.g. "lead.create", "invoice.finalize", "payment.record", "membership.freeze"
  description

RolePermission             (many-to-many: which permissions a role grants)
  role_id
  permission_id
```

Notice `Role` still hangs off `organization_id` directly (Module 14's normal rule applies there) — it's specifically `User` that breaks the "every table gets organization_id" pattern, because a User's tie to an Organization is now expressed through `OrganizationStaff`, which is where the Role assignment lives too. `UserRole` as a standalone table is gone; OrganizationStaff *is* the role assignment (one role per OrganizationStaff row keeps this simple for v1 — see the note on multi-role below).

This is still a standard RBAC shape underneath — **Users hold Roles (via OrganizationStaff, per Organization), Roles hold Permissions, code checks Permissions — never role names directly** — just with the identity/tenancy join made explicit instead of assumed. Owner and Admin are the two system roles; both are marked `is_super`, which short-circuits the permission check so their access is all-encompassing without enumerating every Permission code (see the starter-roles note below for how they differ from each other).

## Worked example: your exact scenario, modeled

```text
Organization: Example Gym Aurangabad (id = 1, slug = "example-gym-aurangabad")

User: Neha  (id=100, email="neha@example.com")
User: Arjun (id=101, email="arjun@example.com")
User: Kavita(id=102, email="kavita@example.com")
User: Owner (id=103, email="owner@example.com")

OrganizationStaff:
  (org=1, user=Neha,  role="Sales")
  (org=1, user=Arjun, role="Front Desk / Caller")
  (org=1, user=Kavita,role="Finance")
  (org=1, user=Owner, role="Owner")

Role "Sales" (org=1) grants: lead.create, lead.view, lead.update_stage,
  lead.record_activity, followup.create, followup.complete,
  membership.sell (creates conversion + membership + invoice atomically)

Role "Front Desk / Caller" (org=1) grants: lead.view, lead.record_activity,
  followup.create, followup.complete
  (notice: NOT membership.sell — Arjun can log calls and follow-ups,
  but cannot close a sale or touch billing)

Role "Finance" (org=1) grants: invoice.view, invoice.finalize,
  payment.record, payment.allocate, refund.create, credit.create,
  finance.dashboard.view  (notice: NOT lead.* — Kavita has no reason
  to see the sales pipeline)

Role "Owner" (org=1) is_super: * (all permissions in this organization)
```

When Neha logs in (see login flow below), the UI shows the Leads/Sales pipeline and a "Sell Membership" button. When Arjun logs in on the same computer, he sees the Leads pipeline too (he needs to log activities) but there is no "Sell Membership" or billing screen visible to him — not just hidden by convention, but rejected at the command layer if somehow triggered, per the rule below.

**Now the multi-org case, made concrete.** Suppose next year you sell this software to a second gym, and the Owner of Example Gym also personally runs that second gym:

```text
Organization: PowerHouse Nagpur (id = 2, slug = "powerhouse-nagpur")

OrganizationStaff:
  (org=2, user=Owner (id=103), role="Owner")   -- same User row as above
```

`Owner` (user id 103) now has two `OrganizationStaff` rows — one per gym, each with its own Role. One login identity, two separate tenant relationships, no duplicated user account, no data leakage between the two gyms' Leads/Invoices/Customers (Module 14 still filters every business table by `organization_id`).

## Auth context: what actually changes in the login flow and the session

This is the concrete consequence the shift to global-User-identity has on the rest of the system, worth spelling out explicitly since it affects how every screen gets its data:

```text
OLD (single-org-per-user) login:
  User enters email + password
  → look up User by email (globally unique)
  → session = { user_id, organization_id }   (organization_id was fixed, taken from the user row)

NEW (slug + email) login:
  User enters organization slug (or picks it from a short list if the app
  remembers past logins on this machine) + email + password
  → look up OrganizationStaff by (organization.slug = X, user.email = Y)
  → verify password against the resolved User row
  → session = { user_id, organization_id, membership_id, role_id, permissions[] }
```

The session/auth context now carries an explicit **"active organization"** alongside the user identity — every downstream Command handler (Module 06) reads `organization_id` from *this session context*, not from a fixed column on the user row, and stamps it onto every record it creates. If a User ever holds memberships in two organizations, switching between them is a session-level "switch active org" action (re-resolve `OrganizationStaff` for the same user, different org) rather than a full re-login with different credentials — but note **v1 doesn't need to build that switcher UI at all**, since v1 only ever provisions one organization per installed instance. The schema simply doesn't block you from adding it later.

**What this means for offline v1, practically:** the setup wizard (Module 14) still creates exactly one Organization and one Owner User+Membership pair on first install, and the login screen can auto-fill/hide the slug field entirely since there's only one organization on this machine. Nothing about the day-to-day experience for a single-gym install gets more complicated — the extra flexibility is dormant schema/session shape, not dormant UI complexity.

## Technical decision, explained intuitively

**Why check fine-grained Permissions (`payment.record`) in code, instead of checking Role names (`if (user.role === 'Finance')`) directly?**
Because role *definitions* will change — a gym owner might decide Front Desk staff should also be allowed to record cash payments, or split "Sales" into "Junior Sales" and "Senior Sales" with different limits. If the codebase is littered with `if (role === 'Sales')` checks, every such change requires hunting down and editing code. If the codebase only ever asks "does this user have `payment.record`?", then re-configuring who has that permission is a data change (edit the RolePermission table, possibly via an admin UI), not a code change. This mirrors the exact same reasoning Module 01 gave for Lead Stage and Module 14 gave for Organization scoping: **push variability into data, keep code stable.**

**Why enforce permissions at the Application/Command layer (Module 06), not just by hiding buttons in the React UI?**
Hiding a button is a UX nicety, not security — anyone with basic dev tools access could still trigger the underlying IPC call if nothing checks permissions server-side (in this app's case, "server-side" means the Electron main process / application layer). The rule from Module 06 — *every command goes through the Application Service before touching the Domain* — is exactly where the permission check belongs: `RecordPaymentCommand` handler checks "does the current user have `payment.record`?" before doing anything else, every single time, regardless of which screen the request came from. The React layer hiding the button is a nice-to-have on top of that, not a substitute for it.

**Why is `created_by` / `recorded_by` a User reference on almost every domain record from Modules 01–05 (Lead Activity, Payment, Freeze, Refund), rather than optional?**
Because "who did this" is exactly the kind of accountability question a gym owner will ask constantly ("who recorded this payment as cash when it should've been UPI?", "who applied this discount?"). Since Module 06 already mandates every Command records an audit trail, tying that trail to a real User row (not a free-text name) means you get accurate answers automatically, and it plugs directly into this module's RBAC model — you always know not just *that* someone with Finance permissions recorded a payment, but *which* Finance staff member specifically.

**Why allow a User to belong to more than one Organization at all, if v1 only ever has one org per install?**
Because forbidding it at the schema level (a hard `users.organization_id` column) is the exact mistake this module corrected — it would mean the day a real multi-org need appears (an owner running two locations, or a hosted multi-tenant deployment), the fix is a schema migration touching every row, not a data change. Allowing it at the schema level costs one join table (`OrganizationStaff`) and doesn't add any risk today: for a single-organization install, every user simply has exactly one membership row, and the app never shows an org switcher. The flexibility is free to have and expensive to retrofit — same logic as Module 14's `organization_id`-everywhere rule.

**Doesn't allowing multi-org membership risk a staff member accidentally seeing another gym's data?**
No — the risk that matters is not "can a User row have two memberships," it's "does every query correctly scope by the *active* `organization_id` from the current session." That discipline (Module 14) is unconditional regardless of how many memberships a User has. Neha at Example Gym never accidentally sees PowerHouse Nagpur's leads because her session's `organization_id` is Example Gym's, full stop, for the entire duration of that login — a second membership row for a different org would require an explicit, separate "switch organization" action that re-establishes a new session context, not something that happens implicitly mid-session.

## Recommended starter roles (seed data, not hard-coded logic)

```text
Owner          — the org's root account; is_super, cannot be deleted or demoted; can manage Admins,
                 user/role management, org settings, backup/restore
Admin          — is_super; can manage users, roles, and org settings, but can be demoted/removed by Owner
Manager        — full access to Sales, Membership, Billing, Finance, Reporting; no org settings, no user management
Sales          — Leads, Follow-ups, Activities, Membership sale/conversion
Front Desk     — Leads (view/activity/follow-up only), Customer lookup, check-in [future], no billing
Finance        — Invoices, Payments, Refunds, Credits, Finance dashboards; no Lead pipeline access
```

**Owner vs. Admin.** Both are system roles (`is_system_role = true`, so they can't be renamed or deleted) and both are `is_super`. The distinction is *root* vs *super-admin*: **Owner** is the organization's root account — it cannot be removed or demoted, and only it can manage Admins and the org's identity/tenancy settings. **Admin** holds the same super access for daily operation (manage users, roles, and org settings) but can be demoted or removed by the Owner. Every other seeded role is ordinary: editable, deletable, and its permission set is expressed as explicit RolePermission rows rather than `is_super`.

These are seeded on Organization creation (Module 14's setup wizard) as editable data, not compiled into the application — an Owner should be able to rename a role or adjust its permission set from a settings screen without a developer involved, consistent with this module's core "permissions are data" decision above.

---
