# 07: Build the localized, accessible Ideas workspace UI

**What to build:** A responsive `/en/...` and `/fa/...` Ideas surface where a workspace owner can choose an allowed generation language, start/review a safe operation, inspect compact history/detail, and make individual decisions through application DTOs.

**Blocked by:** 05: Orchestrate safe, idempotent idea generation; 06: Deliver authorized batch history, detail, retry, and idea decisions.

**Status:** ready-for-agent

## Goal

Deliver the approved Phase 3 UX with server-authoritative generation/decision behavior, intentional visual hierarchy, accessibility, and correct EN/FA LTR/RTL operation.

## Scope

- Create the localized workspace-scoped Ideas route with Server Components for authorization/initial DTO data and focused client components for generation/decision interactions.
- Render no-DNA, incomplete-DNA, ready language selection/Generate 20 Ideas, PENDING/RUNNING, rate-limited, current-DNA conflict, provider failure, history, completed detail, active detail, Retry, and individual decision states.
- Add all message keys, responsive visual design, accessible optional reject-reason interaction, and Playwright/component coverage appropriate to this UI ticket.

## Relevant source-of-truth references

- `AGENTS.md` §§10, 13, 36–39, 42, 47, 50–51, 60.
- `docs/agents/frontend-standards.md` §§1–10.
- `docs/PRD.md` §§4–5, 12–16.
- `docs/ARCHITECTURE.md` §§13, 72–75, 84–90, 92–96.
- `docs/adr/ADR-011-ai-provider-boundary.md`.
- `docs/adr/ADR-014-initial-ai-provider-and-model-for-idea-generation.md`.
- `docs/phases/phase-03-idea-generation.md` §§7, 10–12, 14–16.

## Required implementation skills

- Actively use `frontend-design` for the product-surface hierarchy and visual review.
- Actively use `vercel-react-best-practices` for React/Next.js server/client, data-loading, and interaction boundaries.
- Actively use `web-design-guidelines` for accessibility, responsive, and UI-quality review.
- `design-taste-frontend` is not listed as installed in this workspace; do not claim it was used. If it becomes installed before this ticket starts, actively use it for the visually important Ideas surface.

## Architecture constraints

- UI consumes Ticket 06 application services/DTOs only; it never imports Drizzle, OpenAI, raw provider types, or business invariants.
- The server remains authoritative for readiness, authorization, current DNA, quota, idempotency, lifecycle, and error categories.
- Use appropriate existing shadcn/ui primitives; React Hook Form + Zod is required for non-trivial structured client forms such as reject reason, while server validation remains authoritative.
- Exclude product-scope expansion and decorative dashboard/fake-metric patterns.

## Expected behavior

- Default requested language to current DNA’s `defaultContentLanguage`, allow only its configured languages, and submit workspace ID/base version/language/new UUID—not a count or UI locale.
- Clearly guide no/incomplete DNA users back to Content DNA. Present localized safe error/action states for validation, conflict, rate limit, and provider failures.
- Display compact newest-first history and the chosen detail as Phase 3 §12 specifies; no search, filters, deletion, archive, comparison, analytics, quality score, or editing.
- Every idea offers keyboard-accessible Accept, Save for later, and Reject. Reject opens labelled optional ≤500-character reason UI with errors/status announcement; disabled/loading states prevent misleading repeat action.

## Persistence requirements

- UI performs no direct persistence. It uses application-service DTOs/actions and never exposes provider/private persistence fields.

## Authorization requirements

- Route/server entrypoint authorizes workspace membership and owner-only mutations before returning DTOs/actions. Client IDs/route state are not proof of access; foreign-resource outcomes stay non-enumerating.

## EN/FA + RTL/LTR requirements

- All visible strings use `next-intl` under locale routes. English is LTR; Persian is RTL with correct `lang`/`dir` and logical-direction CSS.
- Test history, controls, dialog, focus order, status feedback, and responsive layout in both directions. UI locale must never translate/mutate DNA, ideas, generated text, or mixed-direction rejection reasons.

## Security/privacy requirements

- Do not expose OpenAI keys, raw DNA/prompts, provider envelopes/IDs, refusal text, hidden reasoning, or raw errors in markup, client state, or accessible labels.
- Render AI text as ordinary text; do not execute generated markup. Send only minimal validated mutation input.

## Acceptance criteria

- [ ] An authorized owner can complete the mocked ready-DNA flow: select allowed language, Generate 20 Ideas, observe operation state, inspect exactly 20 results, and classify an individual idea.
- [ ] All required no-DNA/incomplete/active/rate-limited/conflict/failed/completed/history states are clear, safe, and localized.
- [ ] UI uses server/DTO boundaries, shadcn/ui where appropriate, focused client islands, and React Hook Form + Zod for the non-trivial rejection form.
- [ ] Keyboard, focus, semantic labels, associated errors, status announcements, disabled controls, touch targets, responsive layout, EN/FA, and LTR/RTL are verified.
- [ ] No forbidden/deferred controls or data leak into the UI.

## Focused tests

- Component/E2E tests using deterministic provider-backed services for ready generation/decision flow; no/incomplete DNA, active, rate-limited, conflict, failed, Retry; rejection reason; keyboard/focus/status feedback; locale switch; EN/FA LTR/RTL; desktop/mobile layouts.

## Required final verification commands

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
git diff --check
```

## Explicit out of scope

- Direct database/OpenAI use, provider selection/routing/fallbacks, prompt-management UI, historical DNA selection, count selector, languages beyond en/fa or bilingual flow, editing/bulk actions/deduplication, deletion/archive/search/filters/comparison/analytics/quality score, jobs, content, publishing, analytics, and social integrations.

## Dependencies

- 05: Orchestrate safe, idempotent idea generation.
- 06: Deliver authorized batch history, detail, retry, and idea decisions.
