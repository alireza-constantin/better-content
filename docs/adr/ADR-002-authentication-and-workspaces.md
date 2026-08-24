# ADR-002: Separate Authentication From Product Workspace Ownership

- **Status:** Accepted
- **Date:** 2026-08-24
- **Decision owners:** Product Architect / Technical Lead

## Context

Better Content V1 is primarily a single-creator product, but the architecture should not prevent future teams, editors, agencies, or multi-brand use.

Better Auth handles identity and sessions, while Better Content needs a stable product-domain ownership boundary for ideas, content, publications, analytics, and integrations.

Coupling the entire product-domain ownership model directly to an authentication provider's organization feature would make future authorization changes harder and introduce team functionality before V1 needs it.

## Decision

Use **Better Auth** for authentication and session management.

Better Content will own its own lightweight workspace model:

- `workspaces`
- `workspace_members`

Every product-domain record that requires ownership will belong to a workspace directly or through an owning aggregate.

On first-time product setup, a user receives a default workspace and an owner membership.

V1 does not implement invitations, complex roles, or team administration.

## Authorization rule

Every private operation must verify both:

1. the authenticated user, and
2. membership in the workspace that owns the requested resource.

Client-provided entity IDs are never sufficient proof of access.

## Consequences

### Positive

- Authentication and product tenancy remain decoupled.
- Future team features can evolve without redesigning all product tables.
- Authorization remains explicit.
- V1 avoids unnecessary organization-management UX.

### Negative

- We maintain a small amount of workspace/membership logic ourselves.
- If Better Auth organization features are adopted later, integration work may be required.

## Rejected alternatives

### User ID directly on every product table

Rejected because it makes future workspace/team support expensive and leaks authentication identity into every domain.

### Better Auth organization plugin in V1

Rejected because V1 does not need organization management.

## Constraints

Adopting Better Auth organizations or another tenancy model later requires a new ADR.
