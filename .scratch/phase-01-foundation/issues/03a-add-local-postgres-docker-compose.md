Create and implement a small Phase 1 support ticket:

Status: resolved

"Add standardized local PostgreSQL development with Docker Compose"

This is an approved Phase 1 tooling adjustment discovered during real-browser
verification of Ticket 04.

Read:
- AGENTS.md
- docs/ARCHITECTURE.md
- ADR-012
- docs/phases/phase-01-foundation.md
- existing database/environment implementation

Scope:

Add a minimal Docker Compose configuration for local PostgreSQL development.

Requirements:

1. Use PostgreSQL 18.

2. Add a root-level Compose file using the modern Docker Compose format.

3. Define one PostgreSQL service for local development.

4. Local defaults should provide:
   - database: better_content
   - user: postgres
   - local development password
   - host port: 5432

5. Persist database data using a named Docker volume.

6. Add a PostgreSQL healthcheck.

7. Prefer `restart: unless-stopped` so the development database can return
   automatically when Docker starts.

8. Do not use `container_name` unless there is a concrete reason. Let Docker
   Compose namespace the service normally.

9. Do not add Redis, adminer, pgAdmin, or any unrelated infrastructure.

10. Do not put production secrets in the Compose file.

The PostgreSQL credentials in this Compose configuration are explicitly
development-only and must never be presented as production credentials.

11. Make `.env.example` clearly compatible with the local Compose database.

The expected local development connection is conceptually:

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/better_content

Do not commit `.env.local`.

12. Add useful npm scripts:

- db:up
- db:down
- db:logs

using Docker Compose.

Keep the existing migration scripts.

13. Do not automatically destroy the database volume from normal `db:down`.

Database destruction should require an explicit command/manual action.

14. Do not change Better Auth behavior or implement Ticket 05.

15. Preserve test database isolation requirements. The normal development
database must not be confused with the `_test` database used by automated tests.

Verification:

- docker compose config
- docker compose up -d
- verify PostgreSQL becomes healthy
- run the normal development migration against better_content
- verify expected Better Auth/workspace tables exist through application/migration tooling
- restart the Compose service and verify data volume persists
- npm run lint
- npm run typecheck
- npm run test
- npm run build
- git diff --check

After verification, commit this support ticket and mark it resolved.

Do not begin Ticket 05.

## Answer

Implemented the standardized local PostgreSQL development setup with Docker Compose. Added a PostgreSQL 18 service with development-only credentials, a named persistent volume, healthcheck, automatic restart policy, and a default host mapping of 5432. The host port can be overridden with `POSTGRES_HOST_PORT` when another local service occupies 5432; `.env.example` uses the standard 5432 connection URL. Added `db:up`, `db:down`, and `db:logs` scripts without volume destruction.

Verified Compose configuration, healthy startup, Drizzle migration against `better_content`, expected Better Auth/workspace tables, data persistence across restart, non-destructive `db:down`, lint, typecheck, tests (27 passing), production build, and `git diff --check`. Validation used host port 5433 because an unrelated local PostgreSQL container already owns 5432; the committed default remains 5432.
