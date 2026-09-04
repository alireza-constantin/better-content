# Better Content

## Product Requirements Document

**Version:** 0.2
**Status:** Approved for V1
**Product stage:** V1 definition

---

# 1. Product Vision

Better Content is an AI-assisted content creation, publishing-workflow, analytics, and learning platform.

The product helps creators move through the complete content lifecycle:

```text
Content DNA
    ↓
Idea Generation
    ↓
Idea Selection
    ↓
Content Generation
    ↓
Human Editing
    ↓
Production Planning
    ↓
Acceptance
    ↓
External Publishing
    ↓
Publication Registration
    ↓
Automatic Analytics Collection
    ↓
Performance Insights
    ↓
Future AI Learning
```

The long-term differentiator is not simply generating content with AI.

Better Content should understand the relationship between:

* why an idea was generated,
* which idea was selected,
* what content was generated from it,
* how the creator edited it,
* which version was approved,
* where that version was published,
* how the publication performed,
* and what can eventually be learned from that performance.

The platform should preserve this entire lineage.

---

# 2. Core Product Principle

Every important entity must remain traceable throughout the content lifecycle.

Conceptually:

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
Analytics Snapshots
        ↓
Insight
        ↓
Future DNA / Skill / Memory Improvement
```

This relationship must never be lost.

A publication should always be traceable back to:

* its exact content version,
* the content's source idea,
* the generation batch,
* and the Content DNA version used.

---

# 3. Target User

V1 is designed primarily for individual creators who regularly produce social-media content.

Examples include:

* Instagram creators
* TikTok creators
* YouTube Shorts creators
* educators
* fashion creators
* personal brands
* small creator businesses

V1 should optimize for a simple single-creator experience.

The architecture should not prevent future:

* teams
* agencies
* editors
* approval workflows
* multiple social accounts
* multiple brands

Advanced collaboration is not part of initial V1.

---

# 4. Supported Languages

V1 must support:

* English
* Persian

Internationalization is a foundational architecture requirement.

The application must correctly support:

* LTR interfaces
* RTL interfaces
* English content
* Persian content
* mixed Persian and English text
* locale-aware UI
* proper RTL layout behavior

Application language and content language must remain separate concepts.

A user may use the Better Content interface in English while creating Persian content.

---

# 5. Primary V1 Workflow

The primary workflow is:

```text
Create Account
      ↓
Configure Content DNA
      ↓
Generate 20 Ideas
      ↓
Accept / Save / Reject Ideas
      ↓
Select Idea
      ↓
Generate Content
      ↓
Edit Content
      ↓
Add Performance / Edit Directions
      ↓
Draft
      ↓
Accept
      ↓
Publishing Queue
      ↓
Creator Publishes Externally
      ↓
Add / Detect Published URL
      ↓
Publication Registered
      ↓
Automatic Analytics Sync
      ↓
Performance Dashboard
```

---

# 6. V1 Product Areas

V1 consists of the following main product areas:

1. Authentication and foundation
2. Content DNA
3. Idea generation
4. Idea management
5. AI content generation
6. Structured content editing
7. Production Direction
8. Content lifecycle
9. Publishing queue
10. External publication registration
11. Social account connections
12. Automatic social analytics synchronization
13. Analytics history
14. Traceability foundation for future AI learning

---

# 7. Authentication

Users must be able to:

* create an account,
* sign in,
* sign out,
* maintain authenticated sessions,
* access only resources they own.

Authentication will use:

**Better Auth**

unless a later approved ADR changes this decision.

Authorization must always be enforced server-side.

---

# 8. Workspace Model

V1 should appear primarily as a single-user application.

However, creator-owned data should belong to a workspace boundary internally so future collaboration does not require redesigning every table.

A new user may automatically receive a default workspace.

The exact workspace implementation will be defined in architecture.

V1 does not require:

* invitations,
* workspace roles,
* complex permissions,
* team administration.

---

# 9. Content DNA

## 9.1 Purpose

Content DNA represents persistent creator-specific context used by AI when generating ideas and content.

It should describe how the creator thinks, communicates, and produces content.

It must not be implemented as one uncontrolled giant prompt.

---

# 10. V1 Content DNA Fields

At minimum, Content DNA should support:

* creator or brand description
* target audience
* primary topics
* tone
* content goals
* preferred content formats
* preferred content languages
* preferred style
* topics to avoid
* approaches to avoid
* additional creator instructions

Future versions may include:

* successful patterns
* preferred hooks
* vocabulary
* visual identity
* editing style
* CTA preferences
* learned creator behavior

---

# 11. Content DNA Versioning

Content DNA must be versioned.

Example:

```text
DNA v1
DNA v2
DNA v3
```

Whenever a generation occurs, the system must preserve which DNA version was used.

Editing today's DNA must never retroactively change the context associated with older ideas or content.

---

# 12. Idea Generation

Idea generation is a first-class feature and must exist before content generation.

The user can request a new batch of ideas.

The default V1 generation count is:

**20 ideas**

Each idea should be based on the active Content DNA.

---

# 13. Idea Structure

An idea should contain structured information.

At minimum:

* title
* short description
* language
* topic/category where available
* source generation batch
* Content DNA version
* generation timestamp
* status

Example:

```text
Title:
Why Expensive Clothes Don't Always Look Expensive

