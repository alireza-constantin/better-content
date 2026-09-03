# Better Content

## Technical Architecture

**Version:** 0.2
**Status:** Accepted architecture
**Based on:** PRD v0.2
**Architecture style:** Modular monolith
**Primary application:** Web
**V1 languages:** English (`en`) and Persian (`fa`)

---

# 1. Purpose

This document defines the technical architecture for Better Content V1.

It translates the product requirements into decisions about:

* application structure,
* domain boundaries,
* database design,
* authentication,
* workspace ownership,
* content versioning,
* AI generation,
* structured content,
* publication tracking,
* social platform connections,
* analytics ingestion,
* background jobs,
* internationalization,
* security,
* validation,
* testing,
* observability,
* deployment assumptions,
* and implementation boundaries for Codex.

This document defines **how the system should be built**.

The PRD remains responsible for **what the product should do and why**.

---

# 2. Architecture Goals

The architecture should optimize for:

1. correctness,
2. traceability,
3. maintainability,
4. security,
5. development speed,
6. future extensibility without premature infrastructure.

The system must preserve the product lineage:

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

That relationship is a fundamental architectural invariant.

---

# 3. Architecture Philosophy

Better Content V1 will be a:

> **modular monolith**

We will build one deployable Next.js application with strongly separated application modules.

We will **not** begin with:

* microservices,
* separate AI services,
* separate analytics services,
* Kafka,
* Redis,
* Elasticsearch,
* independent API servers,
* distributed event infrastructure.

Those technologies may become appropriate later, but V1 does not currently justify their operational complexity.

---

# 4. Approved Core Stack

V1 uses:

* Next.js
* TypeScript
* PostgreSQL
* Drizzle ORM
* shadcn/ui
* Better Auth

Additional supporting libraries may be introduced where they solve a defined problem.

Initial supporting choices:

* `next-intl` for application internationalization
* Zod for runtime input/schema validation
* Vitest for unit/integration-oriented TypeScript tests
* Playwright for critical end-to-end tests

`next-intl` currently supports modern Next.js App Router patterns and localized routing, making it appropriate for our English/Persian requirement.

Significant stack changes require an ADR.

---

# 5. Repository Strategy

V1 should use **one repository and one Next.js application**.

Do not create a monorepo unless another separately deployable application actually becomes necessary.

Proposed structure:

```text
/
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── adr/
│   └── phases/
│
├── src/
│   ├── app/
│   │   └── [locale]/
│   │
│   ├── modules/
│   │   ├── workspace/
│   │   ├── dna/
│   │   ├── ideas/
│   │   ├── content/
│   │   ├── publishing/
│   │   ├── integrations/
│   │   ├── analytics/
│   │   ├── ai/
│   │   ├── assets/
│   │   └── jobs/
│   │
│   ├── db/
│   │   ├── schema/
│   │   ├── migrations/
│   │   └── index.ts
│   │
│   ├── lib/
│   │   ├── auth/
│   │   ├── i18n/
│   │   ├── logging/
│   │   ├── crypto/
│   │   └── validation/
│   │
│   └── components/
│
├── AGENTS.md
├── package.json
└── ...
```

The exact directory names may evolve slightly during bootstrap, but the domain separation must remain.

---

# 6. Module Boundaries

The application is divided into these primary modules.

## Workspace

Owns:

* workspaces,
* workspace membership,
* workspace authorization.

## DNA

Owns:

* Content DNA profiles,
* DNA versions.

## Ideas

Owns:

* idea generation batches,
* ideas,
* idea acceptance/rejection.

## Content

Owns:

* content aggregates,
* editable drafts,
* immutable content versions,
* accepted versions,
* structured content documents,
* production signals.

## Publishing

Owns:

* publishing plans,
* external publications,
* publication registration.

## Integrations

Owns:

* connected social accounts,
* provider OAuth,
* provider adapters,
* external publication identification.

## Analytics

Owns:

* analytics synchronization,
* snapshots,
* metric observations,
* analytics queries.

## AI

Owns:

* AI provider boundary,
* generation runs,
* model configuration,
* structured-output validation,
* usage tracking.

## Jobs

Owns:

* delayed work,
* retries,
* periodic analytics synchronization,
* background execution.

## Assets

Owns:

* uploaded asset metadata,
* storage references,
* access policy.

---

# 7. Dependency Rule

UI components must not directly contain business logic.

Pages/components should call application services.

Application services may use:

* domain rules,
* repositories/query functions,
* provider adapters.

For example:

```text
UI
 ↓
Idea Application Service
 ↓
AI Service + Database
```

Not:

```text
React Component
 ↓
Drizzle query
 ↓
OpenAI/TikTok/etc.
```

Drizzle must not be scattered throughout arbitrary React components.

External provider SDK/API code must remain behind provider-specific adapters.

---

# 8. Next.js Application Pattern

Use the App Router.

Prefer:

### React Server Components

For authenticated reads and page rendering.

### Server Actions

For normal application mutations originating from our UI.

Examples:

* save DNA,
* accept idea,
* reject idea,
* update draft,
* accept content.

### Route Handlers

For protocol-oriented endpoints such as:

* Better Auth,
* social OAuth callbacks,
* scheduled/background job execution,
* external webhooks,
* provider callbacks,
* future public API endpoints.

Business logic must still live outside the route handler itself.

A route handler should normally:

```text
Authenticate / Validate
        ↓
Call Application Service
        ↓
Return Result
```

---

# 9. Authentication Architecture

Better Auth is the application authentication system.

Better Auth provides official Next.js integration and supports PostgreSQL through its Drizzle adapter.

Authentication data and Better Content domain data must remain conceptually separate.

Better Auth owns entities such as:

* user,
* session,
* authentication account,
* verification.

Better Content owns:

* workspaces,
* content,
* ideas,
* publications,
* analytics,
* social connections.

---

# 10. Better Auth Database Management

Better Auth's schema should be represented through Drizzle.

Database migrations remain under our normal Drizzle migration workflow rather than allowing production schema modifications outside our migration history.

Better Auth documents schema generation for Drizzle and expects migration application to happen through the ORM migration tooling.

Rules:

* generated auth schema is committed,
* migrations are reviewed,
* migrations are committed,
* production schema changes happen through migrations,
* no ad-hoc database changes.

