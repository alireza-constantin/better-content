# 07: Add Phase 1 CI and developer onboarding

**What to build:** Contributors can reliably set up Better Content locally, while GitHub Actions validates the completed Phase 1 foundation with reproducible dependencies, PostgreSQL, migrations, and required quality checks.

**Blocked by:** 06: Harden Phase 1 quality and cross-cutting behavior.

**Status:** resolved

## Phase references

Phase 1 §§41–44, 52–55.

## Acceptance criteria

- [x] GitHub Actions CI uses Node.js 24, PostgreSQL 18, `npm ci`, safe test-only configuration, database migrations, lint, typecheck, tests, build, and reliable E2E coverage where supported.
- [x] CI does not contain production secrets or call real external APIs.
- [x] The root README explains the Node requirement, dependency installation, PostgreSQL requirement, environment setup, migrations, local development, and test commands.
- [x] CI and README remain developer/onboarding artifacts and do not redefine product, architecture, ADR, or phase decisions.

## Verification

- Validate workflow configuration and run the equivalent local commands where possible.
- Confirm a clean dependency install uses `npm ci` and the application setup instructions are complete.
- Run `git diff --check` and review the final Phase 1 diff for unrelated changes.

## Answer

Completed the Phase 1 CI and developer-onboarding deliverable. GitHub Actions
uses Node.js 24 and PostgreSQL 18, installs with `npm ci`, applies the normal
and guarded test-database migrations, then runs lint, typecheck, tests, build,
and Playwright. It uses test-only database URLs and Better Auth configuration
and makes no external API calls.

The root README now documents Node 24, dependency installation, local
PostgreSQL, `.env.local` setup, migration and development commands, and the
isolated test/E2E database requirements. Standalone Node scripts now use Node
24 native `--env-file-if-exists=.env.local` loading, preserving shell/CI
environment precedence and the existing test-target safety checks.