Description:
A short educational Reel about the visual signals that make clothing appear premium regardless of price.
```

---

# 14. Idea Generation Batches

Every accepted idea-generation operation creates a batch. Requests rejected
before generation begins because authorization, validation, Content DNA
freshness/readiness, or workspace generation limits fail create no batch. An
idempotent replay returns the existing operation/batch and does not create
another.

Example:

```text
Generation Batch #42
├── Idea 1
├── Idea 2
├── Idea 3
├── ...
└── Idea 20
```

The batch should preserve:

* Content DNA version
* generation date
* requested language
* generation configuration
* model/provider metadata where appropriate
* all generated ideas

This will later allow us to measure AI idea-generation quality.

---

## Workspace-wide Idea Library

The primary Ideas experience is a workspace-wide Idea Library, not a list of
generation batches. The Library must let a creator discover and organize Ideas
across **all** generation batches in the current workspace without first
opening a particular batch.

The Library provides these views or equivalent status filters:

* **All** — every Idea in the workspace
* **New** — Ideas with status `NEW`
* **Saved** — Ideas with status `SAVED`
* **Accepted** — Ideas with status `ACCEPTED`
* **Rejected** — Ideas with status `REJECTED`

The default view is **New**, which favors active review of Ideas that have not
yet been deliberately classified. The other views remain directly available;
the default does not limit discovery.

The **Saved** view is a useful backlog: it shows all Ideas deliberately kept
for later across every generation batch without requiring batch navigation.

A Library item may show useful existing facts such as its title, description,
current decision state, Idea language, generation date, lightweight batch
provenance, and derived Content existence or count. The Library preserves the
existing Save, Accept, and Reject actions. For an `ACCEPTED` Idea it keeps
Generate Script available where the existing Content-generation eligibility
rules allow it, and it makes existing linked Content discoverable where the
current read model supports that link. Generating another Content remains
allowed; accepting an Idea alone remains side-effect-free and never generates
Content automatically.

Generation batches remain accessible as a secondary Generation History
surface. They remain the authoritative provenance containers for Idea
generation lineage, the associated Content DNA version, AI Run, requested
language, generated position/order, and generation timestamps. The Library
does not flatten or duplicate that lineage into Idea records merely for
convenience.

The Library uses the existing Idea, batch, and Content relationships. It does
not require a new persisted Idea status, a persisted Content count, or a
`workspaceId` on Idea. Idea ownership continues to resolve through its
generation batch and workspace. This correction does not add full-text or
semantic search, embeddings, tags, folders, collections, separate favorites,
custom statuses, Kanban/drag-and-drop, bulk actions, custom sorting,
pagination architecture unless existing data-volume/query conventions require
it, deletion/archive, AI recommendations, or learning from Saved or Rejected
Ideas.

---

# 15. Idea States

V1 persists exactly these Idea decision states:

```text
NEW
SAVED
ACCEPTED
REJECTED
```

## NEW

Generated and not yet deliberately classified by the creator.

## SAVED

Interesting or worth keeping, but not currently approved for Content
generation.

## ACCEPTED

Deliberately approved as an Idea that may proceed into Content generation.

## REJECTED

Deliberately unwanted or rejected by the creator. Rejected Ideas remain stored
as historical and future-learning evidence and remain retrievable through the
Rejected Library view.

## USED (derived indicator)

`USED` is not a persisted Idea status. Derive:

```text
hasContent = exists Content linked to this Idea
```

The Library may communicate this derived fact as **No content yet**, **Has
content**, a Content count, or an equivalent presentation. An `ACCEPTED` Idea
must make it easy to distinguish accepted-but-unused from accepted Ideas with
one or more linked Content records. One Idea may have multiple Content
records.

The UI may use **Reject** as the action label, but rejection is not deletion;
the Idea record and its current rejection reason remain stored. No separate
decision-event history is introduced.

---

# 16. Rejected Ideas

Rejected AI ideas must not normally be permanently destroyed.

They represent valuable future learning data.

Rejected Ideas should not dominate the creator's normal active workflow. They
remain retrievable through the Rejected view of the workspace-wide Idea
Library, and rejection does not become deletion or archive. Rejected Ideas are
not used for AI learning in this correction; future learning remains out of
scope.

Optional V1 rejection reasons may include:

* Too generic
* Already covered
* Not relevant
* Not interesting
* Difficult to produce
* Wrong direction
* Other

Providing a reason should not be mandatory.

The action should remain fast.

---

# 17. Generate Content From an Idea

V1 Content generation begins only from an `ACCEPTED` Idea and only after an
explicit creator action. Accepting an Idea does not automatically create
Content or invoke AI. `NEW`, `SAVED`, and `REJECTED` Ideas are not eligible;
a saved Idea must first be accepted.

The relationship must remain explicit:

```text
Idea
 ↓
