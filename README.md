# Architecture Decision Records

This directory contains architectural decisions for Better Content.

## Status meanings

- **Proposed** — under review.
- **Accepted** — current architectural rule.
- **Superseded** — replaced by a newer ADR.
- **Rejected** — considered but not adopted.

## ADR index

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | Use a modular monolith | Accepted |
| ADR-002 | Separate authentication from workspace ownership | Accepted |
| ADR-003 | Mutable working state + immutable versions | Accepted |
| ADR-004 | Versioned JSONB structured content | Accepted |
| ADR-005 | Derive USED and PUBLISHED states | Accepted |
| ADR-006 | Separate publication plans and publications | Accepted |
| ADR-007 | Capability-aware social provider adapters | Accepted |
| ADR-008 | Encrypt social credentials | Accepted |
| ADR-009 | PostgreSQL-backed background jobs | Accepted |
| ADR-010 | English/Persian i18n and RTL/LTR from Phase 1 | Accepted |
| ADR-011 | Provider-neutral AI boundary | Accepted |
| ADR-012 | Reviewed Drizzle migrations | Accepted |

## Rule

Accepted ADRs are part of the project's source of truth.

Significant implementation changes that conflict with an accepted ADR must not be made silently. The architectural issue should be raised and a new/superseding ADR should be approved before implementation.
