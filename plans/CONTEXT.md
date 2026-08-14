# Gym CRM — Core Context

A single-context domain covering sales, memberships, billing, payments, and the
identity/tenancy layer for a gym management desktop application (offline Electron +
SQLite, shaped for future hosted multi-tenancy).

## Language

**Organization**:
The top-level business entity the software runs for (a gym or gym chain). The root
scoping dimension for all data, and the vendor's customer. Every row in the system
belongs to exactly one Organization.
_Avoid_: Tenant, Gym, Company, "Customer"

**User**:
A person's login identity (one global row, independent of any Organization). A User
is not their role, and not their Organization.
_Avoid_: Staff member, employee, account, login

**OrganizationStaff**:
The record binding a User to an Organization with a single Role. The join through
which a User gains access to an Organization's data and permissions.
_Avoid_: Membership (reserved for the gym product in Module 02), UserRole, Assignment, staff record

**Role**:
A named bundle of Permissions (or super access). Roles are data, not code, and are
editable except for the system roles.
_Avoid_: Permission group, security role

**Permission**:
A fine-grained capability code (e.g. `invoice.finalize`) that a Role grants and the
Command layer checks.
_Avoid_: Feature, right, access level

**Super role**:
A Role flagged `is_super` that grants all Permissions without enumerating them
(Owner and Admin). Code checks Permissions; a super role short-circuits that check.
_Avoid_: Wildcard, "all permissions"

**Organization Context**:
The Organization and Role active in the current session; every Command is scoped to
it. Source of truth is the session, never a URL or request field.
_Avoid_: Current tenant, active org (in code)