Content
```

Content must retain its originating Idea ID.

Better Content must not simply copy the idea text into a content record and lose the relationship.

One accepted Idea may produce multiple Content aggregates for different
languages, formats, instructions, or creative approaches. Creating Content
does not freeze the Idea's decision state. Later Idea state changes do not
invalidate already accepted generation operations or delete resulting Content.
`USED` remains derived from the existence of linked Content and is never stored
as an Idea status.

---

# 18. Content Generation Inputs

The Phase 4 Content-generation request contains exactly:

* workspace
* source Idea
* client-observed base Content DNA version
* requested content language
* requested format
* optional creator instructions
* idempotency key

The only Phase 4 formats are `SHORT_VIDEO` and `LONG_VIDEO`. Instructions are
optional, canonically trimmed, and limited to 1,000 characters. Content
language is `en` or `fa`, is independent of Idea language and UI locale, and
must be supported by the current authoritative AI-ready Content DNA.

Before accepting a new operation, the server verifies that the submitted base
DNA version is still current. A mismatch has no generation, quota, or provider
side effects. Once accepted, the operation remains permanently bound to that
immutable DNA version even if current DNA later changes. Content generation
does not automatically reuse the historical DNA version that generated the
Idea.

Generated Content initially has one mutable Draft. In Phase 4, **Draft** is a
descriptive authoring condition, not a persisted Content lifecycle status.

---

# 19. Script and Production Direction

Better Content content has one core Script with two categories of structured Production Direction.

```text
Content
├── Script
├── Performance Direction
└── Edit Direction
```

## Script

Represents what the creator says or communicates.

## Performance Direction

Represents how the creator should physically or vocally perform the relevant Script content while recording.

Examples include:

* pause
* movement
* posture/position
* gesture
* gaze
* expression
* vocal delivery
* object interaction

## Edit Direction

Represents how the recorded footage should be edited.

Examples include:

* zoom
* cut
* image/video overlay
* B-roll
* text
* sound
* transition
* visual emphasis

Performance Direction and Edit Direction are not separate content types.

They are structured production instructions associated with the same Script.

---

# 20. Structured Content

Content should not exist only as a giant opaque text field.

Phase 4 begins with the smallest schema-versioned Script document:

```json
{
  "schemaVersion": 1,
  "script": {
    "text": "..."
  }
}
```

The Script is plain Unicode text. Phase 4 does not define blocks, direction
anchors, or Production Direction structure.

The system must eventually understand individual content sections or blocks.

Conceptually:

```text
Content
├── Block
├── Block
├── Block
└── Block
```

The later structured-editor schema, including blocks and direction anchoring,
will be defined and explicitly transformed during Phase 5. Immutable Phase 4
schema-v1 Content Versions retain their original interpretation.

Structured content allows production instructions to reference specific parts of the content.

---

# 21. Production Directions

The content editor must support Performance Direction and Edit Direction.

Performance Direction includes instructions for how the creator performs the Script while recording, such as:

* Pause
* Long pause

Edit Direction includes post-production instructions, such as:

* Zoom in
* Zoom out
* Image overlay
* B-roll
* Screenshot
* Cut
* Hold
* Text emphasis
* Sound effect
* Transition

The exact canonical V1 direction list will be intentionally limited.

We should not attempt to recreate an entire professional video editing application in V1.

---

# 22. Production Directions Are Structured Data

Production Directions must not exist only as strings embedded into the Script.

Avoid treating this as the canonical representation:

```text
This is the hook [ZOOM IN] and now...
```

The system should instead represent:

```text
Content Block
      +