---

# 11. Workspace Architecture

Even though V1 presents primarily as a single-user product, all product data belongs to a workspace.

Initial model:

```text
User
 ↓
Workspace Membership
 ↓
Workspace
```

On initial account setup:

1. user account is created,
2. default workspace is created,
3. user receives owner membership,
4. all product data is created inside that workspace.

---

# 12. Why We Are Not Using Better Auth Organizations Yet

Better Auth provides organization/team capabilities, but V1 does not require team administration.

We should therefore avoid coupling our core product ownership model to Better Auth's organization plugin before collaboration is required.

We will maintain our own lightweight:

```text
workspaces
workspace_members
```

tables.

This gives us:

* explicit domain ownership,
* straightforward authorization,
* future collaboration capability,
* independence between authentication and product tenancy.

If we later adopt Better Auth organization functionality, that will require an ADR.

---

# 13. Workspace Authorization Rule

Every private application operation must resolve:

```text
Authenticated User
       +
Requested Workspace
       ↓
Valid Workspace Membership
```

before accessing workspace-owned data.

Client-provided IDs can never be considered proof of ownership.

For example:

```text
POST update-content(contentId)
```

must not simply run:

```text
UPDATE contents
WHERE id = contentId
```

The application must verify workspace ownership.

For idea authorization and ownership resolution, the relationship is:

```text
Idea
  ↓
Idea Generation Batch
  ↓
Workspace
```

An Idea retains no direct `workspace_id`. The batch is the workspace-owned
aggregate that supplies that ownership boundary.

---

# 14. Database Conventions

PostgreSQL is the source of truth.

General conventions:

* UUID primary keys
* `snake_case` database identifiers
* `camelCase` TypeScript identifiers
* timestamps stored using timezone-aware PostgreSQL timestamps
* application treats timestamps as UTC internally
* explicit `created_at`
* explicit `updated_at` where records are mutable
* database foreign keys for important relationships
* indexes added for actual query patterns
* JSONB only where flexibility provides clear value

Do not use JSONB as an excuse to avoid relational modeling.

---

# 15. ID Strategy

Primary entity identifiers should use UUIDs.

We do not need sequential public integer IDs.

Examples:

```text
workspace_id
idea_id
content_id
publication_id
```

Public URLs should not expose predictable numeric sequences.

---

# 16. Status Storage

For application workflow states, use validated string values with database constraints where practical.

Avoid unnecessary PostgreSQL enums for states that may reasonably evolve during early product development.

Example:

```text
idea.status
```

can contain allowed application values such as:

```text
new
accepted
saved
rejected
```

with:

* application validation,
* database check constraint.

This gives us both data integrity and easier future state evolution.

---

# 17. Content DNA Domain Model

Core tables:

```text
content_dna
content_dna_versions
```

Relationship:

```text
Workspace
   ↓
 Content DNA
   ↓
 immutable Content DNA Versions
    ↓
 one current version
```

`content_dna` represents the stable, workspace-owned container for the creator's DNA.

`content_dna_versions` represents immutable historical versions.

---

# 18. DNA Version Behavior

Saving a meaningful DNA change creates a new immutable version.

Example:

```text
Content DNA
├── Version 1
├── Version 2
└── Version 3 ← current
```

Content DNA stores or resolves its active/current version.

Old versions remain immutable.

An idea generation batch references a specific DNA version.

Therefore:

```text
Changing DNA today
```

does not alter:

```text
Ideas generated last month
```

---

# 19. DNA Storage

Content DNA version bodies are schema-versioned, application-validated JSONB snapshots, as defined by ADR-013.

Stable relational identity, workspace ownership, lineage, sequential versioning, current-version reference, author, and timestamp concerns remain relational columns.

---

# 20. AI Generation Architecture

All AI usage passes through the AI module.

External provider calls must never occur directly inside feature UI code.

Conceptually:

```text
Ideas Module
     ↓
AI Generation Service
     ↓
AI Provider Adapter
     ↓
External AI Provider
```

---

# 21. AI Provider Abstraction

Define an internal provider contract.

Conceptually:

```text
AIProvider
├── generateStructured(...)
├── providerName
└── modelMetadata
```

Feature modules should request a generation task such as:

```text
generateIdeas(...)
```

rather than knowing provider-specific API behavior.

This gives us freedom to:

* change models,
* test models,
* use different models for different tasks,
* introduce fallback providers later.

We will **not** build a complicated multi-provider routing engine in V1.

---

# 22. AI Provider Decision

The architecture is provider-neutral.

ADR-015 records the current Phase 3 production choice as AvalAI at the fixed
`https://api.avalai.ir/v1` endpoint, using the OpenAI SDK's Responses API with
`gpt-5.6-luna`. This decision does not add a provider registry, routing layer,
fallback, or provider/model selector. ADR-014 remains authoritative for the
provider-neutral contract and all generation behavior not superseded by
ADR-015.

The initial provider/model is not a permanent architecture-wide choice for
future workflows. Any future provider or model requires a deliberate ADR and
must preserve the provider-neutral boundary.

Codex must not independently choose or add multiple AI providers.

---

# 23. AI Structured Output

Idea and content generation should use structured responses.

The process should be:

```text
Prompt/Input
     ↓
Provider response
     ↓
Schema validation
     ↓
Domain object
```

AI output must never be trusted simply because the provider returned valid JSON syntax.

It must pass runtime schema validation.

Zod should validate provider output before persistence.

---

# 24. AI Generation Runs

Create an `ai_runs` table for generation traceability.

Conceptual fields:

```text
id
workspace_id
kind
provider
model
prompt_template_version
status
started_at
completed_at
input_snapshot
output_snapshot
input_tokens
output_tokens
estimated_cost
error_code
```

Possible `kind` examples:

```text
idea_generation
content_generation
content_regeneration
```

Do not store hidden provider reasoning or chain-of-thought.

We need final outputs and operational metadata, not private reasoning traces.

---

# 25. AI Input Snapshots

An AI run must preserve enough input context for debugging.

For example an idea-generation run should preserve:

* DNA version ID,
* requested count,
* requested language,
* generation settings,
* prompt template version.

We should not rely exclusively on reconstructing historical prompts from current application code.

---

# 26. Idea Generation Architecture

