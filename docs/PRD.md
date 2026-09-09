# Better Content

## Product Requirements Document

**Status:** Approved V1 product truth

This document defines current product behavior and V1 scope. It does not define
implementation mechanics; those belong in [Architecture](ARCHITECTURE.md),
[ADRs](adr/README.md), and specialist standards. Derived documentation never
overrides this PRD.

## Product vision

Better Content helps an individual creator turn creator-specific intent into
traceable, repeatable content production. It is not merely an AI writer or a
social dashboard: it preserves the decisions and artifacts that explain how an
Idea became approved Content and, later, how it performed.

```text
Creator context → Ideas → selected production work → structured Content
→ approved Version → creator recording → future publication and analytics
```

## Target creator and jobs

The primary user is a solo creator making short or long video-oriented content
in English, Persian, or mixed language. The creator needs to:

- express audience, voice, goals, and constraints;
- generate and decide among creator-specific Ideas;
- prioritize accepted Ideas for production;
- create, edit, approve, and record structured Content;
- attach managed production media deliberately; and
- later connect publication and analytics to source Content.

V1 prioritizes creator control, traceability, and dependable production over
autonomous publishing, generic collaboration, and media discovery.

## Workspace and languages

A user works in one personal Workspace in V1. Workspace records are private to
their authorized member; V1 does not provide team administration, public
creator records, or shared multi-workspace collaboration.

The product supports English (`en`, LTR) and Persian (`fa`, RTL). UI locale and
creator-content language are separate. Changing UI locale never translates,
rewrites, or reverses creator content. All product surfaces work in both
locales, preserve logical direction, and support mixed Persian/Latin content.

## Current creator workflow

1. Enter the authenticated Workspace.
2. Create or update Content DNA until it is AI-ready.
3. Generate Ideas, then save, accept, or reject them in the Workspace Library.
4. Prioritize eligible accepted Ideas in the Production Queue.
5. Generate Content from an accepted Idea and edit its structured Draft.
6. Accept a meaningful Draft as an immutable Version; continue editing if needed.
7. Read the current accepted Version in Teleprompter / Recording Mode.

Publishing, Social Connections, and Analytics are future capabilities and are
not current workflow steps.

## Content DNA

Content DNA is the creator's versioned context for generation: audience,
subject, voice, goals, constraints, and language context.

- A Workspace has one current Content DNA and retains historical versions.
- A creator can save incomplete but valid DNA. AI readiness is derived from its
  current data rather than manually selected as a product lifecycle state.
- Generation retains the exact DNA version it used; later DNA changes do not
  rewrite prior Ideas or Content provenance.
- Historical DNA is readable but not an editable substitute for current DNA.

## Ideas and Idea Library

Generating Ideas creates exactly 20 creator-specific Ideas from current
AI-ready Content DNA in the requested supported language. A generation batch is
provenance, not a separate primary product surface.

Each Idea has title, description, optional category, language, decision state,
and generation provenance. Canonical states are:

| State | Meaning |
| --- | --- |
| `NEW` | Generated and not yet decided. |
| `SAVED` | Kept for later consideration. |
| `ACCEPTED` | Selected as eligible production input. |
| `REJECTED` | Retained historical feedback; an optional reason may be kept. |

`USED` is derived from linked Content; it is not a persisted decision state.

The Workspace-wide Idea Library is the primary Ideas experience. It combines
decision-state views with `All runs` or an owned historical-run filter. Its
default is `New + All runs`. It does not add tags, folders, collections, custom
states, bulk decision workflows, or a second batch-history product.

## Production Queue

The Production Queue belongs to the Content product and is not an Idea state. An
Idea appears only when it is `ACCEPTED` and has no linked Content. Creators can
prioritize queued Ideas; new eligible Ideas append after current queued work.

Generating or otherwise linking Content removes an Idea from the derived queue.
Creators do not separately complete, archive, or remove a queue entry. The
Content product also provides a Generated Content Library and narrow source-Idea
filtering. One Idea may deliberately lead to more than one Content item.

## AI Content generation

Content generation starts only from an accepted Idea and eligible creator
context. The creator chooses short-video or long-video format and may provide
instructions, while the product retains authority over supported language,
format, and document shape.

One successful current generation creates one traceable Content item with:

- ordered Script blocks;
- contextually useful Performance Directions;
- contextually useful Edit Directions; and
- B-roll search queries only where a B-roll cue is useful.

Invalid or failed generation creates no partial Content. The creator receives
safe feedback and may use supported retry or Generate Another behavior. AI
output remains a Draft for creator review, not publication-ready output.

## Structured Content and directions

Content has one mutable working Draft. The current product document is
`ContentDocumentV4`: ordered stable paragraph Script blocks with owned,
block-local Production Directions. Creators can write, split, merge, reorder,
add, and remove blocks while retaining directions that describe those blocks.

