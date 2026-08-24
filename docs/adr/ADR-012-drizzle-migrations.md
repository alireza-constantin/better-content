# ADR-012: Use Reviewed Drizzle Migrations as the Production Schema Change Mechanism

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

Better Content relies heavily on historical lineage and relational integrity.

Database changes must therefore be reproducible, reviewable, and compatible with application deployments.

Ad-hoc production schema changes or unmanaged schema pushing would weaken traceability and make rollback/review difficult.

## Decision

Drizzle schema definitions live in source control and represent the application database model.

Production schema changes use version-controlled migration files generated/managed through Drizzle's migration workflow.

Rules:

- migration files are committed to Git,
- migrations are reviewed,
- production deployments apply committed migrations,
- no manual production schema edits,
- no reliance on `drizzle-kit push` as the production migration strategy,
- destructive migrations require explicit review,
- schema/application compatibility must be considered during deployment.

For risky future changes, prefer:

`expand → backfill → switch application → contract`

instead of one-step destructive migration.

Better Auth database schema is also represented through the repository's Drizzle schema/migration history.

## Consequences

### Positive

- Reproducible database state.
- Reviewable changes.
- Safer collaboration with Codex.
- Better rollback/debugging history.

### Negative

- Schema changes require migration discipline.
- Some changes require multi-step deployments.

## Constraints

Codex may generate migrations as part of an approved phase, but must not apply unreviewed destructive production changes.