Tables:

```text
idea_batches
ideas
```

Flow:

```text
DNA Version
     ↓
AI Run
     ↓
Idea Batch
     ↓
20 Ideas
```

Each generation request produces one batch.

The batch references:

* workspace,
* DNA version,
* AI run,
* requested language,
* requested count,
* creation timestamp.

---

# 27. Idea Model

Each idea contains at minimum:

```text
id
batch_id
position
title
description
language
category
status
rejection_reason
created_at
updated_at
```

---

# 28. Important State Decision: USED Is Derived

The PRD describes `USED` as a conceptual idea state.

At the database level, we should **not** store `USED` as mutually exclusive with `ACCEPTED`.

Why?

An idea can simultaneously be:

> accepted

and

> already used to generate content.

These represent different facts.

Therefore persistent idea state should remain:

```text
new
accepted
saved
rejected
```

And:

```text
used = EXISTS(content where source_idea_id = idea.id)
```

is derived.

The UI can still display:

**Used**

This avoids inconsistent state transitions.

This decision should become an ADR.

---

# 29. Rejected Ideas

Rejecting an idea changes its status.

It does not destroy the record.

Example:

```text
status = rejected
rejection_reason = too_generic
```

A separate permanent-delete mechanism may exist for privacy/account deletion requirements.

"Reject" and "destroy database history" are not the same operation.

---

# 30. Content Aggregate

Content is a stable aggregate representing a piece of creator work.

Conceptual tables:

```text
contents
content_drafts
content_versions
```

Relationship:

```text
Idea
 ↓
Content
 ├── Mutable Draft
 └── Immutable Versions
```

---

# 31. Why Draft and Version Are Separate

A creator may edit text many times.

Creating a full immutable database version on every keystroke would create unnecessary complexity.

Instead:

### `content_drafts`

Contains the current editable document.

Mutable.

### `content_versions`

Contains meaningful immutable snapshots.

Examples:

* initial AI generation,
* AI regeneration,
* accepted version,
* published version source.

---

# 32. Content Draft Model

Conceptual fields:

```text
content_id
document
document_schema_version
revision
updated_at
```

`document` is structured JSONB.

`revision` provides optimistic concurrency protection.

If two browser tabs attempt to save conflicting revisions, the application should detect the stale revision instead of silently overwriting newer work.

---

# 33. Content Version Model

Conceptual fields:

```text
id
content_id
version_number
document
document_schema_version
source
ai_run_id
created_by_user_id
created_at
```

Potential `source` values:

```text
ai_generated
ai_regenerated
accepted_snapshot
manual_checkpoint
```

Published records always reference an immutable content version.

Never publish directly from the mutable draft.

---

# 34. Content Acceptance

Accepting content performs a transaction:

```text
Current Draft
      ↓
Create immutable Content Version
      ↓
Set content.accepted_version_id
```

The version becomes the approved publishing source.

Further editing may continue in the draft without changing the accepted version.

If the creator wants those edits published, the content must be accepted again.

---

# 35. Structured Content Representation

Structured content will be stored as versioned JSONB.

Example conceptually:

```json
{
  "schemaVersion": 1,
  "blocks": [...]
}
```

The canonical content document has three semantic layers:

```text
Structured Content
├── Script
├── Performance Direction
└── Edit Direction
```

These are not three independent documents.

The Script contains what the creator says or communicates.

Performance Direction describes how the creator should perform the relevant part of the Script while recording.

Edit Direction describes how the resulting footage should be edited during post-production.

Performance Direction and Edit Direction must remain associated with the relevant Script content.

The exact internal block/direction schema is intentionally deferred until the structured-editor phase.

---

# 36. Document Schema Versioning

Every structured document must contain a schema version.

Example:

```text
schemaVersion: 1
```

Future editor schema changes must have explicit migrations/transforms such as:

```text
Document V1
   ↓ migrate
Document V2
```

Do not silently change the interpretation of old content documents.

---

# 37. Production Direction Model

**Production Direction** is the umbrella term for two distinct categories:

```text
Production Direction
├── Performance Direction
└── Edit Direction
```

## Performance Direction

Performance Direction describes how the creator should physically or vocally perform a part of the Script.

Examples may include:

* pause
* long pause
* walk
* step toward camera
* sit
* stand
* gesture
* point
* direct eye contact
* look away
* facial expression
* voice emphasis
* whisper
* energy change
* object interaction
* position change

Example:

```text
SCRIPT
"Most people are wearing their blazer wrong."

PERFORMANCE DIRECTION
- look directly at camera
- step toward camera
- pause after "wrong"
```

## Edit Direction

Edit Direction describes what should happen during post-production.

Examples may include:

* zoom in
* zoom out
* cut
* image overlay
* video overlay
* B-roll
* screenshot
* text overlay
* sound effect
* music cue
* transition
* picture-in-picture
* speed change
* frame hold
* emphasis treatment

Example:

```text
SCRIPT
"Most people are wearing their blazer wrong."

EDIT DIRECTION
- quick zoom on "wrong"
- impact sound
- show reference image after sentence
```

Both categories are structured data.

They must not exist only as markers embedded inside Script text.

---

# 38. Production Direction Taxonomy

The distinction between Performance Direction and Edit Direction is accepted.

However, the exact V1 direction taxonomy is intentionally deferred until the structured-editor phase.

Before Phase 5, we will define a deliberately small canonical set of:

### Performance Direction types

Potential categories include:

- timing / pause
- movement
- position
- gaze
- gesture
- expression
- voice
- object interaction

### Edit Direction types

Potential categories include:

- zoom
- cut
- image overlay
- video overlay
- B-roll
- text
- sound effect
- transition
- emphasis

The exact allowed values, parameters, and constraints must be defined in the Phase 5 specification.

Codex must not independently invent dozens of production-direction types.

---

# 39. Direction Anchoring

Performance Directions and Edit Directions must remain connected to the Script segment they describe.

Conceptually:

```text
Block #1

Script
└── "Most people are wearing their blazer wrong."

Performance Directions
├── direct eye contact
├── step forward
└── pause after "wrong"

Edit Directions
├── zoom on "wrong"
├── impact sound
└── image overlay after sentence
```

The exact anchoring representation is intentionally deferred until Phase 5.

Potential anchor concepts may include:

