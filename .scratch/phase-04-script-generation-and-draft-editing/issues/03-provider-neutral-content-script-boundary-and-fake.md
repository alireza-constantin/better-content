# 03 — Add the provider-neutral Content Script boundary and deterministic fake

**What to build:** Introduce a narrow `GenerateContentScriptProvider` contract, neutral success/failure types, a deterministic fake, and boundary validation so Content orchestration can be tested without importing AvalAI/OpenAI types or making network calls.

**Blocked by:** 01 — Define Content Script domain contracts and canonical validation.

**Status:** resolved

## Goal

Give the Content module one deterministic, provider-neutral seam for Script generation before any concrete adapter or orchestration is added.

## Scope

- Define the business request facts the AI module needs: canonical Idea data, accepted immutable DNA payload, and requested language/format/instructions.
- Reuse the existing generic Phase 3 actor/user identity seam outside the provider-neutral business request where infrastructure needs authenticated actor context.
- Define neutral success with canonical Script plus optional neutral usage and safe provider correlation.
- Define neutral failure categories matching the durable Phase 4 taxonomy.
- Revalidate all provider results at the neutral boundary.
- Add a deterministic fake supporting success and each failure scenario, request recording, controlled output, usage, and correlation.
- Reuse Phase 3 AI contracts and telemetry patterns where they remain generic.

## Explicit non-goals

- AvalAI/OpenAI SDK usage, prompt construction, environment configuration, or live smoke.
- Database lifecycle, quota, authorization, Content creation, UI, or retries.
- Multiple providers, routing, fallback, tools, conversations, or AI editing.

## Source-of-truth references

- Phase 4 §§15–18, 24, 27–28, 31, and provider acceptance criteria.
- Architecture §§20–25, 71, 87, 89–95.
- ADR-011, ADR-014, ADR-015, and ADR-016.
- Existing Phase 3 provider-neutral contract, deterministic fake, and E2E telemetry seam.

## Required behavior

- Content application code depends only on the neutral interface and domain values.
- The provider-neutral Content Script request contains no safety identifier, HMAC value, provider credential, or provider-specific actor field. Authenticated actor/user identity reaches provider construction through the existing generic Phase 3 seam where applicable.
- Success output must pass strict schema and canonical generated validation before it can leave the AI boundary.
- Failure variants are exactly TIMEOUT, RATE_LIMITED, PROVIDER_UNAVAILABLE, INVALID_OUTPUT, INTERRUPTED, and UNKNOWN; provider rate limiting maps to application source PROVIDER later.
- The fake never performs network, persistence, authorization, quota, or lifecycle work.
- The fake can prove exact invocation count/request and deterministically exercise malformed, refusal-equivalent, timeout, rate-limit, unavailable, interrupted, and unknown paths as appropriate to the neutral seam.
- Provider-neutral usage exposes only approved optional numeric fields; correlation remains an optional safe string, not a provider envelope.

## Persistence constraints

- None in this ticket; output types must be suitable for later canonical AI Run persistence.
- No raw response, prompt, provider usage object, refusal, or error body appears in the contract.

## Security and authorization requirements

- Creator data remains typed as untrusted input and cannot carry system/provider settings.
- HMAC safety-identifier derivation belongs exclusively to AvalAI infrastructure under ADR-016; neither the business request nor the provider-neutral request accepts a pre-derived safety identifier.
- No credential or provider-specific identifier except the approved safe neutral correlation can escape infrastructure.
- The fake’s recorded data is test-only and must not create production logging behavior.

## EN/FA and RTL/LTR requirements

- The contract preserves requested `en | fa` and mixed Unicode data without translation or direction mutation.
- The deterministic fake returns valid English and Persian Scripts for the requested language.

## Acceptance criteria

- [ ] No AvalAI/OpenAI SDK type is exported from the neutral contract.
- [ ] The neutral business/provider request contains no safety-identifier field and reuses the existing generic actor/user identity seam instead of creating a Content-specific identity contract.
- [ ] Boundary validation rejects malformed, unknown-key, empty, and oversized output as INVALID_OUTPUT.
- [ ] The deterministic fake records exact canonical requests and returns reproducible EN/FA success output.
- [ ] Every neutral failure and optional usage/correlation path has deterministic unit coverage.
- [ ] The existing Idea-generation provider contract remains behaviorally unchanged.
- [ ] No network request is possible from normal fake-backed automated tests.

## Required tests

- **Unit:** request/result parsing, canonical boundary validation, every fake scenario, usage/correlation, EN/FA output.
- **Integration:** not required; orchestration integration begins in Ticket 06.
- **Component:** not required.
- **E2E:** not required; the fake is wired into guarded E2E composition later.

## Dependencies and blockers

- Blocked by Ticket 01.
- Can run in parallel with Ticket 02.
- Blocks Tickets 04 and 06.

## Expected verification commands

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
git diff --check
```
