# Better Content — Phase 01: Foundation

**Status:** Ready for implementation
**Phase:** 01
**Date:** 2026-08-24
**Owner:** Product Architect / Technical Lead

---

# 1. Objective

Establish the production-quality technical foundation on which all Better Content features will be built.

At the end of Phase 1, the repository must contain a functioning Next.js application with:

* TypeScript
* PostgreSQL
* Drizzle ORM
* Better Auth
* Better Content workspace ownership
* English and Persian localization
* LTR and RTL application behavior
* shadcn/ui foundation
* environment validation
* structured logging foundation
* testing foundation
* database migrations
* CI

The phase intentionally contains **no product-domain features beyond authentication and workspace ownership**.

---

# 2. Source of Truth

Before implementation, read:

```text
AGENTS.md
docs/PRD.md
docs/ARCHITECTURE.md

docs/adr/ADR-001-modular-monolith.md
docs/adr/ADR-002-authentication-and-workspaces.md
docs/adr/ADR-010-internationalization.md
docs/adr/ADR-012-drizzle-migrations.md
```

If this phase specification conflicts with an Accepted ADR or Architecture document, stop the conflicting implementation and report the conflict.

Do not silently reinterpret architecture.

---

# 3. Relevant Architecture

Phase 1 must preserve these established decisions.

## Modular monolith

One Next.js application.

Do not introduce:

* microservices
* separate backend
* Redis
* Kafka
* external job infrastructure
* separate auth service

## Authentication

Better Auth owns:

* user identity
* sessions
* authentication accounts
* authentication verification records

Better Content owns:

* workspaces
* workspace membership
* product authorization

## Internationalization

V1 interface languages:

```text
en
fa
```

English:

```text
LTR
```

Persian:

```text
RTL
```

UI locale and future creator-content language are separate concepts.

## Database

PostgreSQL is the system of record.

Drizzle migrations are the only approved production migration mechanism.

---

# 4. Phase-Level Technical Decisions

The following decisions apply to Phase 1 and do not require additional ADRs.

## Package manager

Use:

```text
npm
```

Commit:

```text
package-lock.json
```

Do not introduce pnpm, Yarn, or Bun.

---

## Node.js

Target:

```text
Node.js 24 LTS
```

Do not target Node.js Current.

Add the appropriate repository version declaration such as:

```text
.nvmrc
```

and an appropriate `engines.node` entry in `package.json`.

---

## Next.js

Use a current patched stable:

```text
Next.js 16.x
```

Target the current stable 16.3 line available when implementation begins.

Do not use:

* canary
* beta
* RC
* experimental framework releases

unless an explicitly required stable API says otherwise.

---

## PostgreSQL

Develop against a supported PostgreSQL version.

CI should use:

```text
PostgreSQL 18
```

The application itself must depend on standard PostgreSQL behavior rather than PostgreSQL-18-specific features without justification.

---

## Authentication method

Phase 1 implements:

```text
Email + Password
```

Required capabilities:

* sign up
* sign in
* sign out
* persistent authenticated session

Phase 1 does **not** implement:

* Google sign-in
* Apple sign-in
* social login
* magic links
* passkeys
* two-factor authentication
* mandatory email verification
* password reset email flow

These can be added later if approved.

Social-account analytics connections are completely separate and belong to Phase 8.

---

# 5. Implementation Skills

When executing this phase with an agent environment that has these skills installed, use:

## `vercel-react-best-practices`

Use during Next.js and React implementation.

Focus especially on:

* Server Component boundaries
* avoiding unnecessary client components
* avoiding request waterfalls
* bundle discipline
* correct server/client data flow

## `frontend-design`

Use for:

* authentication screens
* application shell
* dashboard foundation
* locale switcher

The goal is a clean, intentional foundation.

Do **not** invent a large visual brand system that has not been approved.

## `web-design-guidelines`

Use during final UI review for:

* accessibility
* form behavior
* keyboard interaction
* responsive layout
* focus states
* RTL behavior

## `security-guidance`

Use for final review of:

* Better Auth integration
* protected routes
* workspace authorization
* environment secrets
* session handling

External skills are implementation aids only.

They may not override:

```text
PRD
Architecture
Accepted ADRs
Phase Specification
```

---

# 6. Explicitly Out of Scope

