# 03: Establish the provider-neutral AI contract and deterministic fake

**What to build:** A narrow AI-module `GenerateIdeas` boundary and deterministic fake that lets Phase 3 services request and test canonical idea generation without knowing OpenAI or invoking any live provider.

**Blocked by:** 01: Define Idea Generation domain contracts and canonical validation; 02: Add Phase 3 persistence schema and reviewed migration.

**Status:** resolved

## Goal

Create the reusable Phase 3 AI application contract prescribed by ADR-011, with deterministic test behavior and safe, provider-neutral outcomes.

## Scope

- Define provider-neutral generate-ideas input/output/failure/usage interfaces around Ticket 01 canonical contracts.
- Supply a configurable deterministic fake for success, refused/incomplete/malformed/invalid output, timeout, provider-limit/unavailability, and unknown outcomes.
- Wire service-level dependency injection/composition only far enough for deterministic tests; do not write an OpenAI adapter or call a provider.

## Relevant source-of-truth references

- `AGENTS.md` §§9–10, 33–35, 39, 42–46.
- `docs/ARCHITECTURE.md` §§20–25, 84–90, 95.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§4–6, 10, 14–16.

## Architecture constraints

- The Ideas module requests a domain operation; it does not know SDK requests/responses or provider-specific types.
- OpenAI SDK types and imports are forbidden in this ticket and must later remain adapter-internal.
- Keep the interface need-shaped for Phase 3’s single exact-20 operation—no generic provider routing, selector, fallback, or placeholder adapters.
- Canonical Zod validation remains authoritative at the domain boundary even when a provider enforces output shape.

## Expected behavior

- The fake returns only canonical normalized output plus safe neutral optional usage metadata or one mapped durable category.
- It is deterministic, records calls for assertions, and enables CI to prove replay/no-call and failure behavior without network credentials.
- Provider failure mapping expresses only `TIMEOUT`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `INVALID_OUTPUT`, `INTERRUPTED`, or `UNKNOWN`; raw error details never escape.

## Persistence requirements

- Do not add tables or migrations. Contract data must align with existing `ai_runs` safe output snapshot/settings/neutral usage columns but must not directly persist or query them.

## Authorization requirements

- The contract accepts application-authorized domain input only and must not turn a raw workspace/user ID into authorization. No browser/provider credential path is added.

## EN/FA + RTL/LTR requirements

- Support only the contract’s `en` and `fa` requested-content-language values; UI locale and direction are not inputs.

## Security/privacy requirements

- The fake must not require keys or network access.
- Never model raw prompts, DNA logs, provider envelopes/IDs, refusal text, hidden reasoning, or provider SDK objects in public contracts.

## Acceptance criteria

- [ ] A feature service can request exactly one canonical 20-idea operation through a provider-neutral interface.
- [ ] Deterministic success and each Phase 3 safe failure category are testable without OpenAI or network access.
- [ ] Contract results cannot carry raw provider responses and validate canonical output before reporting success.
- [ ] CI remains structurally incapable of accidentally using a live OpenAI client through the fake path.

## Focused tests

- Unit/contract tests for fake determinism/call recording, success, refusal/incomplete/malformed results, canonical validation failures, safe category mapping, and optional neutral usage fields.

## Required final verification commands

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
git diff --check
```

## Explicit out of scope

- OpenAI SDK/dependency/configuration, real provider calls, schema changes, orchestration, UI, live quality evaluation, every other provider, routing/fallbacks/selectors, prompts UI, jobs, content, publishing, analytics, and social integrations.

## Dependencies

- 01: Define Idea Generation domain contracts and canonical validation.
- 02: Add Phase 3 persistence schema and reviewed migration.

## Answer

Implemented Ticket 03 only. Added the narrow provider-neutral `GenerateIdeas`
port with canonical Content DNA request context, fixed `en`/`fa` and exact-20
requirements, prompt-version identity, safe result/failure types, and runtime
canonical output/usage validation.

Added an isolated deterministic fake with configurable success, custom output,
refusal/incomplete/malformed/invalid-output, timeout, rate-limit,
provider-unavailable, and unknown scenarios. Invocation counting and opt-in
request recording support later orchestration tests without retaining request
content by default.

No OpenAI, database, Drizzle, persistence, orchestration, quota, UI, route, job,
or other deferred implementation was introduced. No map.md exists for a
context pointer.
