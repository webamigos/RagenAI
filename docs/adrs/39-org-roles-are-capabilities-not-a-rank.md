# ADR-39: Organization Roles Are Capabilities, Not a Rank

**Status:** Accepted and implemented — steps 1, 2 and 3, in the change that
carries this file. **No new role is introduced**, and none of the three steps
changes who can reach what: `canManageOrg` and `orgVisibilityScope` agree for
all three existing roles, exactly as the one boolean they replaced did.
**Date:** 2026-09-06

## Context

The product question was "can we add a *manager* — someone who leads a team and
sees more than an ordinary member?". Answering it required looking at what the
role system actually is, and the answer changed the question.

### There are two hierarchies, and the org one already has three rungs

| Level | Field | Values | Purpose |
|---|---|---|---|
| Platform | `User.role` | `admin` / `user` | operating the platform (`apps/admin`) |
| Organization | `Member.role` | `owner` / `admin` / `member` | permissions inside one tenant |

`admin`/`user` is not a customer-facing role. A manager would be a **fourth
organization role**, and `Member.role` is a plain `String` column
(`prisma/schema.prisma:548`), so adding one needs no migration.

### Most of what a manager needs already exists

Teams are not a stub. `Team` and `TeamMember` are real
(`prisma/schema.prisma:591`), Better Auth's `teams` plugin is enabled
(`apps/web/src/lib/auth.ts:218`), a team carries its own LiteLLM budget, rate
limits and allowed-model list, `DocumentPermission` and `ProjectPermission`
already accept `granteeType: 'team'`, folders and threads carry `teamId`, and
`getUserTeamIds()` / `requireTeamMember()` exist in `auth-guards.ts`.

The data model for "a manager has access to their team" is finished. What is
missing is a role whose *visibility* spans other people's rows inside that team.

### The obstacle is one boolean, not the number of call sites

The document predicate is otherwise exemplary — one definition, composed
everywhere, written that way after `/api/files/[fileId]` and its neighbours
disagreed with the listing and let any member read any file in their org by id
(`apps/web/src/features/documents/services/queries/document-access.ts`). But it
opens with:

```ts
if (actor.isOrgAdmin) {
  return {};   // everything in the organization
}
```

`isOrgAdmin` means two different things at once — **"may administer the
organization"** and **"may see every row in it"** — and they are fused into one
boolean. Every role added while they stay fused has to pick one of the two.

`hasOrgRole()` makes the same assumption structurally: it implements a linear
order, `owner > admin > member`. A manager does not fit on that line. They see
more data than a member and administer less than an admin. **The current model
is a rank; a manager is the first role that is a capability set.** That, not the
call-site count, is the cost.

For scale, though (occurrences outside tests and generated code, definitions and
re-exports included):

| Symbol | Occurrences | Files |
|---|---|---|
| `isOrgAdmin` | 138 | 51 |
| `requireOrgAdmin` | 56 | 18 |
| `isAppAdmin` | 38 | 16 |
| `requireAppAdmin` | 14 | 8 |
| `hasOrgRole` | 4 | 3 |
| `requireOrgOwner` | 2 | 2 |

74 files in total. Most `requireOrgAdmin` sites guard management actions a
manager must *not* reach, so they would not change. The sites that mean "sees
more" are the ones that would, and today they are indistinguishable from the
others because both are spelled `isOrgAdmin`.

### Where a fourth role would snag

