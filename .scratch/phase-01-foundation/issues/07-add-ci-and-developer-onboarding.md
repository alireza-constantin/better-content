# 07: Add Phase 1 CI and developer onboarding

**What to build:** Contributors can reliably set up Better Content locally, while GitHub Actions validates the completed Phase 1 foundation with reproducible dependencies, PostgreSQL, migrations, and required quality checks.

**Blocked by:** 06: Harden Phase 1 quality and cross-cutting behavior.

**Status:** ready-for-agent

## Phase references

Phase 1 §§41–44, 52–55.

## Acceptance criteria

- [ ] GitHub Actions CI uses Node.js 24, PostgreSQL 18, `npm ci`, safe test-only configuration, database migrations, lint, typecheck, tests, build, and reliable E2E coverage where supported.
- [ ] CI does not contain production secrets or call real external APIs.
- [ ] The root README explains the Node requirement, dependency installation, PostgreSQL requirement, environment setup, migrations, local development, and test commands.
- [ ] CI and README remain developer/onboarding artifacts and do not redefine product, architecture, ADR, or phase decisions.

## Verification

- Validate workflow configuration and run the equivalent local commands where possible.
- Confirm a clean dependency install uses `npm ci` and the application setup instructions are complete.
- Run `git diff --check` and review the final Phase 1 diff for unrelated changes.
