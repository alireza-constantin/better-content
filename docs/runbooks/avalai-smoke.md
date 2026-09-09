# AvalAI Manual Smoke Runbook

Use this opt-in, non-production procedure only when intentionally validating
the current Phase 3 AvalAI idea-generation integration. It is not CI, a retry
mechanism, a fallback, or a background job.

## Preconditions

- Use an isolated non-production environment and test workspace.
- Supply server-only `AVALAI_API_KEY` and `AI_SAFETY_IDENTIFIER_SECRET` through
  an ignored local environment file or secret manager; never put either value
  in source control, screenshots, shell history, or test output.
- Confirm an AvalAI API balance for the account. A ChatGPT subscription does
  not authorize or pay for Better Content API usage.
- Use synthetic Content DNA only. Do not submit personal data, credentials,
  secrets, precise locations, or third-party private information.

## Procedure

1. Run deterministic checks first: `npm run db:check` and
   `npm run ai:avalai:smoke`.
2. Start the isolated application with `npm run dev`.
3. Through the authorized Ideas workflow, generate once in English and once in
   Persian from current AI-ready synthetic DNA.
4. Confirm each successful request produces exactly 20 ideas in the requested
   language and passes canonical server validation.
5. Confirm browser responses and logs expose no prompt, DNA, generated text,
   raw provider response, refusal text, reasoning, or secret.

The current adapter uses AvalAI's Responses-compatible endpoint and the fixed
`gpt-5.6-luna` model. Do not add a provider/model override while running this
procedure.

## Safe observations and failure handling

Record only the date/environment, language, result category, model, item
count, neutral usage, and `avalai-request-id` when available. If transaction
cost reconciliation is required, use the restricted non-production report and
retain only billed usage/cost fields; never retain raw transaction payloads.

Stop and rotate the non-production credential if a secret, raw prompt/DNA,
provider envelope or identifier, refusal text, hidden reasoning, or unredacted
error appears in a client payload, log, screenshot, or report. Record only a
safe category and sanitized correlation metadata in any follow-up issue.

For the original Phase 3 execution record and detailed historical procedure,
see `.scratch/phase-03-idea-generation/avalai-manual-smoke-procedure.md`.
