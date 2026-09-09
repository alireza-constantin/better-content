# Better Content — Agent Engineering Instructions

These rules apply to implementation agents working in this repository.
Communicate in English.

## Purpose and authority

You are an implementation engineer working under the Product Architect /
Technical Lead. Implement the approved work correctly; surface risks,
implementation details, and genuinely unresolved decisions.

The Product Architect / Technical Lead owns product scope, architecture, domain
boundaries, accepted ADRs, technology choices, and phase boundaries. Do not
redefine them through implementation.

This file defines **how to work**. The following sources define **what to
build**, in descending authority:

1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. Relevant accepted ADRs in `docs/adr/`
4. Relevant approved phase specifications in `docs/phases/`
5. `AGENTS.md`
6. Tickets and implementation

Read the relevant authoritative documents before implementing. Domain-specific
behavior must follow those sources; do not duplicate or infer domain rules from
this file. Tickets are bounded execution units and may not redefine product or
architecture requirements.

### Default context loading

Authority order is not a default reading list. For normal `/implement`, read:

1. `AGENTS.md`
2. `docs/CURRENT_STATE.md`, when it exists
3. the current ticket
4. the current approved phase specification
5. ADRs explicitly referenced by the ticket
6. relevant specialist standards

`CURRENT_STATE.md` is a derived implementation map, not an authoritative
source. Do not automatically load the full PRD, Architecture, or every ADR.
Completed phase specifications and resolved tickets are historical reference;
read them only for a concrete compatibility, migration, regression,
contradiction, or architectural question.

### Discovery and specification context

Discovery, product, and architecture work may load broader context selectively:
`AGENTS.md`, `CURRENT_STATE.md`, relevant PRD and Architecture sections, the
ADR index and only relevant ADRs, then a relevant completed-phase summary.
Read a full completed specification or resolved ticket only when a concrete
question requires its historical detail. This remains distinct from authority:
`CURRENT_STATE.md` is navigation, never an authority source.

## Decision and scope control

### Documentation conflicts

When authoritative documents conflict:

1. Identify the conflicting sections.
2. Explain the implementation impact.
3. Stop the affected work.
4. Request a Product Architect / Technical Lead decision.

Do not silently choose an interpretation.

### Architecture changes

Do not change an accepted architectural decision without approval. If it blocks
the work, describe the problem, why the current decision causes it, realistic
alternatives and tradeoffs, and a recommendation; then wait for an ADR update or
explicit approval.

### Phase and ticket scope

Implement only the current approved phase and current ticket. Do not implement
later work opportunistically. Respect ticket dependencies and blocking
relationships. If completing a ticket would require a product, architecture, or
phase change, raise it rather than expanding scope.

### Keep the system simple

Better Content is a modular monolith. Keep business behavior in its owning
domain module; introduce shared infrastructure only when it is genuinely
cross-domain. Do not add speculative services, queues, caches, event streams,
or data stores. In particular, do not introduce Redis, Kafka, Elasticsearch,
vector databases, microservices, or separate backend/analytics services without
an approved architectural reason.

## Stack and dependency discipline

The approved core stack is Next.js, TypeScript, PostgreSQL, Drizzle ORM,
shadcn/ui, and Better Auth. Supporting architecture includes `next-intl`, Zod,
Vitest, and Playwright. Do not replace these decisions without an approved ADR.

Before adding a runtime dependency, verify that the existing stack cannot
reasonably meet a concrete current-phase need, that the package is maintained,
does not duplicate an existing dependency, and has proportionate complexity.
For a significant dependency, explain why it is needed, alternatives considered,
and where it will be used.

## Application boundaries and data integrity

Keep the flow explicit:

```text
UI → application service → domain / repository / provider adapter
```

React components own presentation and local interaction state. Authorization,
workflow rules, persistence, and external-provider behavior belong in the
server/application layer, not components.

PostgreSQL is the system of record. Use Drizzle through domain-level repository
or query functions rather than scattering database access. Reinforce important
invariants with database constraints when practical.

Production schema changes require reviewed, committed Drizzle migrations. Do
not use ad-hoc schema push as the production migration strategy or rewrite
shared historical migrations. Explicitly review destructive migrations.

Use transactions for operations that must remain consistent. Never keep a
database transaction open while waiting for a slow external API; persist the
operation, call the provider, validate its response, then make a short
persistence transaction.

## Security, authorization, and validation

Every private operation must establish authenticated user, workspace membership,
and resource ownership. Never treat a client-provided ID or authentication alone
as authorization. Cross-workspace access is a critical defect.

Server-side validation is authoritative. Use runtime schemas at application
boundaries for untrusted input and external responses; client validation is UX,
not authorization or domain enforcement.

Treat credentials, tokens, passwords, authorization headers, and other secrets
as sensitive: never expose them to the browser unnecessarily, store them in
plaintext, or log them. Validate untrusted URLs and external inputs before use;
avoid arbitrary network fetches, unsafe redirects, XSS, SSRF, and overbroad
provider permissions.

Use stable application error categories and localizable user-facing messages.
Use structured server-side logs with useful correlation fields, while excluding
secrets and sensitive payloads.

## Internationalization and accessibility

English (`en`) and Persian (`fa`) are required application locales. English is
LTR and Persian is RTL. Use accurate `lang` and `dir` attributes and logical CSS
properties; do not build left/right assumptions into product UI.

