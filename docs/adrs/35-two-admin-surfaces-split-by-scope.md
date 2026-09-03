# ADR-35: Two Admin Surfaces, Split by Scope

**Status:** Accepted.
**Date:** 2026-09-03

## Context

API keys, file storage and AI usage each appear twice: once under
`apps/web/src/app/[locale]/(panel)/organization/`, once under
`apps/admin/src/app/(dashboard)/`. It looks like duplication, and the history
invites that reading — `apps/admin` was written as a single-operator panel for
a hosted SaaS, while customers saw their own numbers in `apps/web`.

The product direction has changed. Ragen is going open-source and
self-hosted, and the intended shape includes **implementation partners and
agencies running one installation for several client organizations**. That
raised a fair question: if the operator is the person who installs it, should
these three subjects not simply move into the panel?

Reading the code first settles most of it. The two surfaces do not answer the
same question:

| Subject | `apps/web` | `apps/admin` |
|---|---|---|
| Disk usage | `getOrgIdFromAuthOrThrow()` + `isOrgAdmin` — one organization | `userFile.groupBy(['organizationId'])`, **no org filter** — the whole installation |
| AI usage | as above | as above |
| API keys | `requireOrgAdmin` on every action; create, rotate, deactivate | review and revoke **somebody else's** key, `lastUsedAt`, never-used |

"How much does my organization use" and "how much does this installation use"
are different questions with different answers and different audiences. The
same holds for credentials: issuing a key for your own integration is daily
work for the person who owns the integration; revoking a key that belongs to
somebody else is incident response by an operator.

Two findings from the same reading are worth recording because they cut the
other way:

- **The apps/web API-keys page has no guard of its own.** Every action behind
  it calls `requireOrgAdmin`, and the page renders only what a guarded query
  returns, so there is no hole — but the safety lives one layer down from
  where a reader looks for it.
- **API-key creation was gated on a plan feature**,
  `isFeatureEnabledQuery(orgId, 'apiAccess')`. That is the genuine SaaS
  residue: a billing-shaped decision sitting in the path of a self-hosted
  install where nobody manages plans. `DEFAULT_FEATURES.apiAccess` is `true`,
  so an installation with no subscriptions is unaffected — but one carrying a
  seeded plan whose `features` say otherwise is, and the operator had no
  single place to say "on, here, for everyone".

## Decision

**Keep both surfaces. Split them by scope, not by subject.**

- `apps/web/.../organization/*` answers **"mine"** — scoped to one
  organization, reached by its own members, guarded by `requireOrgAdmin`.
- `apps/admin` answers **"everyone's"**, plus every operation performed *on*
  an organization from outside it: ceilings, revocation, forced disconnects,
  propagating a default.

Moving API keys into the panel is explicitly rejected. In the single-org
self-hosted case it would force one person to run two applications to do one
routine thing; in the multi-org case it would make the operator the issuing
desk for every client's integrations. Neither is an improvement.

Three consequences follow, and are being implemented as separate changes:

1. **Feature gating becomes the operator's control, not billing's.** The
   resolution chain gains a platform-default layer between the plan and the
   code constant, editable in the panel:
   `org override > plan.features > platform default > code default`.
   An installation with no billing sets it once; an agency can still override
   per client. The panel also has to *show* the resolved value and where it
   came from — an operator who can set an override but cannot see what a
   feature currently evaluates to is not really in control of it.
2. **The aggregations get shared, the pages do not.** Summing file sizes and
   token counts is implemented twice today, and that is real duplication of
   exactly the kind ADR-33 removed for contracts. One function taking an
   optional `organizationId` — absent meaning the whole installation — used by
   both surfaces.
3. **The scope split is the rule for anything added later.** A new read is
   per-organization in `apps/web` and platform-wide in `apps/admin`; a new
   write that acts on an organization from outside it belongs only in
   `apps/admin`, and it records an audit entry.

## Consequences

**What gets better.** The multi-tenant case is now a first-class target rather
than an accident: an agency operator sees every client organization in one
place and each client sees only itself, with the boundary enforced by
different guards rather than by different URLs. The rule in point 3 answers
"where does this go" without a discussion each time.

**What this costs.** Two surfaces over one subject means two places to change
when the subject changes — a new usage metric wants rendering twice. Point 2
reduces that to the presentation layer, which is where the two genuinely
differ, but it does not eliminate it.

**What is deliberately not decided here.** Whether `apps/admin` should ship at
all in a single-organization install. It is a separate Next.js application on
its own port, and an installation with one organization arguably does not need
it — but the platform-wide pages (proxy health, connector health, incidents)
have no per-organization equivalent, so switching it off would lose function
rather than duplicate it. Revisit if single-org self-hosting turns out to be
the dominant shape.

**Related.** ADR-21 (why `apps/api` is a separate application), ADR-33
(shared contracts), ADR-34 (shared LiteLLM client). This ADR is the same
argument applied to admin surfaces rather than to code.