Production Direction
```

The UI may visually display directions inline.

The underlying data must remain structured.

---

# 23. References and Assets

Production Directions, especially Edit Directions, may reference assets.

Examples:

* overlay image
* screenshot
* image reference
* B-roll reference
* visual example

V1 needs the architectural ability to associate assets/references with relevant Production Directions.

A complete digital asset management platform is outside V1.

---

# 24. Content Editing

Users must be able to:

* view generated content,
* edit AI-generated text,
* add/remove structured sections where supported,
* add Performance Directions and Edit Directions,
* edit Performance Directions and Edit Directions,
* save their work.

Phase 4 implements plain Script viewing/editing and autosave only. Adding and
editing structured Performance Directions, Edit Directions, sections, and
anchors begins in Phase 5 after its taxonomy and anchoring decisions are
approved.

Human edits should remain distinguishable from the originally generated output where practical.

This information will eventually become important learning data.

---

# 25. Content Versioning

Content must support version history.

Initial AI Content generation creates immutable Content Version #1 and a
mutable Draft initialized from the same canonical validated Script. Human
autosaves change only the Draft and do not create versions. The immutable
initial version preserves the generated artifact for future comparison.

At minimum, Better Content must preserve the difference between:

```text
Current working version
```

and:

```text
Version actually approved/published
```

Editing a content item after publication must never silently alter the historical published version.

---

# 26. Content Lifecycle

The user-facing V1 lifecycle is:

```text
DRAFT
  ↓
ACCEPTED
  ↓
PUBLISHING QUEUE
  ↓
PUBLISHED
```

Additional internal states may be added where necessary for correctness.

---

# 27. Draft

A Draft is content still being created or edited.

Draft content may be changed freely.

---

# 28. Accepted

When the creator approves content, it becomes Accepted.

The system must identify the exact accepted version.

Accepted content can enter the publishing queue.

---

# 29. Publishing Queue

The publishing queue contains content that has been accepted but has not yet been confirmed as externally published.

The queue should help the creator understand:

* what is ready,
* where it is intended to be published,
* what content version is approved,
* which items are still awaiting publication.

---

# 30. External Publishing

Automatic social-platform publishing is **not part of initial V1**.

Better Content will not initially publish posts directly to:

* Instagram
* TikTok
* YouTube
* LinkedIn
* X
* Facebook

The creator publishes their content through the external social platform.

After publication, Better Content registers the resulting publication.

---

# 31. Publication Registration

After externally publishing content, the creator should be able to associate the published post with the accepted Better Content item.

Primary V1 interaction:

```text
Accepted Content
       ↓
Creator publishes externally
       ↓
Creator adds published URL
       ↓
Better Content identifies platform
       ↓
Publication registered
```

Where technically appropriate, Better Content may assist in detecting information from the pasted URL.

---

# 32. Publication Entity

Publication is a first-class domain entity.

It must not be represented simply as:

```text
content.published = true
```

Conceptually:

```text
Content
   ↓
Content Version
   ↓
