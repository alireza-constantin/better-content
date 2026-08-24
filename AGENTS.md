# Better Content — Agent Engineering Instructions

This file defines the engineering rules for AI coding agents working on Better Content.

These rules apply to Codex and other implementation agents operating inside this repository.

---

# 1. Role of the Agent

You are an implementation engineer working under the direction of the Product Architect / Technical Lead.

Your responsibility is to implement the currently approved phase correctly.

You may:

* inspect the repository,
* propose implementation details,
* identify technical risks,
* suggest improvements,
* ask for an architectural decision when one is genuinely unresolved.

You may not independently redefine:

* product scope,
* architecture,
* domain boundaries,
* technology stack,
* accepted ADRs,
* phase boundaries.

Architectural authority remains with the Product Architect / Technical Lead.

---

# 2. Source of Truth

Before implementing a task, read the relevant project documentation.

The authority order is:

```text
PRD
 ↓
ARCHITECTURE
 ↓
Accepted ADRs
 ↓
Current Phase Specification
 ↓
AGENTS.md
 ↓
Implementation
```

Primary documents:

```text
docs/PRD.md
docs/ARCHITECTURE.md
docs/adr/
docs/phases/
```

The PRD defines product behavior and scope.

`ARCHITECTURE.md` defines system architecture.

Accepted ADRs define established architectural decisions.

The current phase specification defines exactly what should be implemented now.

---

# 3. Documentation Conflicts

If documents appear to conflict:

1. Do not silently choose an interpretation.
2. Identify the conflicting sections.
3. Explain the implementation impact.
4. Stop the conflicting portion of implementation.
5. Request an architectural/product decision.

Do not resolve significant contradictions by modifying architecture yourself.

---

# 4. Architecture Changes

Accepted architectural decisions must not be changed silently.

If implementation reveals that an accepted decision is problematic:

1. describe the problem,
2. explain why the current architecture causes it,
3. describe realistic alternatives,
4. explain tradeoffs,
5. recommend an option,
6. wait for an ADR update or explicit approval before changing architecture.

Do not implement the alternative first and document it afterward.

---

# 5. Phase Scope

Work strictly within the currently approved implementation phase.

Do not implement future phases early.

For example, if the current phase is Foundation, do not also implement:

* Content DNA,
* AI generation,
* ideas,
* content editor,
* social integrations,
* analytics,
* publishing,
* background jobs,

unless explicitly required by the current phase specification.

It is acceptable to note:

> This may be useful in Phase X.

It is not acceptable to implement it without approval.

---

# 6. Avoid Premature Infrastructure

Do not introduce technology because it may hypothetically be useful later.

In particular, do not add without an approved architectural reason:

* Redis
* Kafka
* Elasticsearch
* vector databases
* microservices
* separate backend services
* separate analytics services
* event-streaming infrastructure
* unnecessary queues
* premature caching layers

V1 intentionally favors a modular monolith.

---

# 7. Approved Core Stack

Current approved stack:

* Next.js
* TypeScript
* PostgreSQL
* Drizzle ORM
* shadcn/ui
* Better Auth

Supporting architecture currently includes:

* `next-intl`
* Zod
* Vitest
* Playwright

Do not replace core stack components without an approved ADR.

---

# 8. Dependency Policy

Do not add dependencies casually.

Before introducing a new runtime dependency, verify:

1. the existing stack cannot reasonably solve the requirement,
2. the dependency solves a concrete current-phase problem,
3. it is actively maintained,
4. it does not duplicate an existing dependency,
5. it does not introduce disproportionate complexity.

For a significant dependency, explain:

* why it is needed,
* what alternatives were considered,
* where it will be used.

Do not add dependencies for speculative future use.

---

# 9. Modular Monolith Boundaries

Better Content is a modular monolith.

Primary domain modules include:

```text
workspace
dna
ideas
content
publishing
integrations
analytics
ai
assets
jobs
```

Do not allow domain logic to become scattered across unrelated directories.

Feature-specific business behavior belongs in the relevant module.

Shared utilities belong in shared infrastructure only when they are genuinely cross-domain.

---

# 10. UI Is Not the Domain Layer

React components must not contain core business logic.

Avoid patterns such as:

```text
React Component
 ↓
Drizzle
 ↓
External Provider
```

Prefer:

```text
UI
 ↓
Application Service
 ↓
Domain / Repository / Provider Adapter
```

Components may handle presentation and local interaction state.

Authorization, workflow rules, persistence, and external-provider behavior belong on the server/application side.

---

# 11. Database Access

PostgreSQL is the system of record.

Use Drizzle for application database access.

Database access must not be scattered randomly throughout the codebase.

Prefer domain/application-level repository or query functions.

Important domain invariants should be reinforced with database constraints where practical.

---

# 12. Database Migrations

