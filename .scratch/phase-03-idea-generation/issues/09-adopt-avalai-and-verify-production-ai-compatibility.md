# Phase 3 Ticket 09 — Adopt AvalAI and Verify Production AI Compatibility

**Status:** resolved

## Objective

Transition Phase 3's real production AI integration from direct OpenAI API
access to AvalAI while preserving the existing provider-neutral architecture
and every established Phase 3 domain invariant.

This is a provider transition/hardening ticket.

It is NOT Phase 4.

Read before implementation:

- AGENTS.md
- docs/PRD.md
- docs/ARCHITECTURE.md
- ADR-014
- ADR-015
- docs/phases/phase-03-idea-generation.md
- Phase 3 Tickets 03, 04, 05, 08
- existing AI provider implementation and tests

## Architecture

Preserve:

Ideas application
    ↓
GenerateIdeasProvider
    ↓
provider infrastructure adapter

Do not introduce a provider registry/router/manager.

Do not leak AvalAI types into application/domain code.

Use the existing openai npm SDK.

Production provider:
AvalAI

Production endpoint:
https://api.avalai.ir/v1

Production Phase 3 model:
gpt-5.6-luna

API:
Responses

## Configuration

Replace direct-OpenAI production credentials with:

AVALAI_API_KEY

Retain:

AI_SAFETY_IDENTIFIER_SECRET

Do not create generic arbitrary production:

AI_BASE_URL
OPENAI_BASE_URL

The production AvalAI origin must be fixed/allowlisted by infrastructure code.

Preserve deterministic test/E2E endpoint injection without opening an
arbitrary production URL configuration surface.

Do not expose credentials to client bundles or logs.

## Adapter evolution

Evolve the existing provider implementation rather than rewriting Phase 3.

Rename implementation concepts where necessary so the production adapter no
longer incorrectly claims the credential/provider is direct OpenAI.

Keep the provider-neutral GenerateIdeasProvider contract unchanged unless a
real incompatibility makes that impossible.

Any proposed application-contract change is a blocker requiring architectural
review.

## Required request behavior

Use:

model = gpt-5.6-luna
Responses API
strict structured output
idea_generation_v1

Preserve ADR-014 settings where AvalAI/Luna supports them and ADR-015 has not
changed them.

Canonical Zod validation remains mandatory.

Do not trust OpenAI compatibility alone.

## Compatibility verification

Perform opt-in real AvalAI smoke tests using synthetic/non-sensitive Content
DNA.

Do not run live AvalAI tests in CI.

Verify:

A. Minimal English Responses request.

B. Minimal Persian Responses request.

C. Better Content's real EN 20-Idea Generation workflow.

D. Better Content's real FA 20-Idea Generation workflow.

E. Exact idea_generation_v1 strict JSON Schema.

F. Exactly 20 outputs.

G. Canonical Zod validation.

H. Correct EN/FA Unicode handling.

I. Refusal behavior.

J. Incomplete response behavior.

K. Invalid API key / 401 behavior.

L. Invalid model behavior.

M. Provider 429 behavior.

N. timeout behavior.

O. representative 5xx/provider-unavailable mapping where safely reproducible
through deterministic adapter tests.

P. neutral usage extraction.

Q. canonical AvalAI request ID extraction.

Do NOT test streaming; Phase 3 does not use it.

## Responses compatibility gate

Responses + strict structured output is the approved production contract.

Do not automatically fall back to Chat Completions.

If gpt-5.6-luna cannot reliably execute the exact approved contract:

STOP.

Document the incompatibility and report it for architectural review.

Do not silently implement another API or model.

## Request ID

Capture:

avalai-request-id

as the canonical provider correlation identifier where the transport exposes
it.

Do not design new code around x-request-id.

No raw provider response should be persisted merely to obtain this ID.

Determine whether providerRequestId can be exposed through the existing
provider result/observability seam without a database migration.

If persistence requires schema expansion, STOP and report the recommendation
rather than adding a migration automatically.

## Cost measurement

Do not implement a cost dashboard.

Do not add production cost lookup calls to the generation request path.

For the manual compatibility smoke only:

1. record avalai-request-id
2. call AvalAI User API transaction lookup
3. record:
   - model
   - input tokens
   - cached tokens where available
   - output tokens
   - total/neutral usage
   - billed cost
   - billing source where returned
4. document representative EN and FA generation cost

Prefer several representative runs rather than one anecdotal request.

Use provider-billed values as the source of truth.

Do not commit credentials, raw Content DNA, raw generated creator content, or
sensitive provider responses.

## Cost evaluation

Evaluate the current design target:

<= $0.005 equivalent per successful 20-Idea Generation

Treat this as an evaluation target for Ticket 09, not a reason to manipulate
the output contract.

Report actual results.

If representative cost materially exceeds the target, report it rather than
silently changing:
- count
- model
- reasoning
- prompt
- output limits
- product semantics

## Existing Phase 3 behavior

All existing invariants remain unchanged:

- exact 20 ideas
- current AI-ready Content DNA pre-acceptance
- immutable accepted source version
- EN/FA language rules
- idempotency
- workspace quota
- lifecycle
- stale recovery
- atomic completion
- safe failure
- Retry current-DNA semantics
- decisions/history
- authorization/privacy
- RATE_LIMITED source distinction

## Provider error normalization

Confirm AvalAI errors map into the existing neutral categories:

TIMEOUT
RATE_LIMITED
PROVIDER_UNAVAILABLE
INVALID_OUTPUT
UNKNOWN

Do not expose AvalAI raw error bodies.

Provider 429 must remain:

RATE_LIMITED / PROVIDER

and must not be represented as a workspace quota denial.