Publication
```

A publication should contain concepts such as:

* platform
* external URL
* external content/post ID where available
* connected platform account
* publication timestamp
* published content version
* analytics synchronization state

---

# 33. Multiple Publications

The architecture must support the possibility that one content item is published more than once.

Example:

```text
Content #25
├── Instagram Publication
├── TikTok Publication
└── YouTube Publication
```

Even if all platforms are not supported initially, the data model must not assume one content item has exactly one publication.

---

# 34. Social Account Connections

Automatic analytics retrieval is part of V1.

Therefore Better Content must support authenticated connections to supported social platforms where required.

Conceptually:

```text
Creator
   ↓
Connected Social Account
   ↓
Platform API
```

A social account connection may contain:

* platform
* external account ID
* account metadata
* authorization state
* granted permissions/scopes
* credential/token references
* token expiry
* synchronization state

Sensitive credentials must be stored securely and never exposed to the frontend unnecessarily.

---

# 35. Published URL Is Not Sufficient for All Analytics

The published post URL is important because it identifies the publication.

However, the URL alone should not be assumed to provide access to private metrics such as:

* reach
* saves
* detailed watch time
* retention
* private insights

Where the platform requires authorization, Better Content must use the connected creator account and official supported API access.

The product must never imply that analytics can always be retrieved purely from a URL.

---

# 36. Automatic Social Analytics

Automatic analytics synchronization is a V1 feature.

Once a supported publication is registered and the required platform account is connected, Better Content should automatically retrieve available performance data.

Potential metrics include:

* views
* reach
* impressions
* likes
* comments
* shares
* saves
* watch time
* average watch duration
* completion rate
* audience retention
* engagement-related metrics

The exact metrics depend on what each external platform exposes.

---

# 37. Platform-Specific Analytics

Different social platforms have different metric definitions.

Better Content must preserve original platform semantics.

For example:

```text
Instagram Reach
```

must not silently become identical to:

```text
YouTube Views
```

We may later create normalized cross-platform metrics, but raw platform metrics must always remain available.

---

# 38. Analytics Snapshots

Analytics must be stored historically rather than overwriting one row every time numbers change.

Example:

```text
Instagram Publication #82

Day 1
Views: 8,200
Likes: 540

Day 2
Views: 17,300
Likes: 910

Day 7
Views: 42,100
Likes: 1,920
```

This enables later analysis of:

* first-hour performance
* first-day performance
* seven-day performance
* growth velocity
* early vs final performance
* content lifespan

---

# 39. Analytics Synchronization

Better Content should periodically update analytics for active supported publications.

The exact refresh strategy will be determined during architecture.

It must balance:

* platform rate limits,
* provider restrictions,
* cost,
* freshness,
* publication age,
* system complexity.

We should not continuously poll every post forever.

---

# 40. Analytics Synchronization States

The product should support concepts such as:

```text
PENDING
SYNCING
SYNCED
CONNECTION_REQUIRED
PERMISSION_REQUIRED
UNSUPPORTED
FAILED
```

The final state model will be defined in architecture.

Users should understand when analytics are unavailable and why.

---

# 41. Unsupported Metrics

Better Content must never fabricate metrics.

If a platform does not expose a metric through available supported APIs, the UI should indicate:

**Unavailable**

rather than guessing it.

---

# 42. Analytics Traceability

Analytics belong to publications.

Correct relationship:

```text
Idea
 ↓
Content
 ↓
Content Version
 ↓
Instagram Publication
 ↓
Instagram Analytics Snapshots
```

A TikTok publication of the same content has separate analytics:

```text
Same Content
 ↓
TikTok Publication
 ↓
TikTok Analytics Snapshots
```

This is essential because content may perform very differently across platforms.

---

# 43. Analytics Dashboard

V1 should allow creators to inspect publication performance.

At minimum, users should be able to see:

* publication
* platform
* publication date
* latest available metrics
* historical metric changes
* synchronization status

A more advanced cross-content analytics dashboard may be introduced after basic synchronization works reliably.

---

# 44. AI Learning Loop

The long-term goal is to use real content performance to improve future AI output.

However, analytics must not directly rewrite creator DNA or AI behavior.

We use:

```text
Analytics
   ↓
Analysis
   ↓
Insight
   ↓
Suggested Learning
   ↓
Creator Approval
   ↓
DNA / Skill / Memory Change
```

rather than:

```text
Views increased
   ↓