The editor is Script-first and reports save, failure, and conflict states. A
conflict preserves unsaved work and offers intentional recovery; it never
silently overwrites another edit. Historical V1, V2, and V3 artifacts remain
readable without being rewritten.

Performance Directions are `PAUSE`, `EMPHASIS`, `DELIVERY`, `GESTURE`,
`POSITION`, `GAZE`, and `PERFORMANCE_NOTE`.

Edit Directions are `TEXT_OVERLAY`, `ZOOM`, `CUT`, `BROLL_CUE`, `SOUND_CUE`,
`CAPTION_EMPHASIS`, and `EDIT_NOTE`.

The product does not add range anchors, timeline tracks, generic direction
types, or a second direction-generation operation.

## B-roll search queries and Asset attachment

A B-roll cue has a human-facing description and may have `searchQuery`. The
fields are distinct; editing one never silently changes the other. A query is
canonical Content data and participates in Draft editing, acceptance, and
Version history.

For AI-generated B-roll, the description follows requested Content language and
the query is a concise English search phrase. A query is not a URL, provider
result identity, or media location. Creators may edit or remove it. Copying it
is presentation-only and does not save Content or create a Version.

Creators can attach eligible managed Assets: B-roll uses image/video and sound
cues use audio. AI never creates an Asset attachment or selects media.

Automatic Media Discovery is deferred. The product does not search media
providers, show results, import media automatically, track licensing
provenance, or attach media from a query.

## Acceptance and Version history

Accepting the current persisted Draft creates an immutable approved Version. The
current accepted Version is the artifact future recording and publishing use.
Creators may continue editing Draft without changing that Version.

Version History is read-only and distinguishes generated, migration-preserved,
and creator-accepted artifacts. V1 does not restore, edit, delete, branch,
diff, or manually snapshot history. The product derives whether a Draft is
accepted or has unaccepted changes, and prevents unsafe acceptance.

## Teleprompter / Recording Mode

Teleprompter is implemented. It reads the current immutable accepted Version,
never mutable Draft, and presents Script blocks plus Performance Directions as a
read-only prompting surface.

It supports accessible auto-scroll, playback/restart, speed and text size,
progress, hint visibility, mirror, fullscreen where available, Wake Lock where
available, keyboard access, and English/Persian use. Edit Directions are not
spoken Script content.

It creates no `RecordingSession` and persists no recording, playback, scroll,
mirror, speed, text-size, or countdown state.

## Assets

Assets are reusable Workspace-owned managed media for production. The product
supports image, video, and audio from direct upload or controlled external HTTPS
ingestion.

Assets visibly progress through `PENDING`, `PROCESSING`, `READY`, `FAILED`, and
`DELETING`. Only ready media can be attached, previewed, or downloaded. The
Workspace Asset Library lets creators find and manage available media.

Assets referenced by a Draft or immutable Version are protected from unsafe
deletion. V1 Assets are not a general document store: folders, tags, public
permanent URLs, transformation, deduplication, quotas, AI-generated media, and
automatic discovery are excluded.

## Future Publishing

Publishing is a future V1 capability. It will connect an immutable accepted
Content Version to a creator's external publication workflow while preserving
the distinction between a publication plan and an actual external publication.

Direct automatic publishing is not current product behavior. Future work must
resolve publication intent, platform capability, and connection experience
without changing historical Content or accepted Versions.

## Future Social Connections and Analytics

Social Connections are future work, separate from Better Content sign-in. They
may authorize supported external accounts for future publication context or
analytics.

Analytics are future V1 work. They will belong to external Publications rather
than generic Content, preserve historical snapshots, and show only supported
metrics. Initial platform, permissions, refresh behavior, and exact metrics
remain deliberately unresolved until their future work is approved.

## V1 scope and exclusions

V1 currently delivers the creator workflow through Assets and Teleprompter. It
does not yet deliver Publishing, Social Connections, or Analytics.

The following remain excluded unless a later approved decision adds them:

- automatic social publishing or scheduling;
- automatic learning that modifies Content DNA;
- full video editing, timelines, rendering, or transcoding;
- automatic media discovery, provider search, or stock-media import;
- generic collaboration, teams, campaigns, and multi-workspace administration;
- advanced experiments, A/B testing, and campaign planning; and
- user-selectable AI models, provider routing, and autonomous content actions.

## Future direction and product success

Possible future work includes Publishing, Social Connections, Analytics,
creator-specific performance insights, suggested DNA improvements, skills,
creator memory, experiments, scheduling, brand profiles, reference libraries,
collaboration, campaigns, and advanced production timelines. These are not
current requirements and do not authorize implementation work.

The product thesis is proven when a creator can build usable DNA, generate and
decide among Ideas, turn an accepted Idea into structured editable Content,
accept an immutable Version, attach needed managed media, and use that Version
while recording—without losing lineage or creator control.