| Place | Problem |
|---|---|
| `apps/web/src/app/[locale]/(panel)/organization/layout.tsx:27` | one `isOrgAdmin` gate over the entire section — all twelve pages or none |
| `.../organization/components/OrganizationNav.tsx` | a static list of twelve links with no per-item role |
| `apps/web/src/features/settings/registry.ts` | **the counter-example.** It already has a `SettingsRole` ladder (`'user' \| 'orgAdmin' \| 'orgOwner' \| 'appAdmin'`) and a `filterSettingsPages` that reads it. Adding a rung there is one union member. |
| `.../organization/profile/types.ts` | `z.enum(['admin', 'member'])`, three times |
| `InviteMemberDialog`, `MemberActionsDropdown`, two email templates | the role vocabulary is restated in the UI and in `role === 'admin' ? 'Administrator' : 'Członek'` |
| `apps/api/src/projects/projects.service.ts:102`, `apps/api/src/documents/folders.service.ts:48` | the check is **inlined** as `role === 'admin' \|\| role === 'owner'`, deliberately not imported from `apps/web`. A new role has to be remembered here, in a different application, by hand |
| `apps/web/src/lib/auth-guards.ts:101` | `requireOrgAdmin` records a `CROSS_ORG_ACCESS_ATTEMPTED` / `UNAUTHORIZED_ACCESS_ATTEMPTED` security event on failure. A manager browsing to a page they may not have would fill the org's own Incidents view with alerts about themselves — the exact failure `requireOrgAdminOrAppAdmin` was written to fix for platform admins |

Better Auth itself imposes no obstacle. In 1.7.2 the organization plugin
validates the role string on invite and on `addMember` and answers
`ROLE_NOT_FOUND` for anything not registered in `orgRoles`
(`auth-access-control.ts:26`), so a new role is one entry there. The plugin also
ships `dynamicAccessControl`, which stores per-organization roles in an
`organizationRole` table — available if an enterprise customer ever needs to
define their own.

## Decision

**Do not add a role. Separate the two meanings of `isOrgAdmin` first, and put
the role vocabulary where every application resolves it identically.** Three
steps, all of which are refactors with no behaviour change:

1. **Move the organization role vocabulary and its predicates into
   `packages/platform-contracts`.** ADR-33 already states the rule this
   satisfies: a value more than one application has to resolve identically is
   declared once, not copied. `OrgRole`, `ORG_ROLES`, the role constants,
   `hasOrgRole` and `isAppAdmin` qualify — three applications resolve them and
   two do it by inlining a string comparison. `apps/web/src/lib/
   auth-access-control.ts` re-exports them so its own call sites keep one
   import path; `apps/api`'s two inlined comparisons become imports.

   **What stays behind:** `orgAccessControl`, `orgRoles`, `platformAdminAc` and
   `platformRoles`. They are built from `better-auth/plugins/access`, and the
   package's own contract is that it takes no framework dependency. They also
   have exactly one consumer — the file that configures the auth server. The
   vocabulary is shared; the wiring is not. That split leaves a seam (the
   registry Better Auth validates invitations against, and the vocabulary
   everything else reasons about, are now two objects), so
   `apps/web/src/lib/__tests__/org-roles.test.ts` asserts they name the same
   roles. Both failure directions are silent otherwise: a role known only to
   Better Auth is issued and then sees nothing, and a role known only to the
   package is honoured everywhere but cannot be granted.

2. **Add `tests/architecture/role-checks-are-not-inlined.test.ts`, which fails
   on a role compared against a string literal outside the contracts package.**
   The same tripwire pattern as `shared-contracts-are-not-recopied.test.ts`, and
   for the same reason: this class of drift is invisible to typecheck, because
   each copy is internally consistent while disagreeing with the others. The
   test is what makes step 1 hold after the change lands.

   Comparing against an exported constant is allowed — a badge or a menu item
   genuinely does mean *that* role. A literal is not, because it is the one form
   the next person adding a role cannot find. `'user'` is excluded from the
   forbidden words: `Message.role === 'user'` is an LLM conversation role, and a
   test that flags it would teach people to ignore it. Test files are excluded
   too, since a `vi.mock` of the contracts module has to supply an
   implementation.