* entire Script block
* text span
* word or phrase cue
* before/after block
* relative timing

Codex must not invent the final anchoring schema before the relevant phase specification.

---

# 40. Asset Architecture

Assets may support:

* image overlays,
* screenshots,
* B-roll references,
* visual references.

PostgreSQL stores asset metadata.

Actual binary files should **not** be stored inside PostgreSQL.

Conceptually:

```text
assets
├── id
├── workspace_id
├── storage_key
├── mime_type
├── size_bytes
├── original_filename
├── status
└── created_at
```

Binary storage will use an object-storage provider.

The exact provider is deferred until the asset phase.

A provider abstraction should prevent application logic from being tied directly to one vendor.

---

# 41. Publication Workflow Architecture

The PRD presents:

```text
Draft
 ↓
Accepted
 ↓
Publishing Queue
 ↓
Published
```

Internally, we should **not implement all four stages as a single content enum.**

Publication is a separate domain object.

---

# 42. Content Workflow State

Content itself primarily owns:

```text
draft
accepted
```

A content aggregate may have an accepted version.

Publishing is modeled separately.

---

# 43. Publishing Queue Model

The publishing queue should be represented through:

```text
publication_plans
```

A publication plan means:

> This accepted content version is intended to be published on this platform.

Conceptual fields:

```text
id
workspace_id
content_id
content_version_id
target_platform
status
created_at
updated_at
```

Possible states:

```text
pending
published
cancelled
```

---

# 44. Why Publication Plans Are Needed

Suppose one accepted Reel should be posted to:

* Instagram,
* TikTok,
* YouTube Shorts.

A single `content.status = queue` cannot represent those independently.

Instead:

```text
Accepted Content Version
├── Instagram Plan → Published
├── TikTok Plan → Pending
└── YouTube Plan → Pending
```

This is much more accurate.

---

# 45. Publication Domain

Actual external publications live in:

```text
publications
```

Conceptual fields:

```text
id
workspace_id
publication_plan_id
content_id
content_version_id
platform
external_url
external_content_id
social_connection_id
published_at
registered_at
last_synced_at
next_sync_at
created_at
```

The publication references the exact content version used.

---

# 46. Important State Decision: PUBLISHED Is Derived

The PRD describes Published as a user-facing content stage.

At the database level, we should not simply store:

```text
content.status = published
```

because one content item may have:

* one published Instagram post,
* one pending TikTok publication,
* no YouTube publication.

Therefore:

> **Published is fundamentally a property of a Publication, not the Content aggregate.**

The UI may derive a content-level badge:

```text
Published
```

when one or more publication records exist.

This should become an ADR.

---

# 47. External Publication Registration

V1 publishing remains external/manual.

Flow:

```text
Publication Plan
      ↓
Creator publishes on social platform
      ↓
Creator pastes URL
      ↓
Platform identified
      ↓
Ownership/publication resolved
      ↓
Publication created
```

Better Content does not publish the post itself in V1.

---

# 48. URL Security

User-pasted social URLs create a potential SSRF risk.

Better Content must **not fetch arbitrary URLs provided by the user**.

Instead:

1. parse the URL,
2. compare host against an allowlist,
3. determine provider,
4. extract a candidate post identifier where possible,
5. use the official provider API.

For example:

```text
instagram.com/...
tiktok.com/...
youtube.com/...
youtu.be/...
```

Unknown hosts should be rejected or treated as unsupported.

---

# 49. Social Connections Are Separate From Login

This is an important security/domain rule.

A user may:

> Sign in to Better Content with Google.

That does **not** automatically mean Better Content has permission to access YouTube Analytics.

Authentication identity and analytics authorization are separate.

Therefore:

```text
Better Auth account
```

and:

```text
social_connections
```

must remain separate.

Never reuse normal login permissions as analytics permissions unless the authorization flow explicitly granted those scopes.

---

# 50. Social Connection Model

Conceptual table:

```text
social_connections
```

Fields may include:

```text
id
workspace_id
platform
external_account_id
display_name
status
scopes
access_token_encrypted
refresh_token_encrypted
token_expires_at
encryption_key_version
connected_at
last_refreshed_at
created_at
updated_at
```

Possible statuses:

```text
active
expired
revoked
needs_reauthorization
error
```

---

# 51. Credential Encryption

Social access and refresh tokens must not be stored as plaintext.

V1 should use application-level authenticated encryption.

Recommended primitive:

**AES-256-GCM**

A server-only encryption key is provided through the deployment secret manager/environment.

Stored encrypted values should include enough metadata for:

* nonce/IV,
* authentication tag where required,
* encryption key version.

The key itself must never be stored in the database.

Key versioning allows future rotation.

This security decision should receive its own ADR.

---

# 52. OAuth Security

Social account integrations should use server-side authorization-code flows.

Where the provider supports or requires PKCE, use it.

Required protections include:

* OAuth `state`,
* callback validation,
* redirect URI allowlisting,
* minimal required scopes,
* token encryption,
* no provider tokens in browser storage,
* no token values in application logs.

---

# 53. Social Provider Adapter

All platform-specific behavior must sit behind a provider interface.

Conceptually:

```text
SocialProvider
├── getAuthorizationUrl()
├── exchangeAuthorizationCode()
├── refreshCredentials()
├── parsePublicationUrl()
├── resolvePublication()
├── fetchAnalytics()
└── capabilities()
```

The exact interface can be split if implementation reveals cleaner boundaries.

The important rule is:

> Instagram/TikTok/YouTube API behavior must not leak throughout the application.

---

# 54. Provider Capabilities

Providers expose different functionality.

We need a capability model.

Example conceptually:

```text
{
  canResolvePublication: true,
  supportsPrivateInsights: true,
  metrics: [...]
}
```

The UI should derive available functionality from capabilities rather than assuming every network supports identical metrics.

---

# 55. Social Provider Implementation Order Is Deferred

Better Content V1 requires real social analytics synchronization.

However, the architecture does not permanently define which social provider must be implemented first.

We intentionally do not lock:

```text
Instagram → TikTok → YouTube
```

or any other fixed provider order.

At the beginning of the Social Connections phase, the Product Architect / Technical Lead must research the current official provider APIs and compare:

* API availability
* required permissions/scopes
* application-review requirements
* development/test access
* supported account types
* available analytics
* rate limits
* implementation complexity
* reliability
* strategic relevance to Better Content users

Only after that review will the first provider and implementation order be approved.

Codex must not choose the first social platform independently.

V1 must support at least one real social platform end-to-end for automatic analytics synchronization.

Additional providers depend on current feasibility and approved phase scope.

---

# 56. TikTok Current Capability Evidence

TikTok's current Display API requires authorization and its video query supports fields including:

* `view_count`
* `like_count`
* `comment_count`
* `share_count`

for videos belonging to the authorized user.

This confirms that useful creator-publication analytics can fit our provider model.

It does **not** mean TikTok exposes every metric described conceptually in the PRD.

---

# 57. YouTube Current Capability Evidence

YouTube Analytics uses OAuth for private channel analytics.

Its current analytics metrics include concepts such as:

* views,
* comments,
* likes,
* shares,
* estimated watch time,
* average view duration,
* average view percentage.

This demonstrates why our platform must preserve provider-specific capabilities rather than forcing all networks into one fixed metric list.

---

# 58. Analytics Architecture

Analytics belongs to:

```text
Publication
```

not:

```text
Content
```

Correct:

```text
Content Version
     ↓
TikTok Publication
     ↓
TikTok Analytics
```

and independently:

```text
Same Content Version
     ↓
Instagram Publication
     ↓
Instagram Analytics
```

---

# 59. Analytics Storage Model

Use two core concepts:

```text
analytics_snapshots
analytics_metric_values
```

A snapshot represents one synchronization operation.

Metrics represent values obtained during that synchronization.

---

# 60. Analytics Snapshot

Conceptual fields:

```text
id
publication_id
provider
fetched_at
provider_data_timestamp
sync_status
created_at
```

Do not retain giant provider API responses unless there is a concrete reason.

Persist the metrics and minimal debugging metadata we actually need.

This reduces:

* privacy exposure,
* database growth,
* dependency on undocumented provider payloads.

---

# 61. Metric Values

Conceptual table:

```text
analytics_metric_values
```

Fields:

```text
id
snapshot_id
metric_key
value
unit
period_start
period_end
created_at
```

Provider-specific metric keys should remain explicit.

Examples:

```text
tiktok.view_count
tiktok.like_count

youtube.views
youtube.average_view_duration

instagram.reach
```

Do not silently claim these have identical semantics.

---

# 62. Metric Value Type

Most metrics should use a PostgreSQL numeric-compatible representation.

We should not force all metrics into integer values because some analytics may be:

* percentages,
* averages,
* monetary values,
* durations.

`unit` may contain concepts such as:

```text
count
seconds
minutes
percent
currency
```

---

# 63. Cross-Platform Normalization

V1 should preserve raw/provider semantics.

It should **not yet create a sophisticated cross-platform scoring formula**.

For example, we should not invent:

```text
Universal Engagement Score = ...
```

without evidence.

Later we may map provider metrics into normalized concepts.

The raw provider-specific metric must always remain recoverable.

---

# 64. Analytics Synchronization Strategy

Every publication has a:

```text
next_sync_at
```

rather than one giant cron job blindly querying every publication.

A scheduler selects publications that are due.

Initial recommended refresh policy:

```text
Publication age        Refresh target

0–48 hours             ~hourly
2–14 days              ~every 6 hours
15–90 days             ~daily
older than 90 days     ~weekly
```

These are defaults, not permanent business rules.

Provider-specific constraints may increase these intervals.

---

# 65. Analytics Failure Behavior

Failures should be classified.

Examples:

```text
temporary_provider_error
rate_limited
token_expired
permission_revoked
publication_not_found
unsupported_metric
invalid_publication
```

Temporary failures may retry.

Authorization failures should transition the connection toward:

```text
needs_reauthorization
```

and should not continuously retry forever.

---

# 66. Background Job Architecture

We need background processing for:

* analytics synchronization,
* token refresh,
* retryable external calls,
* potentially long-running AI work.

V1 will use a **PostgreSQL-backed job queue**.

We will not introduce Redis solely for this requirement.

---

# 67. Jobs Table

Conceptual table:

```text
jobs
```

Fields:

```text
id
type
status
payload
run_at
attempts
max_attempts
locked_at
locked_by
last_error_code
created_at
completed_at
```

Job payloads should contain entity IDs.

Never put:

* OAuth tokens,
* API keys,
* large AI documents

inside job payloads.

---

# 68. Job Claiming

Workers should claim eligible jobs transactionally.

PostgreSQL locking such as:

```text
FOR UPDATE SKIP LOCKED
```

can prevent multiple workers from executing the same queued job simultaneously.

Jobs must still be written to be idempotent.

---

# 69. Job Scheduling

A deployment scheduler/cron periodically invokes a protected internal runner.

Conceptually:

```text
Scheduler
   ↓
Internal Job Runner
   ↓
PostgreSQL Jobs
   ↓
Process limited batch
```

We intentionally do not tie the architecture to one hosting provider's scheduler yet.

The runner endpoint must be authenticated using a server-side secret or deployment-specific trusted mechanism.

---

# 70. Job Idempotency

External integrations can fail in uncertain states.

Every job must tolerate safe retries.

For example:

```text
sync publication #123
```

executed twice should not create duplicate publication records or corrupt analytics.

Use:

* unique constraints,
* deduplication keys where necessary,
* transactional writes.

---

# 71. AI Execution

AI requests may initially execute synchronously where provider latency and hosting limits allow.

However, generation persistence must already support:

```text
pending
running
completed
failed
```

so moving heavy AI calls to the background job system later does not require redesigning the data model.

Long-running operations should be job-backed when necessary.

---

# 72. Internationalization Architecture

Application interface and creator content language are separate concepts.

## UI locale

```text
en
fa
```

## Content language

Stored independently on:

* idea batch,
* idea,
* content.

Changing the interface from English to Persian must not translate existing creator content.

---

# 73. Locale Routing

Use locale-aware application routes.

Conceptually:

```text
/en/ideas
/en/content

/fa/ideas
/fa/content
```

The route locale controls application UI language.

User locale preference may additionally be stored for convenient default routing.

---

# 74. RTL Architecture

Persian renders:

```html
dir="rtl"
```

