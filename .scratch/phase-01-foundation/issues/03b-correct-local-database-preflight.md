# Correct local database startup diagnostics

Status: resolved

This corrective Phase 1 patch addresses local PostgreSQL port collisions and
early database diagnostics discovered while verifying Ticket 03a.

Scope:

- Use host port 5433 by default while keeping PostgreSQL internal port 5432.
- Add a safe database readiness check and development startup preflight.
- Preserve the dedicated `_test` database safeguards.
- Do not change unrelated containers or begin Ticket 05.

## Answer

Implemented the local database corrective patch. Compose now publishes host
port 5433 by default while PostgreSQL remains on container port 5432. Added
`BETTER_CONTENT_DB_PORT`, health-waiting `db:up`, `db:check`, and
non-destructive `db:setup` commands. Added a shared readiness check for missing
configuration, unreachable PostgreSQL, missing databases, and missing Better
Content schema or migration history without printing credentials or full
connection URLs. `npm run dev` now runs this check before starting Next.js.

## Root cause and behavior

Before this patch, Compose published PostgreSQL on host port 5432, which
collided with another local PostgreSQL service. The example `DATABASE_URL` also
used 5432, so the application could target the unrelated service, and
`npm run dev` started without checking database readiness.

After this patch, Compose publishes host port 5433 by default while PostgreSQL
continues listening on container port 5432. `db:up` waits for health,
`db:check` validates connectivity, database identity, and migration/schema
presence with sanitized messages, and `npm run dev` refuses to start until the
check succeeds. `db:setup` performs the non-destructive startup and migration
flow. The dedicated `_test` database validation remains unchanged.

## Verification

Verified healthy startup on 5433, development migration, successful
`db:check`, registration and login, actionable preflight failure while the
database was stopped, recovery after `db:up`, persistence across
`db:down`/`db:up`, 32 passing tests, lint, typecheck, build, and diff checks.

The corrective review also verifies that the connected database identity
matches `DATABASE_URL` and that a configured `BETTER_CONTENT_DB_PORT` agrees
with the local database URL before PostgreSQL is contacted.
