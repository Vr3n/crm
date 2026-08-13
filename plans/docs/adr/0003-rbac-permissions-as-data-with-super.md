# RBAC: fine-grained Permissions-as-data, enforced at the Command layer

Authorization checks a Permission code, never a role name. Roles map to Permissions
via RolePermission, and a super flag on Role (Owner, Admin) short-circuits the check
so their access isn't enumerated. Permission is enforced in the Command/Application
layer (Electron main), not by hiding UI buttons. This keeps role/permission changes a
data edit (an admin screen) instead of a code change, and makes UI hiding a UX nicety
rather than a security boundary.