# Phase 3 Ticket 12 — Fix E2E Environment Merge Regression

**Status:** resolved

## Problem

The merged E2E server environment assigned `AI_SAFETY_IDENTIFIER_SECRET`
twice. TypeScript rejected the duplicate object key, blocking build, typecheck,
and the Playwright server startup.

## Scope

Correct the focused E2E environment merge defect and perform final Phase 3
verification. Do not change product behavior or the AvalAI production-provider
architecture.

## Acceptance criteria

- [x] `AI_SAFETY_IDENTIFIER_SECRET` has one authoritative E2E assignment.
- [x] Typecheck and build pass.
- [x] The production AvalAI environment contract is unchanged.
- [x] E2E uses guarded deterministic fake-provider behavior and never calls live AvalAI.
- [x] The full Playwright suite passes twice without the stream-warning regression.
- [x] Browser generation, exact-20 persistence, keyboard/dialog, rate-limit, EN/FA RTL,
      responsive, and authorization coverage execute successfully.
- [x] The working tree is clean after the authorized corrective commit.
- [x] Phase 3 remains `Ready for review` pending the final closure review.

## Resolution

Removed the obsolete empty `AI_SAFETY_IDENTIFIER_SECRET` assignment from the
merged E2E environment. The remaining synthetic server-only value is used only
by the guarded `BETTER_CONTENT_E2E=1` process; the Ideas application selects
its deterministic fake provider in that mode, so no live AvalAI request is
made.

## Verification

- `npm run typecheck` and `npm run build` passed.
- Database readiness, migration isolation, formatting, lint, and unit and
  integration tests passed.
- `npm run test:e2e` passed twice consecutively: 12 Playwright tests each run.
- The prior Next.js destination-stream warning did not recur. Expected safe
  structured warnings for simulated provider failure, workspace rate limit,
  and stale-DNA conflict remained visible.
- Phase 3 remains `Ready for review` pending its final closure review.