Codex must **not** implement any of the following in Phase 1.

## No Content DNA

Do not create:

* DNA tables
* DNA UI
* DNA forms

That belongs to Phase 2.

## No AI

Do not install or configure:

* OpenAI
* Anthropic
* Gemini
* AI SDKs
* prompt infrastructure
* AI routes

That belongs to Phase 3.

## No Ideas

Do not create:

* idea tables
* idea generation
* idea UI
* idea statuses

That belongs to Phase 3.

## No Content

Do not create:

* content tables
* content drafts
* content versions
* Script
* Performance Direction
* Edit Direction
* editors

Those belong to later phases.

## No Publishing

Do not create publication plans or publications.

## No Social APIs

Do not connect:

* Instagram
* TikTok
* YouTube
* Meta APIs
* OAuth analytics providers

## No Analytics

Do not create analytics tables or dashboards.

## No Background Job Queue

ADR-009 establishes the future job architecture, but the queue is not required yet.

Do not implement it in Phase 1.

## No Assets

No upload/storage implementation.

## No Team Features

Do not implement:

* workspace invitations
* multiple workspace switching
* team roles
* organization management

---

# 7. Repository Bootstrap

The repository already contains project documentation.

The existing repository must be preserved.

Do not create:

```text
better-content/better-content/
```

or another nested application folder.

The Next.js application belongs at repository root.

If the standard scaffold refuses to initialize inside a non-empty repository:

1. create the scaffold in a temporary directory,
2. copy only the required application scaffold into the existing repository root,
3. preserve:

   * `.git`
   * `docs/`
   * `AGENTS.md`
   * existing repository files,
4. delete the temporary scaffold.

Do not overwrite existing documentation.

---

# 8. Base Next.js Configuration

Use:

* App Router
* TypeScript
* `src/` directory
* ESLint
* Tailwind CSS
* path alias:

```text
@/*
```

Do not use the Pages Router.

Do not introduce a second API application.

---

# 9. Initial Application Structure

Target approximately:

```text
src/
├── app/
│   ├── api/
│   │   └── auth/
│   │       └── [...all]/
│   │           └── route.ts
│   │
│   └── [locale]/
│       ├── layout.tsx
│       │
│       ├── (auth)/
│       │   ├── sign-in/
│       │   │   └── page.tsx
│       │   └── sign-up/
│       │       └── page.tsx
│       │
│       └── (app)/
│           ├── layout.tsx
│           └── dashboard/
│               └── page.tsx
│
├── components/
│   ├── ui/
│   └── shell/
│
├── db/
│   ├── schema/
│   │   ├── auth.ts
│   │   ├── workspace.ts
│   │   └── index.ts
│   └── index.ts
│
├── i18n/
│   ├── navigation.ts
│   ├── request.ts
│   └── routing.ts
│
├── lib/
│   ├── auth/
│   │   ├── server.ts
│   │   └── client.ts
│   ├── env/
│   ├── errors/
│   └── logging/
│
├── modules/
│   └── workspace/
│       ├── application/
│       ├── data/
│       └── domain/
│
└── proxy.ts
```

This is guidance, not permission to create empty directories for future domains.

Do not create placeholder implementations for later modules.

---

# 10. shadcn/ui

Initialize shadcn/ui for the existing Next.js application.

Use only components needed for Phase 1.

Likely examples:

* Button
* Input
* Label
* Card
* Dropdown Menu where actually needed

Do not install the entire shadcn component catalogue.

Do not build a custom design system beyond what Phase 1 requires.

---

# 11. Environment Configuration

Create:

```text
.env.example
```

Never commit real secrets.

Required Phase 1 environment values should include concepts such as:

```text
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
```

Add additional environment values only if implementation actually needs them.

Create a server-side environment validation module using Zod.

The application should fail clearly when required server configuration is missing.

Do not expose server secrets through:

```text
NEXT_PUBLIC_*
```

variables.

---

# 12. Database Foundation

Use:

```text
PostgreSQL
Drizzle ORM
```

Use a normal Node.js PostgreSQL driver compatible with the chosen Drizzle adapter.

Database initialization should be centralized.

Do not open database connections from React components.

---

# 13. Drizzle Configuration

Create:

```text
drizzle.config.ts
```

