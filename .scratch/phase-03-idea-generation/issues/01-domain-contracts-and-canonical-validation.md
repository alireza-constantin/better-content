# 01: Define Idea Generation domain contracts and canonical validation

**What to build:** A server-only, provider-independent set of Phase 3 idea-generation contracts that gives every later layer one canonical interpretation of a request, successful 20-idea payload, lifecycle, decisions, fingerprints, and safe error outcomes.

**Blocked by:** None (can start immediately).

**Status:** resolved

## Goal

Establish the canonical domain vocabulary and runtime validation before persistence or any provider code exists.

## Scope

- Define the fixed `IDEA_GENERATION` request, `en`/`fa` language, count `20`, run/batch lifecycle, durable error categories, decision states, and provider-neutral usage/result DTOs.
- Implement canonical normalization and Zod validation for a successful output snapshot: schema version 1, exactly 20 ideas, normalized optional category, field limits/newline rules, no unknown keys, and case-insensitive unique titles while preserving display casing.
- Define stable immutable-input request fingerprint serialization and direct decision-transition semantics, including no-op and rejection-reason clearing rules.

## Relevant source-of-truth references

- `AGENTS.md` §§9–11, 15–18, 33–35, 39, 42, 51.
- `docs/PRD.md` §§4, 11–16.
- `docs/ARCHITECTURE.md` §§13–16, 20–29, 72–75, 84–90, 95.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-013-content-dna-version-storage.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§2, 4, 7, 10–11, 14–16.

## Architecture constraints

- Keep contracts inside the `ideas` and provider-neutral `ai` module boundaries; do not import Drizzle, React, or OpenAI SDK types.
- `USED` is derived later and must not be a persisted decision state.
- The canonical snapshot contains generated facts only; mutable idea decision fields are not part of it.
- Treat validated AI output as untrusted until this canonical boundary succeeds.

## Expected behavior

- A canonical request fingerprint includes only generation kind, base Content DNA version ID, requested language, and fixed count 20; it excludes UI locale, DNA body, prompts, and transient values.
- Successful output normalizes title/description/category exactly as Phase 3 §4 requires and rejects wrong counts, duplicate canonical titles, malformed values, and unknown keys.
- A rejection reason is optional free text up to 500 characters; it is cleared whenever the decision leaves `REJECTED`; submitting the same state is a no-op where practical.

## Persistence requirements

- No tables or migration in this ticket.
- Export schemas/types that the later schema, provider, orchestration, and decision services use; do not encode a database enum or a `workspace_id` on an idea.

## Authorization requirements

- This ticket does not authorize an operation or access data. Its contracts must require callers to supply already-authorized workspace/resource context rather than treating IDs as proof of access.

## EN/FA + RTL/LTR requirements

- Validate content language as `en | fa` independently of UI locale; do not translate or transform creator/generated text.
- No UI is delivered in this ticket.

## Security/privacy requirements

- Do not add prompt construction, logging, provider configuration, credentials, or raw-provider types.
- Validation errors and durable error categories must be safe for later localized handling and must not carry raw provider content.

## Acceptance criteria

- [ ] The canonical output schema accepts only schema version 1 and exactly 20 normalized, distinct ideas with the Phase 3 field limits.
- [ ] Blank/null category becomes absent; raw empty categories and unknown keys cannot reach a successful canonical snapshot.
- [ ] Fingerprinting is deterministic and includes no mutable, private, or UI-only input.
- [ ] Contracts model only `PENDING → RUNNING → COMPLETED | FAILED`, durable safe categories, and persistent decisions `NEW`, `SAVED`, `ACCEPTED`, `REJECTED`.
- [ ] No persistence, provider, UI, or deferred-domain implementation is introduced.

## Focused tests

- Unit tests for normalization, CRLF handling, limits, exactly 20, unknown keys, title uniqueness, fingerprint stability, decision no-op, and rejection-reason clearing.

## Required final verification commands

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
git diff --check
```

## Explicit out of scope

- Database schema/migrations, OpenAI SDK/adapter, calls, orchestration, UI, historical DNA generation, count selector, extra/bilingual languages, idea editing or bulk actions, semantic deduplication, jobs, content, publishing, analytics, social integrations, and provider routing/fallbacks.

## Dependencies

- None.

## Answer

Implemented Ticket 01 only. Added server-only provider-neutral AI and Ideas
domain contracts for the fixed `IDEA_GENERATION` request, `en`/`fa` language,
exactly-20 canonical output, lifecycle/failure categories, usage, generation
settings, deterministic SHA-256 request fingerprints, and direct decision
updates with no-op and rejection-reason clearing semantics.

Added focused tests for normalization, strict keys, limits, duplicate titles,
fingerprints, decisions, lifecycle, usage, and settings. Extended the existing
application error vocabulary with `RATE_LIMITED`, `PROVIDER_ERROR`, and
`AI_OUTPUT_INVALID`.

No persistence, provider, orchestration, UI, route, job, or migration work was
introduced. No `map.md` exists for a context pointer.