Automatically change AI
```

---

# 45. Automatic Learning Is Not Initial V1

V1 must collect and preserve the information required for future learning.

Initial V1 does not need to automatically:

* generate behavioral rules,
* update Content DNA,
* modify AI memory,
* modify AI skills,
* optimize prompts.

Those features follow once sufficient real-world data exists.

---

# 46. Human Editing Signals

The difference between AI output and creator-edited output is potentially valuable.

Future analysis may answer questions such as:

* Which AI hooks does the creator usually rewrite?
* Which words do they remove?
* Which sections do they shorten?
* Which Performance Directions or Edit Directions do they change?
* Which AI-generated structures survive to publication?

V1 architecture must avoid destroying this information.

---

# 47. AI Generation Traceability

Meaningful AI generation operations use a durable product-operation entity
paired one-to-one with an AI Run. The operation owns immutable canonical
business inputs and source lineage. The AI Run owns safe provider/model/prompt
configuration, execution state, neutral usage, and canonical validated output.
Neither owns raw assembled prompts, raw provider envelopes, or hidden
reasoning.

Together they retain metadata needed for:

* debugging
* reproducibility
* analysis
* evaluation
* future learning

Potential metadata includes:

* generation type
* source entity
* Content DNA version
* model
* provider
* generation configuration
* timestamp

We should not necessarily expose all metadata in the normal UI.

---

# 48. Primary V1 Screens

V1 should contain the following main product areas.

## Dashboard

High-level current activity and workflow status.

## Ideas

Use the workspace-wide Idea Library to discover and manage Ideas across all
generation batches. Generation History remains available as a secondary
provenance surface.

## Content

View and edit content.

## Publishing Queue

View accepted items awaiting external publication.

## Published

View registered publications and analytics.

## Analytics

Inspect publication performance.

## Content DNA

Configure persistent AI context.

## Connections

Connect supported social accounts used for analytics.

## Settings

Manage application preferences including language.

---

# 49. V1 Success Criteria

V1 is successful when a creator can complete this complete workflow without developer intervention:

1. Create an account.
2. Configure Content DNA.
3. Generate 20 ideas.
4. Review Ideas in the workspace-wide Library without opening individual
   generation batches.
5. Accept, save, and reject Ideas.
6. Choose an Idea.
7. Generate content from the Idea.
8. Edit the generated content.
9. Add supported Performance Directions and Edit Directions.
10. Save the content as Draft.
11. Accept a specific content version.
12. See the item enter the publishing queue.
13. Publish the content manually on a supported external platform.
14. Add the external published URL to Better Content.
15. Connect the relevant social account if required.
16. Register the external publication.
17. Automatically retrieve available analytics.
18. See updated analytics over time.
19. Trace the publication back to its exact content version.
20. Trace the content back to its originating Idea.
21. Trace the Idea back to its generation batch and Content DNA version.

If this complete loop works reliably, the V1 architecture has proven the central product thesis.

---

# 50. V1 Non-Goals

The following are explicitly outside initial V1 unless later approved.

## Automatic Social Publishing

No direct publishing from Better Content to:

* Instagram
* TikTok
* YouTube
* LinkedIn
* X
* Facebook

## Automatic AI Learning

No automatic changes to:

* Content DNA
* Skills
* memories
* prompts

based purely on analytics.

## Full Video Editor

Better Content is not attempting to replace:

* CapCut
* Premiere Pro
* DaVinci Resolve

Production Directions describe performance and editing intent; they do not perform full video editing.

## Complex Team Collaboration

No:

* approval chains
* complex workspace roles
* editor assignments
* internal discussions
* enterprise permissions

## Advanced Experimentation

No built-in A/B testing in initial V1.

## Full Asset Management

No advanced DAM/media library system.

## Campaign Management

No advanced multi-post campaign orchestration.

---

# 51. Preferred Technology Stack

The approved preferred stack is:

* Next.js
* TypeScript
* PostgreSQL
* Drizzle ORM
* shadcn/ui
* Better Auth

Significant stack changes require a documented architectural reason and an ADR.

---

# 52. Architecture Direction

V1 should use a:

**Modular monolith**

rather than microservices.

The default architecture should favor:

* simple deployment
* strong domain boundaries
* understandable code
* PostgreSQL transactions
* maintainability
* traceability

We should not introduce additional infrastructure without a concrete requirement.

Do not add technologies such as:

* Redis
* Kafka
* Elasticsearch
* separate backend services
* separate analytics services
* microservices

simply because they may be useful in the future.

---

# 53. Background Processing

Some V1 features will require work that should not happen inside a normal browser request.

Examples include:

* analytics synchronization
* token refresh
* potentially long AI generation operations
* retrying external platform requests

The exact job architecture will be decided in technical architecture work.

We should choose the simplest reliable mechanism appropriate to actual V1 requirements.

---

# 54. Security Requirements

V1 must implement production-quality security fundamentals.

At minimum:

* server-side authentication validation
* server-side authorization
* workspace ownership validation
* secure credential storage
* protected OAuth/platform tokens
* server-only AI provider credentials
* input validation
* secrets outside source control
* careful public/private data separation
* safe handling of uploaded assets
* secure external integrations
* rate limiting where necessary
* protection against unauthorized publication/analytics access

---

# 55. External Platform Security

Social platform credentials and refresh tokens are sensitive.

Better Content must:

* never expose provider secrets to the browser,
* request only necessary permissions,
* support revoked/expired connections,
* avoid logging credentials,
* securely store required token material,
* handle account disconnection cleanly.

Platform integrations should use officially supported APIs wherever possible.

---

# 56. Data Integrity

Historical lineage has high product value.

The database must preserve relationships such as:

```text
DNA Version
 ↓