Schema should be loaded from the application's database schema directory.

Migration output should use the repository's migration directory.

Recommended:

```text
drizzle/
```

Add scripts conceptually equivalent to:

```text
db:generate
db:migrate
```

Do **not** make `drizzle push` the normal migration workflow.

---

# 14. Initial Database Schema

Phase 1 database includes only:

## Better Auth tables

Whatever tables are required by the approved Better Auth configuration.

Use Better Auth's generated/expected Drizzle schema rather than manually approximating its schema.

## Better Content workspace tables

```text
workspaces
workspace_members
```

No other domain tables.

---

# 15. Workspace Table

The exact Drizzle syntax may be proposed by Codex, but the domain should contain approximately:

```text
workspaces
├── id
├── name
├── created_at
└── updated_at
```

Workspace ID:

```text
UUID
```

---

# 16. Workspace Membership

Conceptually:

```text
workspace_members
├── workspace_id
├── user_id
├── role
└── created_at
```

Phase 1 only needs:

```text
role = owner
```

Do not build a generalized role/permission engine.

The Better Auth user ID and workspace membership must have a database foreign-key relationship where practical with the generated auth schema.

Prevent duplicate memberships.

---

# 17. V1 Single-Workspace Invariant

V1 exposes exactly one personal/default workspace per user.

Phase 1 may enforce a simple single-workspace-per-user invariant in the membership schema if needed for race-safe/idempotent provisioning.

The important architectural requirement is that ownership still passes through:

```text
User
 ↓
Workspace Membership
 ↓
Workspace
```

rather than putting `user_id` directly onto all future product tables.

Future multi-workspace collaboration can relax the V1 uniqueness constraint without changing the ownership model.

---

# 18. Default Workspace Provisioning

Create one application service responsible for obtaining the user's personal workspace.

Conceptually:

```text
getOrCreateDefaultWorkspace(userId)
```

Requirements:

* idempotent,
* safe against repeated calls,
* safe against ordinary concurrent requests,
* creates workspace + owner membership transactionally,
* returns an existing workspace when one already exists.

Do not scatter automatic workspace creation across UI components.

---

# 19. Workspace Creation Timing

Do not depend exclusively on a fragile asynchronous auth side effect.

After authentication, entry to the protected application should call the workspace application service and guarantee that the authenticated user has their default workspace.

A Better Auth lifecycle hook may assist if useful, but the system must remain repairable/idempotent if workspace provisioning did not previously complete.

This avoids an authenticated user becoming permanently unusable because one post-signup side effect failed.

---

# 20. Better Auth Configuration

Configure Better Auth using the stable Drizzle/PostgreSQL adapter.

Enable:

```text
emailAndPassword
```

for Phase 1.

Expose the standard Next.js auth route:

```text
/api/auth/[...all]
```

Create:

* server auth instance,
* React auth client.

Do not enable unnecessary plugins.

---

# 21. Session Validation

Protected application pages must perform real server-side session validation.

Do not treat client state as authorization.

Do not rely only on the existence of a session cookie for protected data access.

The protected `(app)` layout should obtain the authenticated session on the server.

Unauthenticated users should be redirected to the locale-appropriate sign-in page.

---

# 22. Proxy Responsibility

`src/proxy.ts` is primarily responsible for locale routing.

Do not put core application authorization into the locale proxy.

Authorization belongs in server-side application/layout/service boundaries.

This avoids combining routing behavior with domain authorization.

---

# 23. Authentication Screens

Implement:

```text
/[locale]/sign-up
/[locale]/sign-in
```

## Sign up

Fields:

* name
* email
* password

Successful signup should result in an authenticated user flow and then enter the protected application.

## Sign in

Fields:

* email
* password

## Sign out

Available from the authenticated application shell.

Do not expose raw Better Auth/internal database errors directly to the user.

---

# 24. Authentication UX

Forms must provide:

* accessible labels,
* validation feedback,
* disabled/submitting state,
* useful authentication error state,
* keyboard accessibility,
* responsive layout,
* correct RTL behavior.

Do not create:

* OAuth buttons,
* forgot-password UI,
* fake provider options.

---

# 25. Internationalization Setup

Use:

```text
next-intl
```

Set up:

```text
src/i18n/routing.ts
src/i18n/request.ts
src/i18n/navigation.ts
src/proxy.ts
```

