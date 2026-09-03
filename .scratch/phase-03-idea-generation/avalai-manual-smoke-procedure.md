# Manual AvalAI compatibility and cost smoke procedure

This is a non-production, human-invoked procedure for Phase 3 Ticket 09. It
is not a CI test, an automatic fallback, a retry mechanism, or a generation
job. The smoke is opt-in and should be run only when `AVALAI_API_KEY` is
intentionally configured.

## Important account boundary

A ChatGPT subscription is irrelevant to Better Content API execution. Better
Content calls AvalAI with the server-side `AVALAI_API_KEY`; a ChatGPT plan does
not provide, authorize, or pay for those API calls.

Before starting, confirm that the isolated AvalAI account has a normal API
balance/credit available for the requested model. Do not assume that a ChatGPT
subscription, an AvalAI web subscription, or a promotional credit covers the
API account used by this procedure.

## Safeguards

1. Use an isolated non-production Better Content environment and a test
   workspace. Confirm that the environment is not connected to production
   social accounts or production data.
2. Provide `AVALAI_API_KEY` through the non-production secret manager or a
   local ignored environment file. Provide a separate random
   `AI_SAFETY_IDENTIFIER_SECRET`. Never put either value in this document,
   source control, screenshots, shell history, or test output.
3. Confirm explicit human opt-in before invoking the provider. Do not run this
   procedure from CI, preview deployments, scheduled jobs, or unattended
   scripts.
4. Use only synthetic Content DNA: a fictional creator, broad audience,
   harmless topics, and no names, email addresses, credentials, secrets,
   government identifiers, precise addresses, or private third-party data.

## Configuration and command

Set the two server-only variables in the ignored local environment file or
secret manager. Do not paste real values into a terminal transcript:

```text
AVALAI_API_KEY=<non-production AvalAI API key>
AI_SAFETY_IDENTIFIER_SECRET=<random server-only secret of at least 32 characters>
```

Run the deterministic checks first, then start the isolated application for
the normal authorized workflow:

```text
npm run db:check
npm run ai:avalai:smoke
npm run dev
```

The adapter fixes the production origin to `https://api.avalai.ir/v1`, uses
the `openai` npm SDK only inside the adapter, calls Responses, and uses
`gpt-5.6-luna`. There is no production `AI_BASE_URL`, `OPENAI_BASE_URL`, or
provider/model selector to override these values.

## Compatibility checks

The smoke harness performs sanitized minimal English and Persian Responses
requests and the real adapter's exact 20-idea workflow for both languages.
The normal Better Content UI flow must also be exercised:

1. Create or select a current AI-ready DNA version in the isolated workspace.
2. Generate once in English and once in Persian through the authorized Ideas
   entrypoint. Use the fixed count of 20.
3. Confirm success contains exactly 20 ideas, that each result is in the
   requested language, and that canonical server validation succeeds.
4. Confirm no provider body, prompt, Content DNA, refusal text, reasoning, or
   raw error appears in the browser, application response, or server logs.
5. Confirm the deterministic adapter tests cover refusal, incomplete output,
   invalid API key/401, invalid model, 429, timeout, representative 5xx, and
   safe unknown-error mapping. Do not manufacture provider failures against a
   live account just to exercise those cases.

The test harness records only sanitized success/failure categories, item
counts, neutral usage, and the canonical `avalai-request-id`. It never prints
generated idea text or raw provider responses.

## Request ID and transaction lookup

When the AvalAI SDK transport exposes response headers, the adapter captures
only the canonical `avalai-request-id` header through its adapter-local
observability seam. Do not use the OpenAI SDK convenience `_request_id` value,
`x-request-id`, a response object ID, or a raw provider envelope as a
substitute. If `avalai-request-id` is absent, record request correlation as
unavailable and stop the cost-correlation portion of the smoke; do not guess
or fall back to another identifier.

For each representative successful English or Persian generation:

1. Record the sanitized date, language, model, neutral usage, and
   `avalai-request-id`.
2. Wait until the transaction is available (AvalAI documents that processing
   may take up to 30 seconds).
3. Call the AvalAI User API transaction lookup:

```text
POST https://api.avalai.ir/user/v1/transactions/lookup
Authorization: Bearer <AVALAI_API_KEY>
Content-Type: application/json

{"transaction_ids":["<avalai-request-id>"]}
```

4. Record only the returned model, input/prompt tokens, cached tokens when
   available, output/completion tokens, total/neutral usage, billed cost, and
   billing source/unit when returned. Do not retain IP address, API-key
   suffix, raw transaction JSON, or unrelated account metadata.
5. Prefer several representative EN and FA runs. Use provider-billed values as
   the cost source of truth and compare each successful 20-idea generation to
   the evaluation target of `<= $0.005` equivalent. Report actual cost even if
   it exceeds the target; never change count, model, reasoning, prompt, output
   limits, or product semantics to force the target.

## Sanitized report template

```text
date/environment:
language: en | fa
result: success | TIMEOUT | RATE_LIMITED | PROVIDER_UNAVAILABLE | INVALID_OUTPUT | UNKNOWN
model: gpt-5.6-luna
idea_count: 20 | 0
avalai-request-id: <record only in the restricted smoke report>
input_tokens:
cached_tokens:
output_tokens:
total_tokens:
billed_cost:
billing_source:
within_0.005_target: yes | no | unavailable
unexpected_sensitive_output: no | yes
```

Never commit this report, credentials, raw Content DNA, raw generated creator
content, prompts, provider envelopes, response IDs, refusal text, reasoning,
or raw transaction responses.

## Abort conditions

Stop immediately and revoke/rotate the affected non-production credential if a
secret, raw prompt/DNA, provider envelope/ID, refusal text, hidden reasoning,
or unredacted error appears in a client payload, log, screenshot, or report.
Open a follow-up issue with only the safe category and sanitized correlation
metadata.
