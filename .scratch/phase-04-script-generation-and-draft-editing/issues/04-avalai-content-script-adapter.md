# 04 — Implement the ADR-016 AvalAI Content Script adapter

**What to build:** Implement and contract-test the one-shot AvalAI Responses-compatible adapter for `content-script-generation/v1`, with the exact fixed policy, strict schema, prompt-delimiting rules, privacy boundary, and error mapping accepted in ADR-016.

**Blocked by:** 03 — Add the provider-neutral Content Script boundary and deterministic fake.

**Status:** resolved

## Goal

Make real Content Script generation available behind the neutral interface without leaking SDK types or expanding provider configuration.

## Scope

- Add a Content Script adapter alongside, not inside, the existing Idea-generation AvalAI adapter.
- Construct the fixed request for AvalAI’s production endpoint and `gpt-5.6-luna`.
- Implement the strict `content_script_v1` response schema and code-owned `content-script-generation/v1` prompt policy.
- Delimit untrusted Idea, DNA, and creator instructions under application-owned rules.
- Map response completion/refusal/output, neutral usage, `avalai-request-id`, transport errors, timeouts, HTTP responses, and invalid output.
- Support only controlled local test-transport endpoint injection.

## Explicit non-goals

- A production base-URL environment variable, provider/model selector, fallback, routing, cache controls, tools, files, background mode, conversations, continuation, sampling controls, cost lookup, or provider retries.
- Application orchestration, persistence, UI, language detection, or AI rewriting.
- Changes to Phase 3 provider policy except shared bug fixes proven necessary and in scope.

## Source-of-truth references

- Phase 4 §§17, 24, 27–28, 31–32, and provider acceptance criteria.
- Architecture §§20–25, 71, 87, 89, 94–99.
- ADR-011, ADR-014, ADR-015, and ADR-016 in full.
- Existing AvalAI Idea adapter and manual smoke transport patterns.

## Required behavior

- Fixed request: AvalAI, `https://api.avalai.ir/v1`, Responses-compatible API, `gpt-5.6-luna`, strict schema, medium reasoning, default tier, 16,000 max output tokens, 90-second local timeout, SDK retries 0, `store:false`, and server HMAC safety ID.
- Prompt guidance distinguishes EN/FA and SHORT_VIDEO/LONG_VIDEO exactly as ADR-016 specifies without word-count/duration rejection.
- Output passes strict provider parsing and the neutral canonical validator; no truncation occurs.
- `408/409/5xx` and transport failures map safely to PROVIDER_UNAVAILABLE, provider `429` to RATE_LIMITED, local deadline to TIMEOUT, refusals/incomplete/malformed output to INVALID_OUTPUT, and unknown cases to UNKNOWN.
- Only approved neutral usage and optional canonical `avalai-request-id` are returned.
- `prompt_cache_options`, cache keys, cache breakpoints, `previous_response_id`, tools, and sampling fields are absent from requests.

## Persistence constraints

- The adapter performs no persistence.
- Raw prompts, provider envelopes, raw `output_text`, response bytes, usage objects, refusals, and error bodies do not leave the adapter.

## Security and authorization requirements

- API key and dedicated HMAC secret are server-only and validated through existing environment boundaries.
- Safety ID is HMAC-SHA-256 of internal user ID and never exposes that ID to the provider.
- Test endpoint injection must be impossible in ordinary production composition.
- Logs use allowlisted metadata only and never contain creator/provider raw material or secrets.

## EN/FA and RTL/LTR requirements

- Contract tests prove English/Persian plus short/long request construction.
- Provider inputs preserve Unicode; UI direction is outside this adapter.
- No language detector or heuristic rejection is introduced.

## Acceptance criteria

- [ ] Exact request-shape tests prove every fixed ADR-016 setting and every explicitly omitted field.
- [ ] AvalAI/OpenAI SDK types remain inside infrastructure.
- [ ] Prompt tests prove server policy remains authoritative and untrusted sections are clearly delimited.
- [ ] Refusal, incomplete, missing, malformed, unknown-key, empty, oversized, timeout, 429, compatible 408/409, 5xx, transport, and unknown failures map correctly.
- [ ] Safe usage and `avalai-request-id` mapping work when present and absence is valid.
- [ ] Production has no general provider base-URL configuration; only guarded test transport can inject an endpoint.
- [ ] Normal automated tests make no live AvalAI request.

## Required tests

- **Unit/contract:** exact SDK request, strict schema, all mappings, HMAC, timeout/abort behavior, privacy omissions, EN/FA × SHORT/LONG prompt construction.
- **Integration:** controlled local HTTP transport contract only if needed; no live provider.
- **Component:** not required.
- **E2E:** production composition and guarded fake selection are verified later.

## Dependencies and blockers

- Blocked by Ticket 03.
- Can run in parallel with persistence and request-acceptance work.
- Blocks Ticket 09 and is required by Ticket 11’s production-composition and live-smoke verification.

## Expected verification commands

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```
