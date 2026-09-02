# ADR-34: Share the LiteLLM Client Across the Apps

**Status:** Accepted and implemented.
**Date:** 2026-09-03

## Context

ADR-33 collapsed four hand-copied *values* into `packages/platform-contracts`.
The LiteLLM client was the largest remaining copy-paste of any kind: ~440 lines
in `apps/web/src/libs/litellm/` and a near-identical copy in
`apps/api/src/litellm/`.

A diff of the two showed they differed in exactly three ways: the imports, the
construction of the logger (`Logger` from `@nestjs/common` versus the Pino
instance), and the argument order of three logger calls. `types.ts` was
**byte-identical**. `apps/api/docs/ported-libs.md` recorded the arrangement and
asked the next reader to keep both in sync by hand.

Meanwhile `apps/admin` had neither copy. It open-coded two `fetch` calls to
`/team/update` — one in `limits/actions.ts`, one in `models/actions.ts` — each
building its own Authorization header, each wrapped in `try { … } catch {}`, and
**neither inspecting `response.ok`**. Both carried the comment *"direct API call
— admin app can't import from main app"*.

That third non-copy is where the cost showed up. An audit of the panel found two
defects that the shared client would have made impossible:

- **The budget was written to a team no traffic used.** The panel posted
  `{ team_id: orgId }`. That team exists — signup creates one keyed by the
  organization id — but every organization also gets a Better Auth team,
  `{orgId}-general`, with its own LiteLLM team and virtual key, and
  `resolveLiteLLMKeyQuery` prefers the *team* key whenever the caller belongs to
  exactly one team, which is what every signup produces. So the ceiling an
  administrator set was applied to a team almost no request passed through.
- **Every failure was silent.** A 404 on a missing team, a rejected budget and a
  five-second timeout were indistinguishable from success, in both directions,
  with no log line.

## Decision

**`packages/litellm-client`**, on the model of `packages/observability`
(ADR-28): a CommonJS build with declarations, so a `tsc --build` → plain-node
consumer can use it alongside two Next.js apps.

`createLiteLLMClient({ proxyUrl?, masterKey?, logger? })` returns the same
functions the copies exported. Each app keeps a binding file, so **no import site
changed** — `@/libs/litellm/client` and `../litellm/client.js` still resolve.

Three details worth recording:

- **The logger is injected, context-first.** That single difference was most of
  what separated the two copies. `apps/api`'s binding adapts NestJS's
  message-first `Logger` in four lines.
- **The model cache moved from module state into the client instance.** Two
  clients pointed at different proxies could previously serve each other's
  answers — the shape of an e2e run against a mock proxy leaking into a dev
  process.
- **`apps/admin` gets a `syncOrgToLiteLLM` helper**, not just the client. It
  updates the org-level team *and* every provisioned `Team` row, and returns a
  `LiteLLMSyncResult` the action records in its audit entry. Best-effort is
  still the policy — the database is the source of truth, and the app enforces
  cost limits itself in `check-usage-limits-query` — but the outcome is now
  reported instead of discarded.

### Reads that were missing

The panel needs to show what the proxy knows, and three endpoints had no
wrapper:

- `GET /health` — `isLiteLLMAvailable()` calls it and **throws the body away**,
  returning a boolean. That cannot answer "which model is down", which is the
  question behind a user reporting one model failing while the rest work.
  `getLiteLLMHealth()` returns the payload.
- `GET /model/info` — the only source of a model's real upstream. `/v1/models`
  returns just an id, so provider attribution everywhere else is either a
  prefix guess (`inferOrigin`) or a hand-maintained registry entry, and neither
  can tell you that `gpt-5.4` is served by Azure.
- `GET /key/info` — `LiteLLMKeyInfo.spend` is only ever populated from the
  `/key/generate` response today, which means it is always zero wherever it is
  read.

All three return null or an empty list rather than throwing, so a dashboard
degrades to "unknown" instead of erroring.

## Consequences

- One implementation. `apps/api/docs/ported-libs.md` loses its largest entry.
- The panel's LiteLLM writes now reach the teams that serve traffic, and say
  whether they landed.
- `packages/litellm-client` depends on `packages/platform-contracts` for
  `MODEL_REGISTRY` and the model types — a package depending on a package, which
  is new here but is the correct direction: the catalogue does not depend on the
  transport.
- Still not addressed: nothing calls `/team/list`, so there is no way to
  enumerate teams the proxy knows about that the application database has
  forgotten. Orphan detection would need it.

## Alternatives considered

**Leave `apps/admin` with its own `fetch` calls and only merge web and api.**
Rejected: the panel's two defects came precisely from being the copy nobody
reviewed alongside the others, and merging the two that already agreed would
have fixed nothing.

**A NestJS-injectable service in `apps/api` that the others call over HTTP.**
Rejected: it puts a network hop and a service dependency in front of an
operation the admin panel performs synchronously while an administrator waits,
and apps/admin's whole design is direct database access rather than a chain of
services.
