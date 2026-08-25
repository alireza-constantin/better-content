# 03: Establish persistence and application-boundary foundations

**What to build:** A secure, migration-backed persistence foundation for Better Auth and Better Content workspace ownership, with centralized environment, database, logging, and application-error boundaries.

**Blocked by:** 01: Bootstrap the root Next.js application and developer baseline.

**Status:** ready-for-agent

## Phase references

Phase 1 §§11–18, 33–35, 36–40, 45–46.

## Acceptance criteria

- [ ] Server environment validation requires the Phase 1 database and Better Auth configuration without exposing secrets to the client.
- [ ] PostgreSQL and Drizzle access are centralized and use a normal Node.js-compatible driver.
- [ ] The committed Drizzle schema uses Better Auth's generated/expected schema plus only `workspaces` and `workspace_members` as Better Content domain tables.
- [ ] A reviewed initial Drizzle migration applies cleanly to an empty PostgreSQL test database; normal workflows use migration generation and application rather than `drizzle push`.
- [ ] Workspace membership has practical foreign-key, uniqueness, and ownership constraints, including prevention of duplicate memberships and support for the V1 single-workspace invariant.
- [ ] Stable application errors and structured server logging exist without logging passwords, tokens, secrets, headers, or database credentials.
- [ ] The database test setup is isolated from production configuration.

## Verification

- Run the migration against an empty dedicated test database and confirm the application can use the migrated schema.
- Add and run tests for environment validation and application-error behavior.
- Inspect schema constraints and logs to confirm secret-handling requirements are met.
