# 05: Provision the default workspace and protect the dashboard

**What to build:** After authentication, each creator receives one idempotently provisioned personal workspace and can enter a localized, protected dashboard that shows their user and workspace context.

**Blocked by:** 04: Deliver localized email/password authentication.

**Status:** ready-for-agent

## Phase references

Phase 1 §§18–19, 21–22, 30–31, 35, 38–39, 48–50, 56.

## Implementation skills

- `vercel-react-best-practices` for server-side protected layout and data-flow boundaries.

## Acceptance criteria

- [ ] One workspace application service gets or creates the default workspace idempotently and transactionally, including the owner membership.
- [ ] Repeated or ordinary concurrent provisioning cannot create duplicate default workspaces or memberships.
- [ ] Protected application pages validate the session on the server and redirect unauthenticated users to the locale-appropriate sign-in page.
- [ ] Workspace access checks authenticated membership; client-provided workspace identifiers alone cannot authorize access.
- [ ] The minimal responsive authenticated shell includes Better Content identity, current user, workspace context where useful, dashboard navigation, locale switching, and sign-out.
- [ ] The dashboard proves authentication, workspace provisioning, localization, and direction behavior without showing fake future features or metrics.

## Verification

- Add and run PostgreSQL integration coverage for first and repeated provisioning, owner membership creation, and unrelated-user authorization denial.
- Add and run automated protected-route coverage for redirect behavior and authenticated dashboard access.
- Verify dashboard behavior in English/LTR and Persian/RTL, including locale switching without session loss.