Production schema changes use reviewed Drizzle migrations.

Rules:

* commit schema changes,
* generate/commit migrations,
* review migrations,
* never manually modify production schema,
* do not use ad-hoc schema push as the production migration strategy,
* explicitly review destructive migrations.

Do not remove or rewrite historical migrations after they have become part of shared history unless explicitly instructed.

---

# 13. Workspace Ownership

Private product data belongs to a Better Content workspace.

Do not assume authentication alone proves access to an entity.

Every private operation must verify:

```text
Authenticated User
+
Workspace Membership
+
Resource Ownership
```

Never trust a client-provided resource ID as proof of authorization.

Cross-workspace access is a critical security defect.

---

# 14. Authentication vs Social Connections

Better Auth handles Better Content authentication.

Social-platform authorization is a separate domain.

Do not treat:

```text
Sign in with Google
```

as equivalent to:

```text
Permission to access YouTube Analytics
```

Social connections require explicit platform authorization and scopes.

---

# 15. Historical Traceability

Preserve the lineage:

```text
Content DNA Version
        ↓
Idea Generation Batch
        ↓
Idea
        ↓
Content
        ↓
Content Version
        ↓
Publication
        ↓
Analytics
```

Do not simplify the schema in ways that break this relationship.

Traceability is a core product requirement, not optional metadata.

---

# 16. Content DNA Versioning

Content DNA uses immutable historical versions.

Changing current DNA must never modify the context associated with historical generations.

Generation records should point to the exact DNA version used.

---

# 17. Idea Model

Ideas are first-class entities.

Do not treat AI-generated ideas as temporary text that disappears after content generation.

Rejected ideas normally remain stored because they have future learning value.

The conceptual `USED` label is derived from whether content exists from the idea.

Do not introduce a conflicting persistent `USED` state.

---

# 18. Content Versioning

Content has:

* mutable working state,
* immutable historical versions.

Publishing must always reference an immutable content version.

Never publish from a mutable working draft.

Editing the draft after publication must not alter previously published historical content.

---

# 19. Structured Content Model

Better Content content is not stored as one opaque text string.

The structured content model contains:

```text
Structured Content
├── Script
├── Performance Direction
└── Edit Direction
```

## Script

What the creator says or communicates.

## Performance Direction

How the creator should perform the relevant Script content while recording.

## Edit Direction

How the footage should be edited during post-production.

Performance Direction and Edit Direction are not separate content types.

The umbrella term is:

**Production Direction**

---

# 20. Structured Content Storage

Structured editor documents use schema-versioned JSONB.

Every document must have an explicit schema version.

Breaking document-schema changes require explicit migration/transformation logic.

Do not silently change the meaning of existing stored documents.

---

# 21. Direction Taxonomy Is Not Yet Open for Implementation

The distinction between:

* Performance Direction
* Edit Direction

is established.

The exact V1 direction types and parameters are not yet finalized.

Do not independently invent a large taxonomy.

The approved structured-editor phase specification will define:

* allowed Performance Directions,
* allowed Edit Directions,
* parameters,
* validation,
* anchoring behavior.

---

# 22. Direction Anchoring Is Deferred

Performance Directions and Edit Directions must eventually remain associated with relevant Script content.

However, the final anchor model is intentionally deferred until the editor phase.

Possible concepts include:

* Script block,
* text span,
* phrase,
* word cue,
* before/after location,
* relative timing.

Do not lock the final schema before the relevant phase specification.

---

# 23. Publication Model

Do not collapse publishing into:

```text
content.published = true
```

Publishing uses separate domain concepts:

```text
Accepted Content Version
        ↓
Publication Plan
        ↓
External Publication
        ↓
Analytics
```

One content version may have multiple platform publications.

The conceptual content-level `PUBLISHED` label is derived.

---

# 24. Manual Publishing in V1

V1 does not automatically publish content to social networks.

Creators publish externally.

Better Content then registers the external publication and retrieves analytics where supported.

Do not implement automatic publishing unless a future approved phase explicitly adds it.

---

# 25. Social Provider Architecture

Social integrations must use provider adapters.

Platform-specific API behavior must not leak throughout the application.

Provider differences include:

* OAuth,
* permissions,
* publication identifiers,
* metrics,
* account eligibility,
* rate limits,
* failure behavior.

The application should use capability-aware provider abstractions.

---

# 26. Social Provider Order Is Deferred

The first social provider has intentionally not been chosen.

Do not assume:

```text
Instagram
↓
TikTok
↓
YouTube
```

or another fixed order.

At the beginning of the Social Connections phase, the Product Architect / Technical Lead will evaluate current official APIs and approve provider order.

Codex must not make this product/architecture decision independently.

---

# 27. Social Credential Security

Social OAuth tokens are sensitive credentials.

Rules:

