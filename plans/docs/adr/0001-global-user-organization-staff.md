# Global User identity with org-scoped OrganizationStaff

Even though v1 ships as an offline, single-Organization desktop app, User identity is
modeled as one global row with a separate OrganizationStaff record (User → Organization →
Role) per organization. We chose this over per-org user rows or a role-on-user column.
A User can thus span multiple Organizations later, and a role change never rewrites
history — the OrganizationStaff row is the stable join and the audit trail snapshots it. This is
the industry-standard shape (WorkOS, SSOJet, Auth0). Retrofitting it later is
expensive; building it now costs a join table.