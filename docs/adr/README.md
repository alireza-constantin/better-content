# Architectural Decision Records

ADRs record accepted, durable architectural decisions. Read only the ADRs
named by the current ticket or directly relevant to the work; this index does
not replace their contents.

| ADR | Status | Area | Read when |
| --- | --- | --- | --- |
| [001 — Modular Monolith](ADR-001-modular-monolith.md) | Accepted | System topology | Changing application/service boundaries or infrastructure topology. |
| [002 — Authentication and Workspaces](ADR-002-authentication-and-workspaces.md) | Accepted | Auth and tenancy | Implementing private access, workspace ownership, or membership. |
| [003 — Versioning Strategy](ADR-003-versioning-strategy.md) | Accepted | Historical data | Changing mutable drafts, immutable versions, or version lineage. |
| [004 — Structured Content Storage](ADR-004-structured-content-storage.md) | Accepted | Content documents | Changing document schemas, directions, or Content JSONB storage. |
| [005 — Derived Workflow States](ADR-005-derived-workflow-states.md) | Accepted | Idea and Content state | Adding or changing `USED` or `PUBLISHED` behavior. |
| [006 — Publication Model](ADR-006-publication-model.md) | Accepted | Publishing | Designing publication plans, publications, or analytics ownership. |
| [007 — Social Provider Adapters](ADR-007-social-provider-adapters.md) | Accepted | Social integrations | Adding a social platform or provider capability. |
| [008 — Social Credential Encryption](ADR-008-social-credential-encryption.md) | Accepted | Credential security | Handling social-provider credentials or encryption. |
| [009 — PostgreSQL Background Jobs](ADR-009-postgresql-background-jobs.md) | Accepted | Jobs | Adding or changing asynchronous/background work. |
| [010 — Internationalization](ADR-010-internationalization.md) | Accepted | Localization | Changing UI locale, RTL/LTR, or content-language behavior. |
| [011 — AI Provider Boundary](ADR-011-ai-provider-boundary.md) | Accepted | AI architecture | Adding or changing an AI workflow/provider boundary. |
| [012 — Drizzle Migrations](ADR-012-drizzle-migrations.md) | Accepted | Database changes | Creating or reviewing a production schema migration. |
| [013 — Content DNA Version Storage](ADR-013-content-dna-version-storage.md) | Accepted | Content DNA | Changing DNA payloads, versions, or current-version lineage. |
| [014 — Idea Generation Policy](ADR-014-initial-ai-provider-and-model-for-idea-generation.md) | Partially superseded | Phase 3 AI | Changing surviving idea-generation policy: output, validation, privacy, timeout, retry, usage, or errors. ADR-015 supersedes only provider, endpoint, and model selection. |
| [015 — AvalAI Provider](ADR-015-avalai-initial-ai-provider.md) | Accepted; partial supersession of ADR-014 | Phase 3 AI | Changing the selected direct provider, endpoint, or model for idea generation. |
| [016 — Content Script AI Policy](ADR-016-content-script-generation-ai-policy.md) | Accepted, amended | Content-generation AI | Changing generation policy, model settings, output contract, or the V4 directions cutover. |
| [017 — Production Queue Ordering](ADR-017-production-queue-ordering.md) | Accepted | Ideas and queue | Changing derived queue membership or queue ordering. |
| [018 — Assets and Content Lineage](ADR-018-workspace-assets-lifecycle-and-content-lineage.md) | Accepted | Assets | Changing Asset lifecycle, content references, or deletion eligibility. |
| [019 — Private Managed Media](ADR-019-private-managed-media-storage-ingestion-and-access.md) | Accepted | Asset storage | Changing private media ingestion, storage, access, or validation. |

ADR-014 remains accepted for the policy outside its explicitly superseded
provider-selection portion. ADR-015 does not supersede its validation, privacy,
timeout, retry, usage, or error rules.
