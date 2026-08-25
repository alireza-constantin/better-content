# 06: Harden Phase 1 quality and cross-cutting behavior

**What to build:** A phase-wide confidence pass proving the completed foundation is secure, accessible, responsive, correctly isolated in testing, and reliable across the critical authenticated English/Persian workflow.

**Blocked by:** 05: Provision the default workspace and protect the dashboard.

**Status:** ready-for-agent

## Phase references

Phase 1 §§35–40, 48–50, 52–53.

## Implementation skills

- `web-design-guidelines` for the final accessibility, responsive, form, focus, and RTL UI review.
- `security-best-practices` as the available closest review aid for the Phase 1 security review.

## Acceptance criteria

- [ ] Critical Playwright coverage proves sign-up, authenticated dashboard entry, sign-out, subsequent protected-dashboard denial, and locale behavior.
- [ ] Cross-cutting authorization/security verification confirms server-side sessions and membership checks, server-only secrets, validated inputs, and non-sensitive logging.
- [ ] Accessibility, responsive, and RTL/LTR reviews cover authentication screens and the authenticated shell.
- [ ] Test isolation is verified so automation uses a dedicated test database and cannot destructively clean production data.
- [ ] Existing ticket-level tests remain passing; this ticket adds only cross-cutting hardening coverage rather than deferring foundational tests to the end.

## Verification

- Run the unit, integration, and Playwright suites against dedicated test configuration.
- Perform the documented accessibility, security, responsive, and RTL/LTR review.
- Review failures and close any Phase 1 acceptance gaps before handing off to CI work.
