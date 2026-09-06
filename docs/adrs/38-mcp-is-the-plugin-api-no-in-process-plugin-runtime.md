# ADR-38: MCP is the plugin API; there is no in-process plugin runtime

**Status:** Accepted (decision recorded; nothing implemented — see "What is not done").
**Date:** 2026-09-06
**Related:** [ADR-05](05-mcp-integration-strategy.md), [ADR-21](21-monorepo-and-api-decoupling.md), [ADR-23](23-tenant-scope-guard.md), [ADR-32](32-token-vault-and-mcp-stay-separate.md), [ADR-33](33-shared-platform-contracts-package.md), [ADR-36](36-mcp-server-exposes-chat-via-apps-api.md), [ADR-37](37-typed-env-contract-not-a-config-file.md)

## Context

The question: can someone add functionality to Ragen — a connector, a document
format, a storage backend, a panel — without changing the core?

[ADR-37](37-typed-env-contract-not-a-config-file.md) already asked half of it,
when the proposal was a `ragen.config.ts` in the shape of Payload CMS's. It
said no, and named the condition for revisiting: *"someone outside this
repository needs to add a connector, storage backend or reranker."* This ADR
answers the other half — not "where does configuration live" but "what shape
does third-party code take" — and it records the answer before that condition
fires, so the first person who asks gets a designed answer rather than an
improvised one.

### The plugin runtime already exists and is not called one

`ragen-connectors` is a separate repository, a separate deployment, written in
Python, and it adds Google Calendar, Drive, Ads and Analytics tools to every
chat. Nothing in `apps/web` changes when it gains a tool. That is a plugin
system by every functional definition; what it lacks is a name, a published
contract, and the ability for anyone outside Web Amigos to point Ragen at their
own server.

### What already extends without touching core logic

Verified in the tree, not assumed:

| Seam | Cost to extend | Where |
|---|---|---|
| MCP tools | A separate service speaking MCP | `apps/web/src/libs/mcp/client.ts`, ADR-05 |
| Assistant templates | A database row | `AssistantTemplate`, `OrganizationSettings.allowedTemplates` |
| Models | Proxy config plus a catalogue entry | `infra/litellm/config.yaml`, `MODEL_REGISTRY` |
| Public API, SDK, MCP server | Build alongside, no fork | `apps/api`, `apps/mcp`, `@webamigos/ragen-sdk-ts` |
| Built-in chat tools | A rebuild — already a `Record<string, Tool>` registry | `apps/web/src/libs/tools/index.ts` |
| Lifecycle side-effects | A rebuild — one file plus one registration line | `apps/web/src/libs/events/subscribers/` |

And what does not: a **connector** needs a Prisma enum value, a manifest in
`apps/web` and a matching one in `apps/api`; **storage**, **reranker** and
**vector store** are each "pick one of two or three with a string", and each
throws on an unknown value.

### Four walls stand in the way of in-process plugins

1. **The web app is a traced standalone bundle.** `output: 'standalone'` with
   `outputFileTracingRoot` at the monorepo root means the image contains only
   what Next traced at build time. A runtime `import()` of a path nothing
   referenced during the build works in `npm run web:dev` and resolves to
   nothing in production — the failure mode this repo has already paid for more
   than once.

2. **Ingest runs inside a deterministic Temporal workflow.** File-type routing
   is a `switch (fileType)` in `apps/worker/src/workflows/parse-and-embed.ts`,
   inside bundled code that is replayed. Plugin code cannot live there without
   breaking replay determinism. A format plugin has to be an *activity* the
   workflow dispatches to by name.

3. **One shared schema.** `prisma/schema.prisma` serves every app through
   per-app `generator` blocks (ADR-21). A plugin cannot add a table; a
   migration is a core change with a core review.

4. **Tenant isolation warns; it does not enforce.** The tenant-scope guard
   covers ~20 models with a direct org column, does *not* cover models scoped
   through a relation, and logs rather than throws (ADR-23). First-party code
   is held to it by review, by `tests/architecture/` and by the skills in
   `.claude/skills/` — all of which read source as text, and none of which can
   see a package outside the tree. Third-party code holding the Prisma
   singleton would have no enforced boundary at all.

The first three are engineering constraints with known workarounds. The fourth
is a security question, and `docs/open-core-boundary.md` has already answered
the general form of it: tenant isolation is core and does not degrade.

## Decision

**MCP is Ragen's extension API. There is no in-process plugin runtime, and
adding one is not planned.**

Three tiers were considered. The decision is to commit to the first, hold the
second against ADR-37's trigger, and rule the third out absent a business
reason that does not exist today.