## Automated tests

Preserve deterministic provider tests.

Add/update tests for:

- AvalAI adapter configuration
- trusted production endpoint
- secret validation
- Luna model policy
- Responses request shape
- structured schema request
- canonical output validation
- safe error normalization
- usage normalization
- request-ID extraction if supported by the SDK transport seam
- no raw provider error leakage
- production arbitrary-base-URL rejection
- provider-neutral application boundary

Existing E2E mock remains deterministic and incurs zero external API usage.

## Documentation

Update only the source-of-truth sections affected by ADR-015.

Do not broadly rewrite architecture documentation.

Update the manual AI smoke documentation from direct OpenAI to AvalAI where
ADR-015 supersedes it.

Document:

- ChatGPT subscription is irrelevant to Better Content API execution
- AvalAI API key setup
- server-only environment configuration
- normal AvalAI account balance requirement
- manual smoke command/procedure
- transaction lookup procedure
- request-ID handling
- no secrets in Git

## Scope exclusions

Do not implement:

- Phase 4
- another provider
- multi-provider routing
- provider fallback
- model fallback
- provider/model selector
- Chat Completions fallback
- streaming
- Sol integration
- Terra integration
- automatic cost lookup in normal generation
- cost dashboard
- billing subsystem
- new background jobs
- unrelated schema changes

## Acceptance criteria

PASS only if:

1. ADR-015 and architecture docs agree.
2. Existing provider-neutral application boundary remains intact.
3. Production provider is AvalAI.
4. Phase 3 production model is gpt-5.6-luna.
5. Responses API is used.
6. Existing strict idea_generation_v1 contract works through real AvalAI.
7. Exactly 20 valid EN ideas pass canonical validation.
8. Exactly 20 valid FA ideas pass canonical validation.
9. Invalid provider output remains safely rejected.
10. AvalAI errors normalize correctly.
11. Provider 429 remains distinguishable from workspace quota denial.
12. Secrets remain server-only.
13. Arbitrary production base URLs are impossible.
14. Deterministic automated tests require no AvalAI connection.
15. Real AvalAI tests remain opt-in/manual.
16. avalai-request-id is used for manual request/cost correlation.
17. Representative actual AvalAI costs are documented.
18. No unrelated feature work or provider infrastructure is introduced.
19. All existing Phase 3 automated tests continue to pass.
20. Working tree is clean after commit.

## Verification

Run:

npm run db:up
npm run db:check
npm run db:migrate:test

npm run format
npm run format:check
npm run test
npm run test:e2e
npm run lint
npm run typecheck
npm run build
git diff --check
git status --short

Then, only when AVALAI_API_KEY is intentionally configured:

execute the documented manual AvalAI compatibility/cost smoke.

## Completion report

Return:

- architecture/docs changes
- adapter/configuration changes
- automated tests
- live compatibility results
- EN result
- FA result
- structured-output result
- error-mapping result
- avalai-request-id handling
- measured provider usage
- measured billed cost
- deviations
- remaining risks
- commit hash

## Verification Addendum

### Live compatibility and cost smoke

The opt-in live smoke completed successfully using synthetic, non-sensitive
Content DNA. Raw transaction responses, request identifiers, prompts,
generated content, credentials, IP data, safety identifiers, API-key suffixes,
and grant identifiers are intentionally not recorded here.

English 20-idea generation:

- provider identity: `avalai`
- model: `gpt-5.6-luna`
- output: exactly 20 ideas
- input tokens: 400
- output tokens: 871
- reasoning tokens: 48
- total tokens: 1,271
- billed cost: `0.00112520 UNIT`
- paid grant: `249.40 IRT`
- canonical `avalai-request-id`: captured successfully

Persian 20-idea generation:

- provider identity: `avalai`
- model: `gpt-5.6-luna`
- output: exactly 20 ideas
- input tokens: 400
- output tokens: 1,207
- reasoning tokens: 43
- total tokens: 1,607
- billed cost: `0.00152840 UNIT`
- paid grant: `338.77 IRT`
- canonical `avalai-request-id`: captured successfully

AvalAI transaction metadata reported upstream provider `azure`. This is an
AvalAI routing detail only; Better Content continues to record and enforce
`provider = avalai` and `model = gpt-5.6-luna`.

### Historical migration review

Migration `0004_kind_dracula.sql` created the original provider/model checks
for `provider = openai` and `model = gpt-5.6-terra`. Migration
`0005_young_hardball.sql`:

1. Drops `ai_runs_provider_check` and `ai_runs_model_check`.
2. Recreates those same checks to permit both the historical OpenAI/Terra pair
   and the new AvalAI/Luna pair.

The migration contains only `ALTER TABLE ... DROP CONSTRAINT` and
`ALTER TABLE ... ADD CONSTRAINT` statements. It contains no `UPDATE`,
`INSERT`, `DELETE`, `MERGE`, `TRUNCATE`, table/column removal, or new data
columns. Therefore existing historical provider/model facts are not rewritten;
the OpenAI/Terra rows remain valid, and new AvalAI/Luna rows are permitted.

The current Drizzle schema matches the migration. No cost or request-ID
persistence was introduced: `ai_runs` retains only provider-neutral `usage`,
while `avalai-request-id` remains an adapter-local manual observability value.

A read-only query against the migrated test database confirmed that both
provider/model checks accept the OR expression for AvalAI/Luna and
OpenAI/Terra. The `ai_runs` columns contain `usage` but no cost, request-ID,
or upstream-provider persistence fields.

The development database passed readiness checks and the dedicated test
database applied all migrations successfully.

### Cost target

Both successful 20-idea generations are below the Phase 3 target of
`0.005 UNIT` per generation.
