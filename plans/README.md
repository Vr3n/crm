# Plans

This folder holds the outputs of a `/grilling` + `/domain-modeling` session on the
identity/tenancy layer. These are **plans and decisions** — review them here to see the
reasoning behind the spec, separate from the normative `docs/` modules.

## Files and the modules they map to

| File | Ties to | What it captures |
|------|---------|------------------|
| `CONTEXT.md` | Modules 14 & 15 (cross-cutting) | Canonical glossary: Organization, User, OrganizationStaff, Role, Permission, Super role, Organization Context |
| `docs/adr/0001-global-user-organization-staff.md` | Module 15 | Global User identity + org-scoped join (OrganizationStaff), replacing `users.organization_id` |
| `docs/adr/0002-row-level-organization-scoping.md` | Module 14 | Every business table carries `organization_id`; row-level scoping over database-per-tenant |
| `docs/adr/0003-rbac-permissions-as-data-with-super.md` | Module 15 | Permissions-as-data, `is_super` for Owner/Admin, enforced at the Command layer |

## Relationship to `docs/`

The `docs/` modules are the normative specification. This folder records *why* those
decisions were made and the canonical vocabulary, so the two stay distinguishable:
read `docs/` to implement, read `plans/` to understand and review.