### Tier 1 — publish the extension API that exists (sanctioned, not yet built)

No architecture change. Document MCP as the extension point, and remove the one
thing that makes it in-house only: the fixed provider enum.

- A `CUSTOM` connector an organization configures with a URL, an auth mode and
  a display name. `PROVIDER_REGISTRY` stays `Record<McpConnectorProvider, …>`
  and exhaustive — `CUSTOM`'s manifest reads its URL and auth from the row
  instead of a constant, so compile-time completeness survives and only the
  data moves.
- Credentials into the token vault, exactly as every other connector already
  does (ADR-32). Nothing new stores a secret.
- An operator-level allowlist of permitted hosts, defaulting to empty. A
  self-hosted install that wants any host says so once; a hosted install never
  quietly gains outbound reach to arbitrary servers.
- The per-provider prompt fragment `buildMcpContext()` assembles becomes, for a
  custom connector, text the organization supplies. That is untrusted input
  reaching the system prompt and needs the same treatment as any other.
  `tool-arg-inspector` already exists in both `apps/web` and `apps/api`; its
  coverage widens from ten known servers to anything an organization points at.

Explicitly **not** in scope: plugin UI, plugin tables, runtime code loading, a
marketplace. Each of those is Tier 3 wearing Tier 1's costume.

### Tier 2 — provider seams become build-time registries (held)

Storage provider, reranker and document parser become registries an out-of-tree
npm package registers into **at build time** — a plugin is a dependency plus one
line, a rebuild but never a fork. `DOCUMENT_PARSER` and `PDF_PROCESSOR` first,
exactly as ADR-37 names them. Build-time and not runtime `import()`, because of
wall 1; ingest plugins register as Temporal activities, because of wall 2.

Do this when ADR-37's condition actually fires — someone outside this repository
asks — and not before.

### Tier 3 — a plugin host with UI (rejected for now)

A capability manifest, plugin-scoped storage with `organizationId` enforced by
the runtime rather than by review, and UI as declarative descriptors rendered by
core components (or an iframe) rather than arbitrary React shipped at runtime.
The host would belong in `apps/api`, where NestJS dynamic modules make
boot-time registration natural — not in the Next.js app.

Rejected because it is only worth its cost if a marketplace is the business
rather than a convenience, and because **the tenant-scope guard has to throw
before any of it is safe**. That work has its own backlog
(`.claude/skills/ragen-tenant-scope-audit/`) and is a prerequisite, not a
detail.

## Consequences

### Positive

- The answer to "can I extend Ragen" stops being "fork it" and becomes "write
  an MCP server", in any language, deployed anywhere.
- Third-party code stays **out of process**. It cannot reach the database, the
  vector store or another organization's data, whatever it does wrong. This is
  the property that makes Tier 1 safe to ship and Tier 3 expensive.
- Compile-time exhaustiveness survives. Every registry in this repository fails
  the build on a missing entry, and ADR-37 was explicit that a config file would
  lose that. Tier 1 keeps it; Tier 2 keeps most of it; only runtime loading
  gives it away.
- Apache 2.0 and a plugin ecosystem fit cleanly — separable works that link to
  an interface are not derivative works. `docs/open-core-boundary.md` stays
  intact: a plugin API is fine, a plugin API that is the *only* route to a
  working install is not.

### Negative

- No UI extension at all. A plugin cannot add a settings page, a panel or a
  column. Anything visual remains a core change.
- No new data. A plugin that wants to persist something has to persist it on
  its own side.
- Custom MCP means Ragen makes outbound calls to hosts an organization chose.
  The allowlist bounds it; it does not eliminate it.
- A plugin that breaks looks exactly like Ragen breaking. `McpConnector`
  already carries `lastError` and `lastErrorAt` for this reason, and any plugin
  surface needs the same attribution at the point of failure.

## What is not done

**All of it.** Tier 1 is a sanctioned design, not an implementation. It needs:
the `CUSTOM` enum value and a widened uniqueness constraint on `McpConnector`
(today `[organizationId, userId, provider]`, which admits exactly one custom
connector per user), the registry change, the host allowlist, the prompt-fragment
handling, and a published contract document for people writing servers.

## Revisit when

- **Someone outside this repository asks for a storage backend, reranker or
  document parser.** That is ADR-37's trigger, unchanged, and it is what moves
  Tier 2 from held to built.
- **A customer needs a plugin to own data or UI.** Tier 3's cost only makes
  sense against a named requirement, and the tenant-scope guard must throw
  first.
- **Self-hosting becomes a product rather than a possibility.** ADR-37 names
  this too; a plugin catalogue and a setup wizard are the same decision seen
  from two sides.
