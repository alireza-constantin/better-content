# 09 — Deliver Generate Script UI and synchronous operation feedback

**What to build:** Deliver the reusable localized Generate Script action and
form for accepted-Idea generation, wire it through server actions to the
production/fake provider composition, show immediate local feedback during the
synchronous request, redirect only after Content exists, and render safe
failure, Retry, and observed durable Attempt states. The primary first-
generation presentation is the Phase 4 Content Production Queue; this ticket's
capability is reused there rather than expanded inline on every Idea card.

**Blocked by:** 04 — Implement the ADR-016 AvalAI Content Script adapter; 06 — Execute generation and create Content artifacts atomically; 07 — Deliver authorized Content reads, Attempt history, and retry; 10 — Deliver the Content list and Script editor with serialized autosave.

**Status:** resolved

## Goal

Let an authorized creator deliberately turn an accepted Idea into a Script while preserving the approved synchronous execution and durable Attempt model.

## Scope

- Expose the reusable Generate Script capability only for accepted Ideas,
  including Ideas that already have Content. Ticket 13 owns its primary queue
  presentation.
- Add a focused React Hook Form + Zod form with language, SHORT/LONG format, and optional instructions only.
- Default language from current DNA’s default language and restrict choices to its supported `en | fa` languages.
- Submit a fresh idempotency key through a minimal server action to the Content application service.
- Immediately show local generating/pending feedback while the single synchronous request is in flight.
- Redirect to the localized `/content/{id}` only after successful atomic completion.
- Redirect to the real Ticket 10 `/content/{id}` Script editor; do not add a temporary, placeholder, or generation-only editor route.
- Show safe localized validation, conflict, WORKSPACE/PROVIDER rate-limit, provider failure, interrupted, and Retry behavior.
- Extend authorized source-Idea detail/history to render canonical inputs and persisted PENDING/RUNNING/FAILED/COMPLETED Attempts correctly.
- Wire guarded deterministic provider composition for UI/component/E2E tests while production selects the AvalAI adapter.

## Explicit non-goals

- Polling, split start/status endpoints, jobs, `after()`, `waitUntil()`, simulated background execution, cancellation, provider abort, progress percentages, or survival guarantees.
- Model/provider/prompt/sampling controls, historical DNA selection, language detection, generation count, AI rewrite/regenerate, or automatic Content creation on acceptance.
- Any temporary or placeholder Content editor route, duplicate editor surface, or redirect target that bypasses Ticket 10.

## Source-of-truth references

- Phase 4 §§10–13, 21–25, 27–29, 31, and Draft/UX plus provider/i18n acceptance criteria.
- Frontend standards §§1–10.
- Architecture §§8, 13, 20–29A, 71–75, 84–96.
- ADR-002, ADR-005, ADR-010, ADR-011, ADR-015, and ADR-016.
- Existing localized Ideas page, action, error, fake-provider telemetry, and focus patterns.

## Required implementation guidance

- Use Server Components for authorization/initial DTOs and the smallest practical client boundary for form/request state.
- Use existing shadcn/ui primitives and the exact relevant installed frontend/design skills during implementation and review, as required by `frontend-standards.md`.
- UI consumes application DTO/actions only; it never imports Drizzle, AvalAI/OpenAI SDKs, repositories, or domain persistence rows.

## Required behavior

- NEW/SAVED/REJECTED Ideas cannot initiate generation and expose no misleading enabled action.
- Accepting an Idea itself remains side-effect-free.
- The form contains no field beyond approved inputs and visibly enforces the 1,000-character instruction limit.
- Duplicate submission/loading states prevent misleading extra requests while idempotency remains server-authoritative.
- Fast success may feel immediate; slow execution shows local in-flight state without assuming a durable active-status fetch.
- Synchronous failure retains safe inputs and offers retry where allowed.
- Observed stored active Attempts render their durable state but do not cause polling or background execution.
- Navigation sends no cancellation request.

