# Row-level `organization_id` scoping over database-per-tenant

Every business table carries `organization_id`, and every query filters by the current
Organization Context — even though v1 has exactly one row in the organizations table.
We chose row-level scoping over one SQLite file per Organization because it keeps a
single offline file/connection, makes future cross-organization admin reporting
trivial, and turns "become multi-tenant" into a data change, not a code change. The
code must never skip the filter just because there's only one org today.