English renders:

```html
dir="ltr"
```

The document root must also set the correct `lang`.

Components should prefer logical direction concepts:

```text
start
end
inline-start
inline-end
```

instead of unnecessarily hardcoding:

```text
left
right
```

This applies to:

* spacing,
* icons,
* menus,
* sidebars,
* alignment,
* navigation,
* editor layout.

RTL must be tested as part of each UI phase rather than added after V1 completion.

---

# 75. Mixed-Direction Content

Creator documents may contain:

```text
Persian + English
```

in the same content.

The editor must not assume every text fragment shares the UI direction.

Where practical, text blocks should use browser bidi behavior and explicit direction controls only when necessary.

We should avoid manually reversing strings or applying custom text-order transformations.

---

# 76. Validation Architecture

Use Zod schemas at application boundaries.

Important validation includes:

* action inputs,
* AI responses,
* publication URLs,
* locale identifiers,
* content document structure,
* production signal structure,
* provider responses where appropriate.

Validation is not only a frontend concern.

The server remains authoritative.

---

# 77. Database Transactions

Operations that change multiple related records must run transactionally.

Examples:

### Accept content

```text
create content version
+
update accepted version reference
```

### Register publication

```text
validate plan
+
create publication
+
update publication plan
+
schedule analytics sync
```

### Generate idea batch

```text
create AI run
+
create batch
+
create ideas
```

where appropriate based on external call boundaries.

External API calls should generally happen outside long-held database transactions.

---

# 78. External API Transaction Pattern

Do not keep a PostgreSQL transaction open while waiting several seconds for an external provider.

Use:

```text
Create operation/run record
        ↓
Commit
        ↓
Call external service
        ↓
Validate result
        ↓
Short DB transaction to persist result
```

This prevents unnecessary locks and transaction contention.

---

# 79. Migration Strategy

Database schema changes use Drizzle migrations.

Rules:

* migration files committed to Git,
* production changes never rely on `drizzle push`,
* migrations reviewed before deployment,
* destructive migrations require explicit consideration,
* schema and application code are deployed compatibly.

For large future migrations:

```text
expand
 ↓
backfill
 ↓
switch application
 ↓
contract
```

is preferred over risky one-step destructive changes.

---

# 80. Indexing Strategy

Indexes should be designed around expected access paths.

Examples likely include:

```text
workspace_members(user_id, workspace_id)

idea_generation_batches(workspace_id, created_at)
ideas(batch_id)

contents(workspace_id)
contents(source_idea_id)

publication_plans(workspace_id, status)

publications(workspace_id, platform)
publications(external_content_id)

analytics_snapshots(publication_id, fetched_at)

jobs(status, run_at)
```

Do not add dozens of speculative indexes.

Queries should justify indexes.

---

# 81. Uniqueness Constraints

Database constraints should prevent important duplicate states.

Potential examples:

* one membership for the same user/workspace,
* unique generation batch position,
* unique content version number per content,
* one mutable draft per content,
* one external publication ID per provider/account when provider IDs are reliable,
* one metric key per analytics snapshot.

Exact constraints will be finalized with each schema phase.

---

# 82. Optimistic Concurrency

Mutable content drafts should use a revision integer.

Example:

```text
Client loaded revision 12

Server currently has revision 13

Client attempts save using revision 12
```

Server should reject the stale write rather than overwrite revision 13.

This is useful even in a single-user product because:

* multiple browser tabs,
* delayed saves,
* AI actions

can create conflicting writes.

---

# 83. Soft Deletion

Records with historical significance should not normally be immediately physically deleted through everyday UI actions.

Examples:

* ideas,
* content,
* publications.

Use concepts such as:

```text
deleted_at
```

where deletion is needed.

However:

> Soft deletion is not a substitute for permanent privacy/account deletion.

A separate permanent deletion workflow must be able to actually delete data when required.

---

# 84. Security Boundaries

The most important trust boundaries are:

```text
Browser
   ↓
Better Content Server
   ↓
PostgreSQL

Better Content Server
   ↓
AI Provider

Better Content Server
   ↓
Social Providers

Better Content Server
   ↓
Object Storage
```

Credentials must remain on the server side of these boundaries.

---

# 85. Client Security Rules

Never send the browser:

* AI API keys,
* social client secrets,
* OAuth refresh tokens,
* analytics access tokens,
* database credentials,
* storage provider secret keys.

Client components receive only the data needed for UI behavior.

---

# 86. Input Security

User-controlled data includes:

* content,
* DNA instructions,
* publication URLs,
* asset metadata,
* social profile metadata,
* AI-generated output.

All should be treated as untrusted input.

Particularly important:

* do not execute generated markup,
* sanitize rendered HTML where HTML is ever supported,
* avoid arbitrary URL fetching,
* enforce upload MIME/size constraints.

---

# 87. AI Security

Creator-provided text may contain prompt-like instructions.

Feature prompts must clearly separate:

* system/application instructions,
* Content DNA,
* user-provided source data.

We should not assume AI-generated output is safe or valid.

Structured output must be validated before persistence.

Actions with side effects must never occur merely because generated text says to perform them.

---

# 88. Social API Security

Provider adapters must:

* request minimum necessary scopes,
* encrypt tokens,
* handle revocation,
* redact sensitive provider errors,
* obey provider rate limits,
* avoid storing unnecessary provider data.

Provider-specific compliance requirements should be documented in each provider specification.

---

# 89. Observability

Create a centralized logging wrapper.

Logs should use structured fields such as:

```text
requestId
workspaceId
userId
module
operation
entityId
aiRunId
publicationId
jobId
errorCode
```

Do not log:

* OAuth tokens,
* secrets,
* full authentication headers,
* unnecessarily sensitive creator content.

---

# 90. Error Handling

Use stable application error categories.

Examples:

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

UI messages may be localized.

Internal logs can retain more diagnostic context.

---

# 91. Request Correlation

Server operations should receive or generate a request/correlation ID where practical.

For background work:

```text
jobId
aiRunId
publicationId
```

provide additional traceability.

This will matter when diagnosing asynchronous analytics failures.

---

# 92. Testing Strategy

Testing should focus on behavior that can damage user data or break core workflow.

Use three levels.

## Unit tests

For:

