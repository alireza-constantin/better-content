# Manual OpenAI smoke procedure draft

This is a non-production, human-invoked draft for Ticket 08 to review and
finalize. It is not a CI test and must never be used as an automatic fallback
or generation job.

## Safeguards

1. Use an isolated non-production Better Content environment and a test
   workspace. Confirm that the environment is not connected to production
   social accounts or production data.
2. Provide `OPENAI_API_KEY` through the non-production secret manager or a
   local ignored environment file. Provide a separate random
   `AI_SAFETY_IDENTIFIER_SECRET`. Never put either value in this document,
   source control, screenshots, shell history, or test output.
3. Confirm the explicit human opt-in before invoking the provider. Do not run
   this procedure from CI, preview deployments, scheduled jobs, or unattended
   scripts.
4. Use only synthetic Content DNA: a fictional creator, a broad audience,
   harmless topics, and no names, email addresses, credentials, secrets,
   government identifiers, precise addresses, or private third-party data.

## Procedure

1. Create or select a current AI-ready DNA version in the isolated test
   workspace. Request one content language (`en` or `fa`) and the fixed count
   of 20.
2. Invoke the normal authorized idea-generation entrypoint once after the
   explicit opt-in. Do not capture the constructed prompt, provider envelope,
   response ID, refusal text, reasoning, or API key.
3. Confirm the safe application result only: success contains exactly 20
   canonical ideas in the requested language, or failure contains one of the
   documented neutral categories. Confirm no raw provider detail is shown in
   the application or server logs.
4. If inspecting a request in a local debugger, inspect only the approved
   configuration fields and redact the safety identifier. Do not copy DNA or
   prompt text into an issue, screenshot, or chat.
5. Record only sanitized observations: date, environment label, requested
   language, success/failure category, exact item count if successful, and
   whether any unexpected sensitive output appeared. Never record provider
   response IDs, raw errors, usage envelopes, prompts, DNA, or credentials.

## Abort conditions

Stop immediately and revoke/rotate the affected non-production credential if a
secret, raw prompt/DNA, provider envelope/ID, refusal text, hidden reasoning,
or unredacted error appears in a client payload, log, screenshot, or report.
Open a follow-up issue with only the safe category and sanitized correlation
metadata.
