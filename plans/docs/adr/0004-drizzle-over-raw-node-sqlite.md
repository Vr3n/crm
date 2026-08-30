# Adopt Drizzle ORM over raw node:sqlite for all persistence

The shipped identity/tenancy foundation uses raw `node:sqlite` (`DatabaseSync`)
prepared statements, but the implementation guidelines and AGENTS.md mandate Drizzle.
We chose Drizzle (`drizzle-orm` on the `node:sqlite` driver) for all persistence and
retrofit the shipped foundation into it. One ORM, one schema source of truth, typed
queries, and `drizzle-kit` tooling for the whole app; the alternative of keeping two
persistence styles (raw identity + Drizzle business modules) would split conventions
and make every migration/review check which style applies. The `DatabaseSync`
connection and its `withTransaction` (BEGIN IMMEDIATE / SAVEPOINT nesting) are kept as
the single transaction boundary — Drizzle runs on the same connection, so the
application use case still owns the transaction. Hard to reverse once business modules
are written against Drizzle; the retrofit cost is contained because repository method
signatures are unchanged.