Supported locales:

```text
en
fa
```

Default locale:

```text
en
```

Use locale-prefixed routing.

Examples:

```text
/en/sign-in
/fa/sign-in

/en/dashboard
/fa/dashboard
```

---

# 26. Translation Messages

Create translation message files for both locales.

For example:

```text
messages/
├── en.json
└── fa.json
```

Do not hard-code visible application strings when they should be localized.

At minimum translate all visible Phase 1 UI.

---

# 27. Direction

For English:

```html
lang="en"
dir="ltr"
```

For Persian:

```html
lang="fa"
dir="rtl"
```

Set this at the correct layout/document boundary.

The application must visibly switch layout direction when locale changes.

---

# 28. RTL Implementation

Avoid hardcoded layout assumptions such as:

```text
margin-left
text-left
left icon position
```

when logical equivalents are appropriate.

Use direction-aware/logical behavior.

Navigation icons that imply physical direction should be reviewed in RTL.

Do not manually reverse Persian strings.

---

# 29. Locale Switcher

Provide a minimal locale switcher for:

```text
English
فارسی
```

Changing locale should preserve the current logical route when feasible.

For example:

```text
/en/dashboard
```

becomes:

```text
/fa/dashboard
```

The switch must not sign the user out.

---

# 30. Authenticated Application Shell

Create a minimal responsive authenticated application shell.

Required:

* Better Content product name
* current user
* sign-out action
* locale switcher
* Dashboard navigation
* workspace context where useful

Do not create fake navigation pages for future features.

Do not show fake:

* analytics,
* posts,
* ideas,
* metrics,
* charts.

---

# 31. Dashboard

Phase 1 dashboard is intentionally minimal.

It should prove:

* authentication works,
* workspace provisioning works,
* localized UI works,
* RTL/LTR works,
* protected routing works.

It may display:

* localized welcome message,
* user name,
* workspace name.

Do not implement actual product dashboard metrics yet.

---

# 32. Visual Scope

The UI should look intentional and production-quality but restrained.

Do not invent:

* complex branding
* analytics cards
* fake sample content
* elaborate animations
* a marketing website
* theme systems that have not been requested

The goal is:

> a strong application foundation, not a finished product design.

---

# 33. Logging Foundation

Create a small centralized server logging abstraction.

Do not add a logging SaaS provider in Phase 1.

Structured logs should support useful context such as:

```text
requestId
userId
workspaceId
module
operation
errorCode
```

Never log:

* passwords
* session tokens
* auth headers
* database passwords
* Better Auth secrets

---

# 34. Error Foundation

Create a small stable application-error abstraction.

Initial categories may include:

```text
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
CONFLICT
INTERNAL_ERROR
```

Do not build an enormous error framework.

Errors shown to users should be localizable.

---

# 35. Security Requirements

Phase 1 must specifically verify:

## Authentication

* sessions validated server-side,
* auth secret remains server-side,
* no credential leakage.

## Authorization

* workspace access requires authenticated membership,
* arbitrary workspace IDs cannot expose another user's workspace.

## Inputs

* sign-up/sign-in inputs validated,
* server-side validation remains authoritative.

## Logging

* sensitive auth fields are never logged.

## Environment

* `.env` files with real secrets remain ignored.

---

# 36. Testing Foundation

Use:

```text
Vitest
Playwright
```

Normal automated testing must not rely on external services other than the test PostgreSQL database.

---

# 37. Unit Tests

At minimum test useful deterministic foundation behavior such as:

* locale validation,
* direction selection (`en` → LTR, `fa` → RTL),
* environment schema behavior where reasonably testable,
* application error helpers.

Do not write meaningless tests solely to increase test count.

---

# 38. Integration Tests

Integration tests must use PostgreSQL.

At minimum cover:

## Workspace provisioning

* first request creates a workspace,
* first request creates owner membership,
* repeated provisioning returns the existing workspace,
* repeated provisioning does not create duplicate membership/workspaces.

## Workspace authorization

* member can access their workspace,
* unrelated user cannot access another user's workspace.

## Migration/schema health

The migrated database is usable by the application.

---

# 39. E2E Tests

Phase 1 should include critical Playwright coverage for the foundation.

At minimum:

### Authentication flow

```text
Sign up
 ↓
Authenticated
 ↓
Dashboard
 ↓
Sign out
 ↓
Protected dashboard unavailable
```

### Locale behavior

Verify:

```text
/en/
```

uses LTR.

Verify:

```text
/fa/
```

uses RTL.

### Protected route

Unauthenticated access to the dashboard redirects to sign-in.

---

# 40. Test Isolation

Tests must not depend on production data.

Use dedicated test database configuration.

Do not allow automated tests to accidentally run destructive cleanup against a production database.

---

# 41. npm Scripts

Provide clear scripts including equivalents of:

```text
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:e2e
npm run db:generate
npm run db:migrate
```

Additional scripts may be added only where they solve a concrete Phase 1 need.

---

# 42. CI

Create GitHub Actions CI.

CI should use:

```text
Node.js 24
PostgreSQL 18
```

CI must install dependencies reproducibly using:

```text
npm ci
```

CI should run, in an appropriate order:

```text
database migration
lint
typecheck
tests
build
```

Run Phase 1 E2E tests as part of CI if they can be made reliable within this phase.

A pull request should not be considered healthy while required CI checks fail.

---

# 43. CI Security

Do not place real production secrets into CI files.

Use safe test-only values for:

* Better Auth secret,
* database credentials,
* application URL.

Do not call real external APIs.

---

# 44. README

Update the root README with development setup.

At minimum explain:

* required Node version,
* install command,
* required PostgreSQL database,
* `.env` setup,
* migration command,
* development command,
* test commands.

Do not replace the PRD or Architecture with README content.

README is developer onboarding, not product source of truth.

---

# 45. Migration Deliverable

Phase 1 must include an initial reviewed Drizzle migration containing:

* Better Auth schema,
* workspaces,
* workspace_members,
* required keys/indexes/constraints.

Do not leave Phase 1 with schema definitions but no migration.

---

# 46. Database Constraints

Use database constraints for important Phase 1 invariants where practical.

Examples:

* primary keys,
* foreign keys,
* unique email behavior required by Better Auth,
* no duplicate workspace membership,
* V1 single-default-workspace invariant if implemented through uniqueness.

Do not rely solely on frontend checks.

---

# 47. No Seeded Product Data

Do not seed:

* fake posts
* fake analytics
* fake ideas
* fake Content DNA

Tests may create isolated test fixtures.

Production/development migrations should not insert fake application content.

---

# 48. Accessibility

Phase 1 UI must support:

* keyboard form navigation,
* visible focus states,
* associated form labels,
* semantic buttons/links,
* useful validation messages,
* reasonable color contrast,
* RTL keyboard/visual behavior.

---

# 49. Responsive Requirements

Authentication screens and authenticated shell must work at:

* mobile width,
* tablet width,
* desktop width.

Do not optimize only for desktop.

---

# 50. Performance Rules

Prefer Server Components by default.

Use Client Components only when required for:

* form interaction,
* auth client interaction,
* locale interaction,
* genuinely client-side state.

Do not mark large application trees `"use client"` unnecessarily.

Avoid sequential server fetches where parallel work is straightforward.

Do not add caching infrastructure in this phase.

---

# 51. Expected Files

The exact implementation may vary, but Phase 1 should reasonably result in files such as:

```text
package.json
package-lock.json
.nvmrc
.env.example
drizzle.config.ts

src/proxy.ts

src/app/api/auth/[...all]/route.ts
src/app/[locale]/layout.tsx
src/app/[locale]/(auth)/sign-in/page.tsx
src/app/[locale]/(auth)/sign-up/page.tsx
src/app/[locale]/(app)/layout.tsx
src/app/[locale]/(app)/dashboard/page.tsx

src/db/index.ts
src/db/schema/auth.ts
src/db/schema/workspace.ts
src/db/schema/index.ts

src/lib/auth/server.ts
src/lib/auth/client.ts
src/lib/env/...
src/lib/logging/...
src/lib/errors/...

src/i18n/routing.ts
src/i18n/request.ts
src/i18n/navigation.ts

src/modules/workspace/...

messages/en.json
messages/fa.json

drizzle/...

vitest.config.*
playwright.config.*

.github/workflows/ci.yml
```

Do not create empty future-domain files just to match Architecture examples.