3. **Split `isOrgAdmin` into the two intentions it conflates** — `canManageOrg`
   for acting, `orgVisibilityScope` for seeing — even though both resolve
   identically today. `DocumentActor.isOrgAdmin: boolean` becomes
   `scope: OrgVisibilityScope`, so `fileAccessWhere` has a place to put a third
   answer between "everything" and "mine and my teams".

   The dividing line, since every call site had to be put on one side of it:
   **selecting which rows come back is a scope; everything else is a
   capability.** Deleting a file you do not own is `canManageOrg`, not a scope —
   it is an action on a row, not a widening of what is visible. The knowledge
   base's `isOrgAdmin` component props were the third case, and they are
   affordances (the PII badge, an extra column), so they became `canManageOrg`
   too.

Nothing about the manager role is decided here. These three steps are worth
doing whether or not it is ever built, because they remove a conflation that
already exists.

## What a manager would cost afterwards

Recorded so the estimate is not re-derived later. Three shapes were considered:

**A. Manager as an organization observer** — read-only on AI usage, disk usage
and audit logs; no management. Fits the existing linear order between `member`
and `admin`, so it needs no new predicate, only per-page gating in place of the
single `organization/layout.tsx` gate. Roughly two to three days.

**B. Manager of a team** — sees the documents, threads and spend of *their
team*, including other people's. This is the role the product question was
actually about. It needs the new arm in `fileAccessWhere`, the scope value from
step 3, and a **`TeamManager` table of our own** — not a column on
`team_members`, because that table belongs to Better Auth and `AGENTS.md`'s
"the library that owns a table owns how it is queried" rule exists because
ignoring it once turned `main` red. It also needs new rows in
`apps/web/perf/access-control.test.ts`, which is the only test that asks
Postgres who can actually reach a file rather than asserting the shape of a
`where` clause. Roughly one to two weeks before step 3, three to four days
after it. This is an IDOR-class change, not a cosmetic one.

**C. Customer-defined roles** via the plugin's `dynamicAccessControl`. Only
against a concrete enterprise requirement.

## Consequences

**What gets better.** The next role — manager or otherwise — becomes an
additive change: a value in a union, an arm in one predicate, rows in one test
matrix. `apps/api` stops holding its own opinion about what an org admin is.
The role vocabulary gains a single home and a test that keeps it there.

**What this costs.** Step 3 touches the actor type that the document, folder and
project queries all consume, so it is a wide but shallow diff, and it lands
without any user-visible change to justify it. That is the point — it is
cheaper now than underneath a feature — but it needs reviewing on its own merits
rather than as part of something else.

**How to review it.** Every hunk is one of four kinds, and the fourth is the
only one where a mistake can change behaviour:

1. `isOrgAdmin(x)` → `canManageOrg(x)`, or a `useOrganization()` field and a
   component prop renamed to match. A rename; typecheck covers it.
2. A role literal replaced by an exported constant or by `canOwnOrg` /
   `isAppAdmin`, so the new architecture test passes.
3. `isOrgAdmin?: boolean` → `scope?: OrgVisibilityScope` through the query
   layers, defaulting to `'member'` — the narrow answer, so a caller that
   forgets to pass one hides rows rather than leaking them.
4. **A site that decided which side of the act/see line it was on.** Those are
   the ones to read: `bulk-documents.ts`, `folders.ts` and `permissions.ts`
   (acting on rows you do not own → `canManageOrg`) and the RAG metadata filter
   in `initializeBasicRag.ts` and its `apps/api` twin (selecting rows → scope).

**A flake to expect, unrelated to this change.** A full `apps/web` run can end
with one unhandled `ReferenceError: window is not defined` from better-auth's
`session-refresh` timer firing after jsdom has torn down. It attaches itself to
whichever test file was running, does not fail any test, and does not reproduce
on a second run or in isolation.

**What is deliberately not decided.** Whether the manager role ships at all,
and if it does, whether it is shape A or shape B. Also untouched: `User.role`
(the platform hierarchy), which has no manager problem — `apps/admin` is gated
to one email domain and its two values are enough.

**Related.** ADR-33 (shared platform contracts — step 1 is that rule applied to
roles), ADR-35 (admin surfaces split by scope), ADR-23 (the tenant-scope guard,
which is orthogonal: it answers *which organization*, never *which member*).
