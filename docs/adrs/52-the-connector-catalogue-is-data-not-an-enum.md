# ADR-52: The Connector Catalogue Is Data, Not an Enum

**Status:** Accepted. Implements
[docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md](../specs/2026-09-18-mcp-servers-added-without-a-deploy.md).
**Date:** 2026-09-20

## Context

Which services Ragen could connect to was a Postgres enum,
`McpConnectorProvider`, with eleven members. Adding a twelfth meant a schema
migration, an entry in `packages/platform-contracts`, a `ProviderDefinition`
manifest in `apps/web`, the same manifest again in `apps/api`, an icon in each
app's `public/`, environment variables for the server URL and the OAuth
credentials — and a coordinated deploy of web, api and admin.

So an operator could not add a service to their own installation. Not "could
not add it easily": could not, at any price, without forking. A self-hosted
customer whose team lives in Notion waited for an upstream release, and a
company's own internal MCP server could not be connected at all.

Two things made this worth doing rather than living with:

- **The OAuth flow was already provider-agnostic.** `connect/route.ts` reads
  everything off the manifest and hands it to `@ai-sdk/mcp`'s `auth()`. A row
  can feed it; nothing per-provider had to be written.
- **The per-organization restriction was already data.**
  `OrganizationSettings.allowedConnectors` is a `String[]`. The allowlist over
  the catalogue was data while the catalogue itself was code.

## Decision

**The catalogue is rows in `McpCatalogEntry`, and a manifest is optional code
beside one.**

A row carries what a connector *is*: slug, label, description, icons, server
URL, auth shape, scopes, system prompt, `enabled`. A **behaviour pack** — the
old `ProviderDefinition` — carries the two things a row cannot hold: a system
prompt that must compute (Google Calendar's takes the user's timezone) and the
`api_key_custom_header` URL assembly, where the *user* supplies a shop address
at connect time. **A row with no pack resolves completely**, which is the whole
point: Notion is a row.

Four decisions inside that are worth keeping written down.

### The eleven built-ins keep their SHOUTING slugs

`GOOGLE_CALENDAR`, not `google-calendar`. Three things already store those
strings: vault token paths (`/v1/tokens/{customerId}/{provider}`), every
`allowedConnectors` array, and `customerId` itself
(`{orgId}:{userId}:{slug.toLowerCase()}`). Renaming them in step buys
consistency and risks orphaning live OAuth tokens. New entries are
lowercase-kebab, so the column holds two casings by design — and the slug is
unique **case-insensitively**, because `slack` beside `SLACK` would send both
connectors the same `x-customer-id`.

### A built-in's server URL stays in the environment

`MCP_GOOGLE_SERVER_URL` and its siblings are read at module load, and every
deployment sets them. Seeding the value a migration happens to see into a
column would mean a database promoted or restored between environments
silently points Google at the wrong host, and changing the variable would stop
working with no error. `mcpServerUrl` is null for a built-in and required for
an entry an operator creates.

### An entry's OAuth secret is in ragen-token-vault, never in a column

ADR-32's line, and it also keeps a client secret out of every `SELECT *` and
out of the admin activity feed. The row carries `oauthCredentialsStored`, and
it is written only after the vault confirms.

### The address policy applies to a catalogue URL, with one narrow opt-out

The SSRF policy in `packages/connector-guard` exempts deployer-controlled
`MCP_*_SERVER_URL` values, because apps/api legitimately talks to loopback
services. A catalogue row is deployer-controlled *and* typed into a web form,
which is the case that exemption was never written for. The policy applies,
and an entry may set `allowsPrivateAddress` — which admits RFC 1918 space and
**nothing else**. Loopback, link-local, unique-local and every reserved range
stay refused with the flag on, because cloud metadata lives on link-local
`169.254.169.254` and `fd00:ec2::254`, and nothing an operator self-hosts is
there. A flag that permitted everything the guard was written for would be a
rename of "off".

## What this cost

**The compile-time guarantee.**
`PROVIDER_REGISTRY: Record<McpConnectorProvider, ProviderDefinition>` made
"every connector has a manifest" a compile error. Nothing about moving to rows
brings that back, and nothing should: an entry an operator adds has no manifest
by design. What replaces it is deliberately weaker — a runtime lookup that
answers "no behaviour pack" instead of crashing, and
`tests/architecture/every-seeded-connector-resolves.test.ts`, which says
nothing about connectors that do not exist yet and everything about the eleven
that ship.

**An expand/contract across three independently deployed services.** The enum
column could not be changed in one release: web, api and admin restart
separately, so whichever redeployed second would have been reading a column
whose type it did not have. Four steps — add `providerSlug` and dual-write,
move every reader, make it `NOT NULL` and stop writing the old column, drop the
column and the type — each independently deployable, and the third and fourth
gated on the second having been on demo through a full connect and
token-refresh cycle.

## Consequences

- Adding Notion is a form. So is disabling Slack for everybody, and granting an
  entry to two organizations out of fifty.
- `packages/platform-contracts`'s `CONNECTOR_PROVIDERS` narrows in meaning: it
  is the seed's input, the eleven that ship with Ragen, not the catalogue.
- The eleven are still described twice, in `apps/web` and `apps/api`. Retiring
  that duplicate is its own spec; until then
  `every-seeded-connector-resolves.test.ts` holds the copies to each other.
- `apps/api` resolves from the catalogue too, through its own
  `CatalogueService`. It had to: an entry disabled in the panel would otherwise
  have kept working through the public API — an entry that is off everywhere
  except one path is not off — and an operator's typed URL would have been
  dialled there with no address check, because that app's guard covered only
  the shop-URL shape. It reads a catalogue entry's vault-held OAuth
  credentials too (`connectors/connector-credentials.ts`, the sibling of
  apps/web's `get-connector-credentials-query.ts`), which an operator-created
  `EXTERNAL_MCP` entry needs in order to refresh a token at all.

  The two clients are copies, and that is the repository's most-repeated bug
  source: apps/api's `external_mcp` branch kept a bare client for a while after
  apps/web's had moved onto the guarded transport, with both apps compiling and
  both suites green. `connect-is-guarded` now exists on both sides — it asserts
  that every branch which opens a session goes through the address policy when
  the definition carries a guard — because a rule neither suite checked is a
  rule that only production enforces.
