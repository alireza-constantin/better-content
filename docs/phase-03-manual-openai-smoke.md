# Phase 3 manual OpenAI smoke procedure

This is an opt-in, non-production verification procedure. It is not a CI
test, a release gate, or a substitute for the deterministic unit,
PostgreSQL-integration, and Playwright tests.

## Safety rules

Before starting:

- Use a separate non-production OpenAI project and a short-lived, least-
  privilege API key. Never use a production key or a personal account key.
- Keep the key and AI_SAFETY_IDENTIFIER_SECRET in a local secret manager or
  an untracked .env.local. Do not commit them, paste them into chat, or put
  them in shell history.
- Use a fresh local/test database and a test account. Do not paste real names,
  emails, customer information, unpublished plans, credentials, or other
  sensitive material into Content DNA.
- Leave OPENAI_BASE_URL unset for this smoke test. It is reserved for the
  loopback-only automated E2E mock; the normal OpenAI endpoint is used when
  it is unset.

## Non-sensitive test DNA

Use only this public-style test context, or an equivalent synthetic context:

~~~text
Creator or brand: A public product-education channel for independent founders.
Audience: People learning to plan and improve small software products.
Primary topics: Product strategy, audience research, practical experiments.
Tone traits: Practical, clear, encouraging.
Content goal: Help people make better product decisions.
Preferred formats: Short educational videos and concise explainers.
Topics to avoid: Personal data, confidential business information, medical advice.
Approaches to avoid: Hype, fabricated claims, and manipulative urgency.
~~~

## Explicit opt-in invocation

1. Confirm the app is running against the fresh non-production database and
   that the browser is using a local development origin.
2. Set OPENAI_API_KEY and a dedicated 32-character-or-longer
   AI_SAFETY_IDENTIFIER_SECRET only in the local server environment.
3. Start the app with npm run dev.
4. Create a test account, save the synthetic DNA above, and confirm that the
   current version is AI-ready.
5. Open Ideas, select English, and explicitly click Generate 20 Ideas.
6. Repeat once with Persian only if the test DNA includes Persian in its
   content-language selection. UI locale and requested content language are
   separate; switching the UI to Persian must not translate existing ideas.

## Expected safe observation

One successful attempt should show one new batch tied to the current DNA
version, exactly 20 ideas, and the requested language. Accept, save, and
reject one idea individually. A rejected idea may have an optional synthetic
reason. Refresh the page and switch between /en/ideas and /fa/ideas; the
batch and decision states should remain intact, while the interface changes
direction and language.

If the provider fails, verify that the UI shows only a localized safe failure
and a retry action. Do not retry repeatedly; each user retry is a new provider
attempt and is subject to the workspace quota.

## Sanitized reporting and cleanup

Report only pass/fail, locale tested, requested language, whether exactly 20
ideas were returned, broad duration (for example, under or over 60 seconds),
and the safe application error category if applicable. Never log or capture
the API key, safety secret, raw prompt, Content DNA body, provider envelope,
provider or publication IDs, refusal text, response IDs, authorization
headers, hidden reasoning, screenshots containing test inputs, or full traces.

After the smoke test, stop the local server, remove the local test account and
data according to the local retention policy, revoke the non-production key,
and remove the secret values from the process environment. Record that this
manual check was performed outside CI; do not add live credentials or a live
provider dependency to automated tests.