* state-transition rules,
* provider URL parsers,
* document schema transforms,
* metric mappings,
* encryption utilities.

## Integration tests

For:

* database behavior,
* transactions,
* authorization,
* versioning,
* analytics persistence,
* job claiming.

## End-to-end tests

For critical user journeys.

---

# 93. Critical V1 E2E Journey

Eventually one test should prove:

```text
Create user
 ↓
Create/configure DNA
 ↓
Generate ideas
 ↓
Accept idea
 ↓
Generate content
 ↓
Edit content
 ↓
Accept content
 ↓
Create publication plan
 ↓
Register external publication
 ↓
Ingest provider analytics
 ↓
Display analytics
```

External providers should be simulated/mockable in automated tests.

CI must not depend on real TikTok/Instagram/YouTube accounts.

---

# 94. Provider Contract Tests

Each social provider adapter needs tests using captured/sanitized fixtures or provider mocks.

Verify:

* URL recognition,
* token expiration behavior,
* external ID parsing,
* metric mapping,
* unsupported metrics,
* rate-limit behavior,
* malformed provider responses.

Provider-specific code must not be tested only manually.

---

# 95. AI Tests

AI tests should distinguish:

### Deterministic application tests

Mock provider output and verify:

* schema validation,
* persistence,
* status changes,
* lineage.

### AI quality evaluation

Separate evaluation can assess whether generated ideas/content are actually useful.

Do not make normal CI depend on nondeterministic live model output.

---

# 96. CI Requirements

Every pull request should eventually require:

```text
lint
typecheck
unit tests
integration tests
build
```

Critical E2E coverage can be added as features become available.

Codex should not consider a phase complete while required checks fail.

---

# 97. Deployment Model

V1 assumes:

```text
Next.js application
       ↓
PostgreSQL
       ↓
External AI / Social / Storage APIs
```

The Next.js application should use the Node.js runtime for server functionality requiring:

* database access,
* encryption,
* OAuth,
* provider SDKs.

We should not design core server functionality around Edge runtime limitations.

---

# 98. Environment Separation

Use separate environments:

```text
development
staging
production
```

They should use separate:

* databases,
* application secrets,
* social OAuth credentials where feasible,
* AI configuration,
* storage buckets/accounts where feasible.

Do not test migrations or OAuth experiments directly against production.

---

# 99. Configuration

Server configuration should be validated at startup.

Examples:

```text
DATABASE_URL
BETTER_AUTH_SECRET
APP_URL
TOKEN_ENCRYPTION_KEY

AI_PROVIDER_...
SOCIAL_PROVIDER_...
```

Missing required configuration should fail clearly rather than cause unpredictable runtime failures later.

---

# 100. Feature Configuration

Provider availability should be configurable.

Example:

```text
Instagram: enabled
TikTok: enabled
YouTube: disabled
```

This allows us to deploy provider code behind controlled rollout and accommodate app-review delays.

Do not build a full generic feature-flag platform for V1.

Simple environment/application configuration is sufficient initially.

---

# 101. Rate Limiting

Rate limits should be added where abuse or cost is meaningful.

Initial candidates:

* login/auth endpoints,
* AI generation,
* idea batch generation,
* social connection attempts,
* manual analytics refresh.

Do not add complex global distributed rate-limit infrastructure until deployment topology requires it.

---

# 102. Analytics Retention

Analytics history has significant product value.

Do not overwrite previous observations.

We need longitudinal data for the future learning system.

However, we should avoid retaining unnecessary provider response payloads.

Store:

* metric values,
* timestamps,
* provider identifiers,
* required diagnostic information.

---

# 103. Traceability Invariant

At all times, given an analytics observation we should be able to navigate:

```text
Metric
 ↓
Snapshot
 ↓
Publication
 ↓
Content Version
 ↓
Content
 ↓
Idea
 ↓
Idea Batch
 ↓
DNA Version
```

where those upstream entities exist.

This relationship is central to Better Content's long-term differentiation.

---

# 104. Future Learning Compatibility

We are **not implementing automatic learning in early V1**.

But the architecture preserves:

* rejected ideas,
* AI runs,
* generated content version,
* human-edited accepted version,
* exact published version,
* publication analytics.

That will eventually allow analysis such as:

```text
AI generated:
"5 fashion mistakes..."

Human changed to:
"You're probably making this mistake..."

Published version:
Version #4

Result:
2.3x normal reach
```

This is the data foundation for later creator-specific learning.

---

# 105. What We Are Deliberately Not Building Yet

Architecture v0.1 explicitly rejects premature implementation of:

* automatic social publishing,
* microservices,
* Redis queues,
* Kafka/event streaming,
* vector databases,
* autonomous AI learning,
* universal engagement scoring,
* full video editing,
* complicated team permissions,
* real-time collaborative editing,
* full DAM systems,
* A/B experimentation infrastructure.

These require future product evidence.

---

# 106. Architectural Decisions Requiring ADRs

The following decisions should become formal ADRs.

## ADR-001 — Modular Monolith

Why one Next.js application instead of microservices.

## ADR-002 — Authentication and Workspace Ownership

Better Auth for authentication, application-owned workspaces.

## ADR-003 — Historical Versioning Strategy

Immutable DNA/content versions with mutable working drafts.

## ADR-004 — Structured Content Storage

Versioned JSONB document rather than relational editor blocks.

## ADR-005 — Workflow State Modeling

`USED` and `PUBLISHED` as derived states rather than duplicated aggregate flags.

## ADR-006 — Publication Model

Publication plans and publications as separate entities.

## ADR-007 — Social Provider Adapter Architecture

Provider-specific APIs behind capability-aware adapters.

## ADR-008 — Social Credential Encryption

Application-level encrypted tokens with key versioning.

## ADR-009 — PostgreSQL Background Jobs

PostgreSQL job queue instead of Redis/message infrastructure.

## ADR-010 — Internationalization Architecture

`next-intl`, locale routes, `en` + `fa`, RTL/LTR from foundation.

## ADR-011 — AI Provider Boundary

Provider-neutral AI application interface and structured output.

## ADR-012 — Database Migration Policy

Drizzle-managed reviewed migrations.

## ADR-014 — Initial AI Provider and Model for Idea Generation

Phase 3 generation contract, strict Responses output, privacy, usage, timeout,
retry, and neutral error policy.