---

# 52. Acceptance Criteria

Phase 1 is complete only when **all** of the following are true.

## Project

* [ ] Next.js application runs from repository root.
* [ ] Existing documentation remains intact.
* [ ] TypeScript is enabled.
* [ ] npm/package-lock is used.
* [ ] Node 24 is declared as the development target.

## Database

* [ ] PostgreSQL connection is centralized.
* [ ] Drizzle is configured.
* [ ] Initial migration exists.
* [ ] Migration applies cleanly to an empty PostgreSQL database.
* [ ] No `db push` dependency exists in the production workflow.

## Authentication

* [ ] User can sign up with name/email/password.
* [ ] User can sign in.
* [ ] User can sign out.
* [ ] Session persists correctly.
* [ ] Authenticated pages validate session server-side.
* [ ] Unauthenticated users cannot access protected application pages.

## Workspace

* [ ] Authenticated user receives exactly one V1 personal/default workspace.
* [ ] Owner membership exists.
* [ ] Provisioning is idempotent.
* [ ] Repeated provisioning does not create duplicates.
* [ ] Workspace access checks membership.
* [ ] One user cannot access another user's workspace.

## Internationalization

* [ ] English UI works.
* [ ] Persian UI works.
* [ ] `/en/...` routing works.
* [ ] `/fa/...` routing works.
* [ ] English uses LTR.
* [ ] Persian uses RTL.
* [ ] All visible Phase 1 UI is localized.
* [ ] Locale switcher works without ending the session.

## UI

* [ ] Sign-up screen is responsive.
* [ ] Sign-in screen is responsive.
* [ ] Dashboard shell is responsive.
* [ ] No fake future product features are present.
* [ ] Basic accessibility review passes.

## Security

* [ ] Secrets are not committed.
* [ ] Server-only values are not exposed through public env variables.
* [ ] Workspace authorization is server-side.
* [ ] Sensitive auth information is not logged.
* [ ] Security review of Phase 1 auth/workspace implementation is complete.

## Quality

* [ ] `npm run lint` passes.
* [ ] `npm run typecheck` passes.
* [ ] `npm run test` passes.
* [ ] `npm run build` passes.
* [ ] Required Playwright tests pass.
* [ ] `git diff --check` passes.

## CI

* [ ] GitHub Actions CI exists.
* [ ] CI uses Node 24.
* [ ] CI has PostgreSQL available.
* [ ] CI installs with `npm ci`.
* [ ] CI runs required quality checks successfully.

---

# 53. Required Agent Verification

Before reporting completion, Codex must run:

```text
git status
git diff --check
```

and the project's actual scripts for:

```text
lint
typecheck
test
build
```

plus Phase 1 E2E tests.

Review:

```text
git diff
```

for accidental unrelated changes.

---

# 54. Completion Report

Codex must report:

## Implemented

Summary of completed Phase 1 functionality.

## Files Changed

Important new/modified files.

## Dependencies Added

Each new runtime/dev dependency and why it exists.

## Database

* tables created,
* constraints,
* migration files,
* migration result.

## Authentication

* enabled auth method,
* protected-route strategy,
* workspace provisioning strategy.

## Internationalization

* locales,
* routing,
* RTL implementation.

## Tests

* tests added,
* commands executed,
* results.

## CI

CI workflow and results where locally verifiable.

## Skills Used

Which requested phase skills were available/used.

## Deviations

Any requirement not implemented exactly.

## Risks / Follow-ups

Issues intentionally deferred to future phases.

---

# 55. Git Rule

Do not commit Phase 1 changes unless explicitly instructed.

Do not modify unrelated existing working-tree changes.

Do not use destructive Git commands.

---

# 56. Definition of Done

Phase 1 is done when Better Content has a stable, localized, secure application foundation where a user can:

```text
Visit app
   ↓
Choose English or Persian
   ↓
Create account / Sign in
   ↓
Receive default workspace
   ↓
Enter protected dashboard
   ↓
Switch EN ↔ FA
   ↓
Sign out
```

with:

```text
Next.js
+
PostgreSQL
+
Drizzle
+
Better Auth
+
shadcn/ui
+
next-intl
+
Tests
+
CI
```

working together cleanly.

Nothing from Phase 2 or later should be implemented.