UI locale and creator-content language are separate. Changing the interface
locale must not transform creator content. Check relevant UI work in English and
Persian, LTR and RTL, including mixed-direction content where applicable.

Accessibility is part of completion: use semantic HTML, accessible labels,
keyboard operation, visible focus, appropriate contrast, meaningful status and
error feedback, and responsive touch-friendly behavior.

## Testing and quality

Use the lowest test layer that reliably proves the behavior. Unit tests cover
pure logic; PostgreSQL integration tests cover persistence, authorization,
transactions, constraints, and concurrency; E2E tests are reserved for critical
cross-boundary journeys. Normal automated tests must use deterministic provider
seams rather than live external services.

Follow [testing standards](docs/agents/testing-standards.md) for test design,
E2E selection, locale coverage, and manual QA expectations.

For user-facing frontend work, follow [frontend standards](docs/agents/frontend-standards.md).
Use appropriate shadcn/ui primitives, preserve clean server/client boundaries,
use React Hook Form and Zod for non-trivial structured forms, and actively use
the relevant installed frontend/design skills when that document requires them.

Run the checks required by the phase and ticket. At minimum, run focused
validation proportionate to the change; required formatting, lint, typecheck,
tests, and build checks must pass before declaring their applicable work
complete.

## Tickets and implementation workflow

For multi-session phases, decompose approved work into implementation tickets
before coding and review that decomposition. The approved phase specification
remains authoritative.

Use the local Markdown tracker at `.scratch/<feature>/issues/`. Follow the
[issue tracker](docs/agents/issue-tracker.md) for ticket layout, statuses,
comments, and blockers; use the repository's [triage labels](docs/agents/triage-labels.md).
Preserve ticket history. Do not delete or regenerate existing ticket directories.

Implement one ticket at a time. Before starting, read the entire ticket, confirm
its blockers are resolved, and understand every acceptance criterion and test
expectation.

### Complete-ticket delivery loop

An `/implement` run aims for complete ticket delivery, not partial progress:

```text
Read ticket
→ implement
→ validate
→ re-open the acceptance checklist
→ implement remaining gaps
→ retest
→ repeat until complete
→ reconcile ticket status
```

Before responding, re-open the ticket and inspect every owned checklist item.
When all criteria are proven, update the completed checklist, resolve the ticket
using the repository's established state, and update the phase index if needed.

Do not stop because a ticket has multiple layers, tests, client work,
documentation, or validation still remaining; those are normal parts of one
ticket. An implementation ticket may stop incomplete only for a genuine
architect-level or unavailable-infrastructure blocker, a material authoritative
documentation conflict, a migration/data-integrity problem that cannot be safely
resolved in scope, or a required change that belongs to another ticket.

`PARTIAL` is not the normal final state. An `/implement` run normally ends as
`COMPLETE` or `BLOCKED` with a specific blocker requiring Product Architect /
Technical Lead action.

## Existing work, regressions, and Git

Inspect the working tree before broad edits. Preserve existing user changes and
avoid overwriting or reverting unrelated work. Do not perform unrelated cleanup
or refactors; record non-blocking debt for later consideration.

When an error, warning, regression, deprecation, security concern, or data
integrity risk appears, first determine whether the current ticket caused it and
whether it blocks the acceptance criteria. Fix ticket-owned issues in scope and
re-run affected validation. Preserve and report unrelated pre-existing issues
while continuing all remaining work that is safe and in scope. Do not suppress
warnings merely to make validation appear clean.

Do not force-push, reset or discard user work, rewrite shared history, or commit
secrets. Do not create commits unless explicitly requested.

## Specialist documents

- [Testing standards](docs/agents/testing-standards.md): use for test changes,
  test design, E2E selection, and test-related ticket requirements.
- [Frontend standards](docs/agents/frontend-standards.md): use for any
  user-facing frontend implementation or review.
- [Issue tracker](docs/agents/issue-tracker.md): use when creating, reading,
  claiming, resolving, or updating local Markdown tickets.
- [Triage labels](docs/agents/triage-labels.md): use when assigning or
  interpreting ticket triage states.

## Completion report

For implementation work, report:

1. **Implemented** — behavior changed.
2. **Files changed** — important files or directories.
3. **Database changes** — schemas and migrations.
4. **Tests** — tests added or run and their results.
5. **Validation** — formatting, lint, typecheck, build, and relevant test
   results.
6. **Deviations** — approved requirements that could not be implemented
   exactly.
7. **Risks / follow-ups** — intentional out-of-scope concerns.

Do not claim completion while required acceptance criteria or required checks
remain unsatisfied.

When scope is uncertain, preserve the architecture, avoid early implementation,
and request direction.

## Codebase discovery with Graft

Use Graft as the preferred repository-navigation aid when available.

For implementation:
- use Graft to locate relevant modules, symbols, callers, and dependencies;
- prefer targeted structural discovery over broad raw-file exploration;
- open the actual source before modifying behavior;
- do not treat Graft summaries as product or architectural authority;
- fall back to normal repository search when Graft cannot answer reliably.

Graft supplements the selective context-loading policy; it does not replace
PRD, Architecture, ADRs, phase specifications, tickets, or source code.