## ADR-015 — AvalAI Initial AI Provider

AvalAI is the current Phase 3 production provider and `gpt-5.6-luna` is the
current production model; the decision supersedes ADR-014 only for the direct
provider and endpoint selection.

---

# 107. Decisions Still Open

These must be resolved before their relevant implementation phases.

## Product-level

### Exact V1 Performance Direction taxonomy

The semantic category is defined, but the exact supported actions and parameters are deferred until Phase 5.

### Exact V1 Edit Direction taxonomy

The semantic category is defined, but the exact supported actions and parameters are deferred until Phase 5.

### Direction anchoring schema

We must define exactly how Performance Directions and Edit Directions attach to Script blocks, spans, phrases, or timing cues.

---

## Technical

### Asset storage provider

Deferred until the asset phase.

### First social platform implementation

Explicitly deferred until the Social Connections phase.

The Product Architect / Technical Lead will research current official platform APIs and recommend the provider order at that time.

Codex must not decide this independently.

### Exact social API scopes

Must be verified immediately before implementing each provider.

### Content editor library

Do not select TipTap, Lexical, or another editor framework until the structured-editor phase.

### Hosting provider

Not required for initial architecture.

---

# 108. Proposed Implementation Phases

Architecture establishes this provisional sequence.

---

## Phase 1 — Foundation

Implement only:

* Next.js/TypeScript project
* dependency baseline
* PostgreSQL
* Drizzle
* Better Auth
* workspace foundation
* English/Persian i18n
* RTL/LTR shell
* shadcn/ui
* environment validation
* logging foundation
* testing foundation
* CI
* initial migrations

No AI.

No ideas.

No content editor.

No social APIs.

---

## Phase 2 — Content DNA

Implement:

* DNA profile
* DNA versions
* Content DNA UI
* validation
* version history behavior

---

## Phase 3 — AI Foundation + Idea Engine

Implement:

* AI provider adapter
* AI runs
* structured output
* idea batches
* generation of 20 ideas
* accept/save/reject
* rejection reason
* idea history

---

## Phase 4 — Content Generation

* contents
* content drafts
* content versions
* generation from accepted/saved idea
* Script generation
* version lineage
* draft editing basics

Performance Direction and Edit Direction generation may be introduced only to the extent explicitly defined in the approved phase specification.

---

## Phase 5 — Structured Editor + Production Direction

Before implementation, explicitly approve:

- canonical V1 Performance Direction taxonomy
- canonical V1 Edit Direction taxonomy
- direction anchoring model

Then implement:

- structured editor
- Script layer
- Performance Direction layer
- Edit Direction layer
* optimistic concurrency
* accepted snapshot
* version history

---

## Phase 6 — Assets

Implement minimal asset support required by production signals.

Do not build a full media-management product.

---

## Phase 7 — Publishing Workflow

Implement:

* publication plans
* publishing queue
* accepted-version targeting
* manual external publishing workflow
* publication URL registration
* supported URL validation

---

## Phase 8 — Social Connections

Implement:

* provider adapter framework
* encrypted credentials
* OAuth flows
* connection management

Provider implementations happen sequentially rather than all simultaneously.

---

## Phase 9 — Analytics

Implement:

* PostgreSQL job queue
* analytics synchronization
* snapshots
* metric values
* retries
* provider-specific analytics
* analytics UI

---

## Phase 10 — V1 Hardening

Implement:

* critical E2E flow
* authorization review
* migration review
* provider error UX
* accessibility
* RTL QA
* observability improvements
* performance review
* security review

Then evaluate V1 release readiness.

---

# 109. Codex Implementation Rule

Codex agents must only implement the currently approved phase.

They may identify future needs, but must not implement them unless the current phase specification explicitly requires them.

Example:

During Phase 3, Codex may say:

> A background job queue may eventually help AI generation.

It must **not** proceed to add Redis, queues, analytics workers, or unrelated infrastructure.

---

# 110. Architecture Change Rule

Once this architecture and its ADRs are accepted:

> significant deviations must not happen silently.

If implementation reveals that an established decision is wrong:

1. identify the problem,
2. explain the tradeoff,
3. propose the replacement,
4. create/update an ADR,
5. then implement the approved decision.

Codex must not rewrite architectural decisions merely because another approach is easier locally.

---

# 111. V1 Architectural Definition

Better Content V1 should ultimately operate as:

```text
                       ┌───────────────────┐
                       │    Better Auth    │
                       └─────────┬─────────┘
                                 │
                                 ↓
┌─────────────┐          ┌───────────────┐
│ Next.js UI  │ ───────→ │ Application   │
│ EN / FA     │          │ Modules       │
└─────────────┘          └───────┬───────┘
                                 │
                 ┌───────────────┼────────────────┐
                 │               │                │
                 ↓               ↓                ↓
           ┌──────────┐     ┌─────────┐     ┌───────────┐
           │PostgreSQL│     │AI APIs  │     │Social APIs│
           └──────────┘     └─────────┘     └───────────┘
                 │                                │
                 │                          Analytics
                 │                                │
                 └───────────────┬────────────────┘
                                 ↓
                           Traceable Data
                                 │
                                 ↓
                         Future AI Learning
```

---

# 112. Architecture Acceptance Criteria

Architecture v0.1 is ready to guide implementation when we agree that:

* Next.js modular monolith is the V1 architecture.
* PostgreSQL is the system of record.
* Better Auth handles authentication.
* Better Content owns its workspace domain.
* English/Persian and RTL/LTR exist from Phase 1.
* Content DNA uses immutable versions.
* Ideas are first-class entities.
* Idea `USED` state is derived.
* Editable content and immutable content versions are separated.
* Structured content uses a versioned document schema.
* Production signals are structured.
* Publications are separate from content.
* Publishing queue uses publication plans.
* Content-level `PUBLISHED` is derived from publications.
* Social login authorization is separate from application login.
* Social integrations use provider adapters.
* Social credentials are encrypted.
* Analytics belong to publications.
* Provider-specific metrics remain provider-specific.
* Analytics history is preserved.
* PostgreSQL-backed background jobs are sufficient for V1.
* AI providers sit behind an application boundary.
* automatic AI learning is not implemented yet.
* Codex works only from approved phase specifications.
