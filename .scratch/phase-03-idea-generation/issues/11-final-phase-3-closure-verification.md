# Phase 3 Ticket 11 — Final Closure Verification

**Status:** resolved

**Blocked by:** 09, 10

## Objective

Close the three concrete Phase 3 review failures and investigate the recurring
Next.js stream warning without adding Phase 4 scope or changing the approved
architecture.

## Scope

- Add a real browser-triggered deterministic generation scenario.
- Add focused browser keyboard coverage for generation, decisions, and the
  existing rejection dialog focus behavior.
- Reconcile Ticket 09 and Ticket 10 tracker metadata.
- Reproduce and fix, or conclusively explain, the recurring Next.js stream
  warning.
- Retain existing responsive, locale, RTL/LTR, lifecycle, failure, quota, and
  provider-boundary coverage.

## Acceptance criteria

- The browser triggers the real server action/application service path through
  the deterministic provider and persists exactly 20 ideas.
- The successful test proves one deterministic provider invocation, requested
  language, completed batch history, persisted ideas, and zero AvalAI requests.
- Generation and decision controls work through native keyboard activation;
  current/disabled state is programmatically represented.
- Rejection dialog keyboard focus, containment, Escape restoration, and
  keyboard submission remain correct.
- Existing 390px, 768px, and 1280px responsive and EN/FA/RTL coverage remains
  green.
- Ticket 09 and Ticket 10 use repository-standard `resolved` status metadata.
- Phase 3 remains `Ready for review` until this ticket's limited re-review.
- The stream warning is fixed or documented with reproducible evidence as
  harmless.
- No database migration or Phase 4 functionality is introduced.

## Verification commands

```text
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
```

## Answer

## Successful Browser Generation

Added a Playwright scenario that creates an authenticated user and AI-ready
Content DNA, opens `/en/ideas`, and clicks the real `Generate 20 Ideas` button.
The production composition remains AvalAI-backed by default. The E2E server
sets the guarded `BETTER_CONTENT_E2E=1` flag, which selects the existing
provider-neutral deterministic fake behind the same generation application
service. The test verifies:

- one fake-provider invocation for `en` and count `20`;
- zero requests to `https://api.avalai.ir/**`;
- the success notice and completed history entry;
- exactly 20 rendered ideas; and
- one completed persisted batch, one completed AI run, and exactly 20 persisted
  ideas with `en` language.

The completed batch and ideas are therefore created by the browser-triggered
server action and normal orchestration, not by SQL seeding.

## Keyboard Generation Verification

Added keyboard coverage that focuses the native Generate button and activates
it with `Enter`. The same real deterministic generation workflow completes,
renders 20 ideas, and restores focus to the Generate button after the server
refresh. No custom keyboard handler was added; native button semantics are
used.

## Keyboard Decision Verification

The keyboard scenario focuses and activates Accept with `Enter`, then Save for
later with `Space`, asserting `aria-pressed`, visible current status, and the
same-state Save action's disabled state. It then activates Reject with the
keyboard, submits a reason through the keyboard, and asserts the final
Rejected state and disabled current action.

## Dialog / Focus Verification

The existing dialog coverage remains. The new keyboard scenario additionally
opens Reject with `Enter`/`Space`, verifies initial textarea focus, verifies
three tab moves remain inside the dialog, closes with Escape, verifies focus
returns to Reject, and submits the second rejection through keyboard
activation.

## Responsive / Locale Regression Verification

Existing EN/FA, LTR/RTL, mixed-language, and responsive coverage remains in
`e2e/ideas.spec.ts`, including verified widths 390px, 768px, and 1280px. The
new success and keyboard scenarios intentionally run in one deterministic
English locale as required by the ticket and do not multiply the matrix.

## Ticket Status Reconciliation

- Ticket 09 now has repository-standard `**Status:** resolved` metadata.
- Ticket 10 now exists at this ticket directory's standard issue path and has
  `**Status:** resolved` plus its objective, scope, findings, acceptance
  criteria, verification, and final status.
- Phase 3 remains `Ready for review` in
  `docs/phases/phase-03-idea-generation.md`.

## Next.js Stream Warning Investigation

Reproduction before the fix:

- `npm run test:e2e` reproduced `Error: The destination stream closed early`
  during the full authentication → Content DNA → Ideas sequence.
- The warning appeared after the workspace rate-limit test and before the
  following conflict test. The isolated conflict test did not reproduce it.
- The workspace rate-limit action creates no batch and no provider request, but
  the client still called `router.refresh()` after displaying the denial.

Root cause and fix:

- The no-record workspace quota denial caused an unnecessary RSC refresh. The
  browser test could finish and close the page while that destination stream
  was still active, producing React/Next's early-close diagnostic.
- The Ideas workspace now skips that refresh only for
  `RATE_LIMITED` responses whose source is `workspace`. Successful generation,
  provider failures, and retry paths still refresh because their server data
  changes.
- The keyboard focus restoration was implemented separately in the existing
  Ideas client boundary so the final server refresh leaves focus on Generate.

Evidence after the fix:

- The focused quota-denial → conflict sequence passed without the warning.
- The full 12-test E2E suite passed twice on the final tree without the warning.
- Provider failure, workspace quota denial, conflict, successful generation,
  decision, dialog, locale, RTL, and responsive checks all remained green.

This is a real lifecycle fix, not stderr filtering or a sleep. The skipped
refresh is safe because the workspace denial commits no batch/run/reservation
state, and the localized notice already communicates the result. No response
or persisted data is lost; the database count assertion remains unchanged.

## Tests

- `npm run db:up` — passed.
- `npm run db:check` — passed.
- `npm run db:migrate:test` — passed.
- `npm run format` — passed; no formatting errors.
- `npm run format:check` — passed.
- `npm run test` — passed: 24 unit files / 161 tests and 7 integration files / 80 tests.
- `npm run test:e2e` — passed twice on the final tree: 12 tests each run.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `git diff --check` — passed.

Frontend review used the Playwright, diagnosing-bugs, Vercel React Best
Practices, and Web Interface Guidelines skills. The implementation preserves
native semantic controls, visible focus styles, live status feedback, and the
existing EN/FA responsive surface.

## Full Verification

No database migration was created. Production still selects AvalAI with the
existing provider-neutral boundary; only the guarded E2E composition selects
the deterministic fake. No Phase 4 functionality was added.

## Final limited closure re-review

Standards review: PASS. The change keeps the Ideas surface on semantic Button
and Dialog primitives, preserves visible focus and live status feedback, keeps
the E2E-only diagnostic route guarded, and follows the repository's server/client
boundary.

Spec review: PASS. The three previously reported closure failures are covered
by the real browser generation path, keyboard generation/decision assertions,
and resolved Ticket 09/Ticket 10 metadata. The stream warning has a focused
reproduction, a lifecycle-safe fix, and two clean full-suite repetitions.

## Remaining Risks

The worktree contains pre-existing Phase 3 AvalAI migration/provider and
documentation changes outside this ticket. They were preserved and not
rewritten. A final limited closure re-review of the three prior failures and
the stream warning is still the next product-review step.

TICKET 11 COMPLETE
