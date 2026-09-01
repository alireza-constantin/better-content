# 08: Complete Phase 3 hardening, E2E, and manual OpenAI smoke procedure

**What to build:** Phase-wide verification that proves the approved idea-generation behavior is reliable, isolated, accessible, and deterministic in CI, plus a documented manual non-production OpenAI smoke procedure that never becomes a CI gate.

**Blocked by:** 01: Define Idea Generation domain contracts and canonical validation; 02: Add Phase 3 persistence schema and reviewed migration; 03: Establish the provider-neutral AI contract and deterministic fake; 04: Implement the Phase 3 OpenAI adapter and privacy boundary; 05: Orchestrate safe, idempotent idea generation; 06: Deliver authorized batch history, detail, retry, and idea decisions; 07: Build the localized, accessible Ideas workspace UI.

**Status:** ready-for-agent

## Goal

Close Phase 3 against its complete acceptance and testing strategy without adding new product scope.

## Scope

- Audit the implemented Phase 3 work against every Phase 3 acceptance criterion and resolve defects within approved scope.
- Add/finalize any missing deterministic unit, PostgreSQL integration, Playwright, accessibility, responsiveness, EN/FA, and RTL/LTR coverage.
- Review migration safety, structured logging/privacy boundaries, OpenAI configuration isolation, and CI’s inability to call live OpenAI.
- Document an opt-in manual smoke procedure using non-sensitive test DNA and non-production credentials; it is not an automated test or acceptance prerequisite.

## Relevant source-of-truth references

- `AGENTS.md` §§12, 27, 32–35, 39–50, 54–57, 60.
- `docs/agents/frontend-standards.md` §§6–10.
- `docs/PRD.md` §§4, 11–16.
- `docs/ARCHITECTURE.md` §§13–16, 20–29, 72–81, 84–96.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-013-content-dna-version-storage.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§1–16.

## Required implementation skills

- Actively use `frontend-design`, `vercel-react-best-practices`, and `web-design-guidelines` while reviewing/fixing the user-facing Ideas surface.
- `design-taste-frontend` is not listed as installed in this workspace; do not claim it was used. If installed before work starts, actively use it for the final visual review.

## Architecture constraints

- Preserve all prior ticket contracts and the modular-monolith boundaries. Fix findings in the owning module rather than bypassing the application service or adding test-only production paths.
- Deterministic CI uses the provider-neutral fake/mocks only. The manual smoke path is consciously separate and must not cause normal tests to need credentials/network access.
- Do not change accepted ADRs, Phase 3 semantics, schema invariants, lifecycle, provider policy, or deferred scope to make tests easier.

## Expected behavior

- The full mocked user workflow passes: current AI-ready DNA → authorized exact-20 generation → safe history/detail → individual decision.
- Security/transaction/concurrency/privacy behavior holds under automated tests, including stale and late-result paths; UI is usable and equivalent in EN/FA and LTR/RTL.
- Manual documentation specifies environment safeguards, non-sensitive test DNA, non-production credentials, explicit opt-in invocation, expected safe observation, and sanitized reporting—without logging/capturing prompts, raw envelopes, IDs, refusals, secrets, or reasoning.

## Persistence requirements

- Verify, rather than broaden, the four approved Phase 3 tables/migration: no idea workspace ID, one same-workspace run per batch, count/position/lifecycle/idempotency constraints, safe snapshots/usage, and quota reservation semantics.
- Do not create a new migration unless a Phase 3 defect proves an approved required constraint was omitted; any such corrective migration must be reviewed and tested through the normal workflow.

## Authorization requirements

- Verify membership/owner enforcement and non-enumeration for cross-workspace batch/idea access and mutation in integration and E2E coverage.

## EN/FA + RTL/LTR requirements

- Perform final locale, `lang`/`dir`, logical-layout, mixed-text, keyboard/focus/dialog/status, mobile, and desktop reviews for the Ideas surface. Record material fixes, not a claim of skill use alone.

## Security/privacy requirements

- Verify no OpenAI secrets/credentials or prohibited raw Content DNA/prompts/provider envelopes/IDs/refusals/reasoning appear in client payloads, persistence, logs, test fixtures, screenshots, or smoke documentation.
- Verify zero automatic retries, 60-second local timeout behavior through mocks, `store: false`, and HMAC safety ID configuration without exposing secret material.

## Acceptance criteria

- [ ] Every Phase 3 §15 acceptance criterion is demonstrably covered by implementation and focused tests or a documented manual non-CI check.
- [ ] CI deterministically executes no live OpenAI call and needs no production credential.
- [ ] Unit/integration/E2E coverage includes all Phase 3 §14 required scenarios, especially relational/isolation, lifecycle/stale/late races, idempotency/quota concurrency, safe failures, decisions, and EN/FA RTL/LTR accessibility/responsiveness.
- [ ] Required migration, formatting, lint, typecheck, build, test, E2E, diff, accessibility, responsive, and localization reviews pass with results recorded.
- [ ] The manual smoke procedure is safe, opt-in, non-production, sanitized, and explicitly outside CI/acceptance gating.

## Focused tests

- Gap-driven unit tests for validation/error mapping/provider configuration; PostgreSQL integration tests for all Phase 3 §14 persistence, authorization, atomicity, stale, idempotency, and quota cases; Playwright tests for the complete mocked UX and locale/accessibility/responsive states.

## Required final verification commands

```text
npm run db:migrate:test
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
git diff --check
```

## Explicit out of scope

- New product behavior, alternate providers/models/routing/fallbacks, live OpenAI in CI, historic DNA generation, count/language expansion or bilingual batches, editing/bulk actions/deduplication, prompt UI, jobs, content, publishing, analytics, social integrations, and unrelated refactors.

## Dependencies

- 01: Define Idea Generation domain contracts and canonical validation.
- 02: Add Phase 3 persistence schema and reviewed migration.
- 03: Establish the provider-neutral AI contract and deterministic fake.
- 04: Implement the Phase 3 OpenAI adapter and privacy boundary.
- 05: Orchestrate safe, idempotent idea generation.
- 06: Deliver authorized batch history, detail, retry, and idea decisions.
- 07: Build the localized, accessible Ideas workspace UI.
