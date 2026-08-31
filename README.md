# Better Content

Better Content is a localized creator-workspace application. Phase 1 provides
email-and-password authentication, a personal workspace boundary, and English
(LTR) and Persian (RTL) interfaces.

## Requirements

- Node.js 24 (use `nvm use`, which reads [`.nvmrc`](.nvmrc))
- npm
- Docker Desktop with Docker Compose, or a compatible PostgreSQL 18 instance

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Copy `.env.example` to `.env.local`, set a unique `BETTER_AUTH_SECRET` of
   at least 32 characters, and set `BETTER_AUTH_URL` to your local application
   origin. The provided `DATABASE_URL` targets the local Docker database on
   port 5433.

3. Start PostgreSQL and apply migrations:

   ```bash
   npm run db:setup
   ```

4. Start the application:

   ```bash
   npm run dev
   ```

   Open `http://localhost:3000/en` or `http://localhost:3000/fa`.

### Database commands

```bash
npm run db:up       # Start local PostgreSQL and wait for health
npm run db:down     # Stop it without deleting its volume
npm run db:check    # Verify connection, schema, and migration history
npm run db:generate # Generate a reviewed Drizzle migration
npm run db:migrate  # Apply committed Drizzle migrations
```

The Compose credentials and port in `.env.example` are for local development
only. Do not commit `.env.local` or use those credentials in production.

## Tests and checks

Unit and integration tests require an isolated PostgreSQL database. Set
`TEST_DATABASE_URL` to a database name ending in `_test`; it must not identify
the same database as `DATABASE_URL`.

Playwright requires `E2E_DATABASE_URL` with the same `_test` suffix and a
different database from `DATABASE_URL`. Copy `.env.e2e.example` as a starting
point. The test runner creates and clears only that guarded E2E database.

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

## Documentation

Product, architectural, and phase decisions live in [`docs/`](docs/). Read
[`AGENTS.md`](AGENTS.md) before making implementation changes; accepted ADRs
remain authoritative over this README.