## Persistence constraints

- Components perform no direct persistence.
- The action does not manufacture Content or lifecycle state; it returns application-service results.
- Failed Attempts stay in source-Idea history and never appear in Content lists.

## Security and authorization requirements

- Server entrypoints require owner authority for generation/retry and authorize before returning Attempt instructions/replay results.
- Provider/AI settings, raw errors, prompts, DNA, credentials, and internal rows never enter client props/markup.
- Creator text is rendered as text, not trusted markup.

## EN/FA and RTL/LTR requirements

- All visible strings use `next-intl`; English is LTR and Persian RTL with logical-direction layout.
- Content language choices are independent of UI locale and Idea language.
- Form, history, errors, loading states, focus, and mixed-direction instructions are verified in both locales.

## Acceptance criteria

- [x] Accepted-Idea generation capability → form → deterministic successful
      Attempt redirects to localized editor after Content exists; the primary
      first-generation entry point is the future Production Queue.
- [x] The redirect target is Ticket 10’s real authorized Script editor; no placeholder or temporary editor route exists.
- [x] NEW/SAVED/REJECTED Ideas cannot generate, while an accepted Idea with existing Content can generate again.
- [x] Form contains exactly language, format, and optional instructions and sends no provider/model/prompt controls.
- [x] Immediate accessible local generating feedback is visible during the synchronous request.
- [x] Persisted PENDING/RUNNING states render when observed with no polling/background mechanism.
- [x] Conflict, validation, both rate-limit sources, provider failures, and interrupted failures are safely localized; eligible FAILED history offers Retry.
- [x] Retry delegates to Ticket 07 behavior and a successful retry redirects only after its new Content exists.
- [x] Navigation creates no cancellation transition and no CANCELLED UI/state exists.
- [x] Components have correct labels, focus, disabled states, announcements, touch targets, mobile behavior, EN/FA, and RTL/LTR.

## Presentation correction

Ticket 09's generation logic, form, action, synchronous feedback, retry, and
authorized Attempt behavior remain reusable. The primary first-generation
presentation is moved to future Ticket 13's Content Production Queue; the Idea
Library must not expand full Attempt history or place this action on every Idea
card. This documentation correction does not discard or reimplement Ticket 09.

## Required tests

- **Unit:** server-action result mapping and guarded provider composition.
- **Integration:** action → service authorization, success/failure/retry, no direct provider call on rejected preflight.
- **Component:** form validation, exact inputs, in-flight state, safe error/source mapping, history states, retry, keyboard/focus, EN/FA/RTL.
- **E2E:** one deterministic successful synchronous flow and key failure/active-state paths; full matrix remains Ticket 11.

## Dependencies and blockers

- Blocked by Tickets 04, 06, 07, and 10.
- Blocks Ticket 11.

## Expected verification commands

```text
npm run db:up
npm run db:check
npm run db:migrate:test
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
git diff --check
```

## Comments

- Added the localized accepted-Idea Generate Script dialog with React Hook Form + Zod, current-DNA language defaults, exact SHORT/LONG inputs, 1,000-character instructions, synchronous loading feedback, safe failures, and focus restoration.
- Connected the client boundary to the existing Content application generation/retry services. Production keeps the AvalAI adapter; E2E runs use the guarded deterministic fake and telemetry seam. Successful actions require a resulting Content ID before routing to the real localized Ticket 10 editor.
- Added authorized accepted-Idea Attempt history rendering for PENDING, RUNNING, FAILED, and COMPLETED, including canonical instructions, derived Content links, and FAILED-only retry.
- No database schema or migration changes were needed. No Ticket 11/live AvalAI smoke work was started.
- Verification: database setup/check/migration passed; focused UI/action tests passed 46/46; full unit tests passed 34 files/282 tests; full integration tests passed 10 files/147 tests; format, lint, typecheck, build, full E2E (24/24), and `git diff --check` passed.