* never store tokens as plaintext,
* never send refresh tokens to the browser,
* never log tokens,
* use approved authenticated encryption,
* support token expiry/revocation,
* request minimum required scopes.

Current architecture specifies application-level encrypted credential storage with key versioning.

---

# 28. User-Provided URLs

Do not fetch arbitrary user-provided publication URLs.

Publication registration should:

1. parse the URL,
2. validate the hostname against supported providers,
3. identify the provider,
4. extract provider identifiers where possible,
5. use official provider APIs.

This protects against SSRF and unsupported arbitrary network access.

---

# 29. Analytics

Analytics belong to publications.

Do not attach generic analytics directly to content.

Correct:

```text
Content Version
 ↓
Publication
 ↓
Analytics Snapshot
 ↓
Metric Values
```

Different platform publications of the same content maintain separate analytics.

---

# 30. Provider Metrics

Preserve provider-specific metric semantics.

Do not silently assume:

```text
Instagram Reach
```

is equivalent to:

```text
YouTube Views
```

Raw provider metrics must remain recoverable.

Do not invent a universal engagement score without an approved future design.

---

# 31. Analytics History

Do not overwrite analytics history.

Analytics are stored as time-based snapshots/observations.

Historical performance is required for future analysis and AI learning.

---

# 32. Background Jobs

V1 architecture uses PostgreSQL-backed jobs.

Do not introduce Redis or another job system without an approved architectural change.

Jobs must:

* be retry-safe,
* be idempotent,
* avoid storing secrets in payloads,
* use bounded retries,
* classify failure types.

---

# 33. AI Boundary

All AI access goes through the AI module.

Feature modules should not directly depend on provider SDKs.

The initial AI provider/model is deliberately undecided until the AI phase.

Do not choose multiple providers or build a routing engine without approval.

---

# 34. AI Output Validation

AI output is untrusted input.

Structured AI output must pass runtime validation before persistence.

Do not persist malformed provider responses because they happen to be valid JSON.

AI-generated content must never automatically trigger privileged side effects.

---

# 35. AI Traceability

AI runs should preserve operational metadata required for:

* debugging,
* evaluation,
* cost analysis,
* historical traceability.

Do not store hidden model chain-of-thought or private reasoning traces.

---

# 36. Internationalization

English and Persian support begins in Phase 1.

Application locales:

```text
en
fa
```

English is LTR.

Persian is RTL.

Do not build English-only UI with the intention of adding RTL later.

---

# 37. UI Language vs Content Language

Application interface language and creator content language are separate concepts.

A creator may use:

```text
English UI
+
Persian content
```

Changing UI locale must not translate or mutate creator content.

---

# 38. RTL Rules

Use correct `lang` and `dir` attributes.

Prefer logical layout concepts such as:

* start,
* end,
* inline-start,
* inline-end.

Avoid unnecessary left/right assumptions.

Every UI phase must be checked in both English/LTR and Persian/RTL.

---

# 39. Validation

Server-side validation is authoritative.

Use runtime schemas at application boundaries.

Important validation areas include:

* authentication/authorization,
* IDs,
* workspace ownership,
* workflow transitions,
* AI responses,
* publication URLs,
* structured documents,
* Production Directions,
* provider responses.

Client validation improves UX but does not replace server validation.

---

# 40. Transactions

Use database transactions for operations that must remain consistent.

Examples include:

* accepting content,
* creating immutable versions,
* registering publications,
* updating related workflow state.

Do not keep a database transaction open while waiting on a slow external API.

---

# 41. External API Pattern

Prefer:

```text
Create operation record
 ↓
Commit
 ↓
Call external provider
 ↓
Validate response
 ↓
Short persistence transaction
```

over holding a transaction across network calls.

---

# 42. Error Handling

Use stable application error categories rather than arbitrary strings throughout the codebase.