Generation Batch
 ↓
Idea
 ↓
Content
 ↓
Content Version
 ↓
Publication
 ↓
Analytics Snapshot
```

Normal editing and deletion actions must not accidentally destroy this history.

---

# 57. Soft Deletion and Historical Records

Objects with historical learning value should generally not be immediately hard-deleted.

Examples:

* rejected ideas
* published content versions
* publication records
* analytics snapshots

User-facing deletion behavior and permanent deletion/privacy requirements will be designed separately.

---

# 58. Validation

Important writes must be validated on the server.

Validation includes:

* ownership
* state transitions
* supported languages
* allowed statuses
* publication eligibility
* URL/platform compatibility
* connected account ownership
* analytics relationship validity
* AI generation inputs

Frontend validation is useful for user experience but is not sufficient for correctness.

---

# 59. Testing

Each implementation phase must define acceptance tests.

We should prioritize:

* authorization tests
* domain state-transition tests
* data-integrity tests
* integration tests
* API/provider mapping tests
* analytics synchronization tests
* AI structured-output validation
* critical end-to-end workflow tests

The goal is confidence in important behavior, not maximizing test counts.

---

# 60. Observability

The application must provide enough observability to understand failures.

We need logging for:

* authentication failures
* AI generation failures
* publication registration failures
* external API failures
* token refresh failures
* analytics synchronization failures
* invalid state transitions
* unexpected server errors

Sensitive tokens, secrets, or private provider payloads must not be logged carelessly.

---

# 61. Performance

V1 does not need hyperscale architecture.

We prioritize:

1. correctness
2. security
3. maintainability
4. data integrity
5. product speed
6. reasonable performance

Optimization should follow evidence rather than speculation.

---

# 62. Important Product Decisions

The following decisions are currently established.

## Decision 1 — Ideas are first-class entities

Ideas are stored objects, not temporary AI text. They are primarily discovered
through a workspace-wide Idea Library, while generation batches remain their
provenance and history containers.

## Decision 2 — Idea generation precedes content generation

V1 Content generation requires an explicitly selected `ACCEPTED` Idea.
Accepting an Idea alone does not generate Content.

## Decision 3 — Generate 20 ideas by default

Idea generation batches produce 20 creator-specific suggestions.

## Decision 4 — Rejected ideas retain learning value

Rejected Ideas remain stored and retrievable through the Library's Rejected
view. A rejection action is not database deletion.

## Decision 5 — Content DNA is versioned

Historical generations retain their originating DNA version.

## Decision 6 — Content remains linked to its idea

The lineage must never be lost. One Idea may produce multiple Content
aggregates, and `USED` remains derived from their existence.

## Decision 7 — Production Directions are structured

Better Content distinguishes:

* Performance Direction
* Edit Direction

Both are structured data associated with the Script rather than merely annotations embedded in plain text.

## Decision 8 — Content is versioned

Initial AI output and published content must remain immutable historically.
Content keeps one mutable Draft while meaningful snapshots are immutable
Content Versions.

## Decision 9 — Publication is a separate entity

Content and publication are not the same object.

## Decision 10 — Social publishing is manual in V1

Better Content does not initially publish directly to external networks.

## Decision 11 — Social analytics synchronization is V1

Supported publication analytics should be retrieved automatically.

## Decision 12 — External account authorization is allowed in V1

Platform connections may be required for analytics.

## Decision 13 — Analytics belong to publications

Not directly to the generic content object.

## Decision 14 — Analytics use historical snapshots

Metric history should not be overwritten.

## Decision 15 — AI learning is approval-based

Performance does not directly modify creator DNA.

## Decision 16 — English and Persian are foundational

RTL/LTR support must exist from the beginning.

## Decision 17 — Modular monolith

V1 avoids unnecessary distributed architecture.

## Decision 18 — Workspace-wide Idea Library

The primary Ideas surface is a workspace-wide Library with `All`, `New`,
`Saved`, `Accepted`, and `Rejected` views spanning every generation batch. The
default view is `New`. Generation History remains a secondary provenance
surface, and the Library is implemented from existing Idea, batch, and Content
relationships without a new Idea entity, persisted Content count, or persisted
`USED` status.

---

# 63. Open Product Decisions

The following items require explicit decisions before their implementation phases.

## A. Production Direction Taxonomy

The distinction between Performance Direction and Edit Direction is resolved.

Before implementing the structured editor, we must define the exact V1 Performance Direction and Edit Direction types, parameters, and constraints.

## B. Direction Anchoring

We need to define how Performance Directions and Edit Directions attach to relevant Script content.

Potential anchors may include:

* an entire Script block
* a text span
* a word or phrase cue
* before/after a block
* relative timing

The exact model will be approved before the structured-editor phase.

## C. Initial Social Platform Implementation

Automatic social analytics remains a V1 requirement.

The first provider and implementation order are intentionally deferred until the Social Connections phase.

At that time, current official provider APIs, permissions, app-review requirements, available metrics, test access, rate limits, and implementation complexity must be reviewed before choosing the first platform.

## D. Analytics Refresh Strategy

We need rules for how often publications are synchronized based on age and platform limitations.

## E. AI Provider Strategy

The provider-neutral application boundary is established by architecture.
Provider/model and operating policies are selected per workflow rather than
globally: ADR-014 as superseded in part by ADR-015 governs Phase 3 Idea
generation, and ADR-016 governs Phase 4 Content Script generation. Future AI
workflows or changes to an existing workflow still require deliberate
provider/model, structured-output, retry/failure, privacy, usage/cost, and
latency decisions before implementation.

## F. Content Editor Data Structure

We must finalize how Script blocks, Performance Directions, Edit Directions, timing, references, and direction anchors are represented within the structured document schema.

## G. Publishing Queue UX

We need to determine how users mark intent such as target platform before publishing.

## H. Social Connection UX

We need to define how connections, expired permissions, reconnecting, and unsupported account types are presented.

---

# 64. Future Product Direction

After the core V1 loop is reliable, Better Content may expand toward:

```text
Analytics
   ↓
AI Performance Analysis
   ↓
Creator-Specific Insights
   ↓
Suggested Rules
   ↓
Approved Skill / DNA Changes
   ↓
Better Idea Generation
   ↓
Better Content
   ↓
New Analytics
   ↺
```

Likely future capabilities include:

* AI performance insights
* Content DNA learning
* Skills
* creator memory
* cross-platform performance normalization
* experiments
* A/B testing
* automatic publishing
* scheduling
* brand profiles
* reference libraries
* advanced asset management
* team collaboration
* campaign planning
* advanced production timelines

These are not automatically added to V1.

---

# 65. Definition of V1

Better Content V1 is not:

> An AI writer with a social dashboard.

It is:

> **A traceable AI-assisted content production system that uses creator-specific DNA to generate ideas, turns selected ideas into structured content and production instructions, preserves human edits and approved versions, connects externally published posts back to their source content, automatically retrieves available social analytics, and preserves the complete data lineage required for future AI learning.**
