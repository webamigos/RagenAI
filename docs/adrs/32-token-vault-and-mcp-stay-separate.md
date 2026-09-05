# ADR-32: ragen-token-vault and ragen-mcp stay separate repositories

**Status:** Accepted
**Date:** 2026-09-01
**Related:** [ADR-21](21-monorepo-and-api-decoupling.md), [ADR-26](26-absorb-ragen-worker-into-monorepo.md), [ADR-30](30-absorb-ragen-docs-into-monorepo.md)

> **Update 2026-09-05:** `ragen-mcp` was renamed on GitHub to
> `ragen-connectors` (`github.com/webamigos/ragen-connectors`) — same
> repository, same decision below, name only. Left as `ragen-mcp` throughout
> the rest of this ADR (including its title) for historical accuracy: that
> was the repo's name when this decision — and the commit-count table below —
> was recorded.

## Context

Three repositories have been absorbed into this monorepo in the last months:
`apps/worker` (ADR-26), `apps/web` off the root (ADR-29), `apps/docs` (ADR-30).
The two that remain are `ragen-token-vault` and `ragen-mcp`. The question is
whether the same reasoning applies to them.

It does not, and the reason is measurable.

**Every absorption so far was justified by drift** — code that changes with the
app but lives where a pull request cannot carry it, so the two diverge and the
divergence is invisible until someone reads both. That was true of the worker
(the vector contract was hand-maintained in two places) and of the docs (the
self-hosting page landed days after the self-hosting work it described).

Over the ninety days to 2026-09-01:

| repository | commits | last change |
|---|---|---|
| `ragen-app` | 136 | 2026-09-01 |
| `ragen-token-vault` | 0 | 2026-04-17 |
| `ragen-mcp` | 0 | 2026-05-18 |

Neither has moved at all while this repository moved 136 times. There is no
drift to fix, so absorption would buy nothing and cost the usual: a larger
lockfile installed by every CI job, more workspaces in every `turbo run`, and
two more deployables in a repository that already has five.

## Decision

Both stay separate.

Beyond the absence of drift, each has a reason of its own.

**`ragen-token-vault` is not an application component.** It has two consumers —
this repository and `ragen-mcp`'s `rejestrio` and `google` services — so it is
a platform service rather than part of any one app. It holds OAuth tokens and
API-key secrets in its own database (`Token`, `OAuthPendingState`, `AuditLog`),
which is the isolation that justifies its existence. Absorbing it means either
a second Prisma schema with its own datasource — an exception to ADR-21's "one
schema, one generator block per app" — or merging its tables into the
application database, which removes the isolation entirely. The first is
possible; the second defeats the point.

**`ragen-mcp` is already a monorepo.** `packages/core` plus four services
(`clickup`, `google`, `hubspot`, `rejestrio`), ~12,200 lines, each service with
its own Dockerfile and `railway.toml`, and `rejestrio` carrying a third Prisma
schema. npm does not nest workspaces, so absorbing it means flattening it into
`apps/mcp-*` and losing its internal structure. And this repository shares no
code with it — it speaks MCP over the wire, which is the entire point of the
protocol. A connector is exactly the kind of thing that *should* be behind a
network boundary.

## Consequences

**Good.** The repository boundary now has a written reason, so the question does
not get re-litigated every time someone notices two repositories that "feel
related".

**What this does not excuse.** Separation is a reason for the *services* to live
apart, not for their *clients* to be copy-pasted. The vault client was
duplicated three ways inside this repository — `apps/web/src/libs/ragen-vault/`,
`apps/api/src/ragen-vault/` (the same 270 lines apart from a logger and a
service name) and a third hand-written copy of the HMAC signing in
`apps/api/src/vault/vault.client.ts`. A signing scheme implemented three times
drifts quietly and then fails as a 401 nobody can explain. It now lives in
`packages/vault-client`; the apps keep only the wiring that reads their own
environment. `apps/api/src/vault/vault.client.ts` stays a separate class —
different endpoints, different purpose — but shares the signer.

**Revisit when.** If either repository starts changing in step with this one —
say a connector contract that has to move on both sides at once — the drift
argument comes back and this decision should be re-made on the new numbers.
