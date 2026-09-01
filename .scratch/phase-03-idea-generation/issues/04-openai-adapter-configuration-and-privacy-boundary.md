# 04: Implement the Phase 3 OpenAI adapter and privacy boundary

**What to build:** One server-only OpenAI Responses adapter that fulfills the provider-neutral contract for GPT-5.6 Terra while applying ADR-014’s strict-output, timeout, no-retry, safe-metadata, and data-minimization policy.

**Blocked by:** 03: Establish the provider-neutral AI contract and deterministic fake.

**Status:** ready-for-agent

## Goal

Implement the sole approved Phase 3 provider behind the established boundary; OpenAI-specific code remains fully contained and testable with mocked transport.

## Scope

- Add the official Node/TypeScript OpenAI SDK only if absent, with the dependency rationale recorded in implementation review: it is required for the ADR-approved Responses API adapter and is not duplicated by the approved stack.
- Add server-only configuration and the adapter for `gpt-5.6-terra` Responses Structured Outputs.
- Build the application prompt at request time, separating application instructions from Content DNA; return canonical output, safe neutral metadata, or mapped safe failure only.
- Add mocked SDK/transport tests and a non-sensitive manual smoke-test procedure draft for Ticket 08 to finalize.

## Relevant source-of-truth references

- `AGENTS.md` §§8, 10, 27, 33–35, 39, 41–43, 45–46, 48.
- `docs/ARCHITECTURE.md` §§20–25, 77–78, 84–90, 95.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§4–6, 10, 14–16.

## Architecture constraints

- Only the adapter imports OpenAI SDK types; its public surface is Ticket 03’s provider-neutral contract.
- Use only OpenAI, GPT-5.6 Terra, and synchronous Responses API; no Chat Completions, tools, background work, conversation, continuation, routing, fallback, or provider selector.
- OpenAI invocation is invoked later by the orchestration service outside transactions; the adapter must not own persistence or broad workflow policy.
- Exact prompt text is implementation detail, but must faithfully apply current DNA preferences/avoidances and resist creator-text instruction override.

## Expected behavior

- Send strict `idea_generation_v1` JSON Schema with root/item `additionalProperties: false`, exact 20 items, required `category: string | null`, `reasoning.effort: medium`, default service tier, `max_output_tokens: 16000`, 60-second timeout, and zero retries.
- Send `store: false`, explicit prompt-cache mode without breakpoint/key/retention, no metadata/tools/files/background/conversation/previous response/continuation/reasoning summaries or encrypted reasoning, and an HMAC-SHA-256 user safety identifier.
- Reject refusal, incomplete/non-completed output, missing text, parse/schema/canonical validation failure as `INVALID_OUTPUT`; map transport/rate/timeout outcomes per Phase 3 §10 without raw details.

## Persistence requirements

- The adapter persists nothing. It may return only provider/model/prompt version, approved generation settings, safe category, canonical snapshot candidate, and neutral numeric usage—not raw envelope/response ID/usage object/cost.

## Authorization requirements

- Adapter calls are server-only and receive an already-authorized internal user identity only to derive the HMAC safety identifier. It must never accept browser-supplied credentials or expose the API key.

## EN/FA + RTL/LTR requirements

- Generate one requested `en` or `fa` language only, as passed through the approved contract; never infer from UI locale or provide bilingual output. No UI is introduced.

## Security/privacy requirements

- Keep `OPENAI_API_KEY` and the dedicated HMAC secret server-only; do not log Content DNA, prompts, provider responses/IDs, refusal text, hidden reasoning, API keys, or raw errors.
- Use `store: false` as data minimization, accurately documenting that it is not Zero Data Retention; do not add ZDR/MAM policy or send PII.

## Acceptance criteria

- [ ] The adapter is the sole OpenAI SDK/type boundary and satisfies the provider-neutral contract.
- [ ] Request configuration exactly follows ADR-014, including strict schema, model, reasoning, timeout, `maxRetries: 0`, and privacy fields.
- [ ] Safe canonical output/usage/error mapping is returned; all raw provider data is rejected or discarded.
- [ ] Mocked tests prove no automatic retry and cover refusal, incomplete, malformed, timeout, rate-limit, unavailable, and unknown paths.

## Focused tests

- Mocked adapter tests that inspect request shape/privacy omissions/HMAC stability, response mapping, canonical validation, zero-retry configuration, and no leakage in safe failures/logs.

## Required final verification commands

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
git diff --check
```

## Explicit out of scope

- Any provider besides OpenAI, model/provider selection, routing/fallbacks, automatic retries, background generation, database lifecycle/quota work, UI, persistent prompt management, ZDR/MAM approval, content, publishing, analytics, and social integrations.

## Dependencies

- 03: Establish the provider-neutral AI contract and deterministic fake.