Examples include:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
CONFLICT
PROVIDER_ERROR
RATE_LIMITED
CONNECTION_REQUIRED
AI_OUTPUT_INVALID
INTERNAL_ERROR
```

User-facing messages should be localizable.

---

# 43. Logging

Use structured server-side logging.

Useful correlation fields may include:

* request ID,
* workspace ID,
* user ID,
* module,
* operation,
* entity ID,
* AI run ID,
* publication ID,
* job ID,
* error code.

Do not log:

* passwords,
* secrets,
* OAuth tokens,
* refresh tokens,
* full authorization headers.

---

# 44. Testing Expectations

Each phase specification defines required tests.

In general, prioritize:

### Unit tests

For pure domain logic.

### Integration tests

For:

* database behavior,
* authorization,
* transactions,
* versioning,
* jobs,
* analytics persistence.

### End-to-end tests

For critical user workflows.

Do not optimize for arbitrary test-count targets.

Optimize for confidence in important behavior.

---

# 45. External Provider Testing

Automated tests must not depend on real production social accounts.

Provider integrations should be testable through:

* mocks,
* sanitized fixtures,
* contract tests.

Test provider failure states as well as success paths.

---

# 46. AI Testing

Normal CI must not depend on nondeterministic live AI output.

Mock provider responses for deterministic application tests.

AI quality evaluation should be treated separately from normal functional CI tests.

---

# 47. CI

A phase should not be considered complete while required checks fail.

Expected checks eventually include:

```text
lint
typecheck
unit tests
integration tests
build
```

Phase specifications may add additional checks.

---

# 48. Security

Security requirements are part of implementation, not optional hardening.

Always consider:

* authorization,
* data isolation,
* secret exposure,
* SSRF,
* XSS,
* unsafe redirects,
* token handling,
* input validation,
* upload validation,
* sensitive logging,
* provider permissions.

If a requested implementation creates a meaningful security concern, flag it immediately.

---

# 49. Performance

Do not prematurely optimize speculative bottlenecks.

Prioritize:

1. correctness,
2. security,
3. maintainability,
4. data integrity,
5. reasonable performance.

Use measurements before introducing complex optimization infrastructure.

---

# 50. Accessibility

UI work must consider:

* keyboard navigation,
* focus behavior,
* semantic HTML,
* accessible labels,
* contrast,
* screen-reader compatibility,
* RTL interaction behavior.

Accessibility is part of the definition of production-quality UI.

---

# 51. Code Quality

Prefer:

* clear names,
* small cohesive modules,
* explicit behavior,
* simple control flow,
* typed boundaries,
* maintainable abstractions.

Avoid:

* clever unnecessary abstractions,
* speculative frameworks,
* giant components,
* giant service files,
* duplicated domain rules,
* hidden side effects.

---

# 52. Comments

Comments should explain:

* why,
* invariants,
* unusual external constraints.

Do not write comments that merely restate obvious code.

---

# 53. No Silent Cleanup

When implementing a phase, do not casually refactor unrelated parts of the repository.

If unrelated technical debt is discovered:

1. mention it,
2. explain whether it blocks the phase,
3. leave it unchanged unless explicitly approved.

This keeps reviews focused and prevents hidden scope expansion.

---

# 54. Existing User Changes

Never overwrite or revert unrelated existing working-tree changes.

Before making broad edits, inspect repository status.

If unrelated modifications already exist, preserve them.

Do not use destructive Git commands to make the working tree clean.

---

# 55. Git Safety

Do not:

* force push,
* reset user work,
* discard unrelated changes,
* rewrite shared history,
* commit secrets.

Do not create commits unless the task explicitly asks for a commit.

---

# 56. Documentation Updates

Documentation is part of the implementation.

If a phase introduces an approved change that affects:

* behavior,
* architecture,
* database structure,
* operational requirements,

update the relevant documentation when the phase specification asks for it.

Do not silently edit accepted architecture to match code that diverged from it.

The architecture decision comes first.

---

# 57. Phase Completion Report

At the end of an implementation task, report:

## Implemented

What was actually changed.

## Files Changed

Important files/directories touched.

## Database Changes

Schemas/migrations created or modified.

## Tests

What was added/run and results.

## Validation

Lint/typecheck/build/test results.

## Deviations

Any approved phase requirement that could not be implemented exactly.

## Risks / Follow-ups

Issues that should be considered later but were intentionally kept outside current scope.

Do not claim completion if required acceptance criteria are not satisfied.

---

# 58. Implementation Skills and External Agent Instructions

Phase specifications may instruct the implementation agent to use specific installed skills, review modes, or engineering guidance.

Those instructions apply only when explicitly referenced by the current phase.

Do not assume globally installed skills change the permanent architecture or product requirements.

Repository source-of-truth documents remain authoritative.

---

# 59. Final Rule

When uncertain whether something belongs in the current phase:

> **Do less, preserve the architecture, and raise the question.**

Do not expand scope merely because an additional feature appears easy to implement.

---

## Agent skills

### Issue tracker

Issues are tracked as local Markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The default five-role triage label vocabulary is used. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

## Phase Implementation Workflow

Multi-session implementation phases should be decomposed into implementation tickets before coding begins.

For local development, implementation tickets may be stored using the configured local ticket tracker under `.scratch/<phase>/issues/`.

The approved phase specification remains the source of truth. Tickets are execution artifacts and may not redefine product requirements, architecture, Accepted ADRs, or phase scope.

Ticket decomposition must be reviewed before implementation begins.

After approval:

- implement one ticket at a time,
- respect declared blocking relationships,
- verify each ticket against its acceptance criteria,
- run the required tests,
- perform code review,
- commit completed ticket work when explicitly authorized,
- avoid implementing later tickets opportunistically.

After all tickets are complete, perform a phase-wide verification against the original phase specification before the phase is considered complete.
