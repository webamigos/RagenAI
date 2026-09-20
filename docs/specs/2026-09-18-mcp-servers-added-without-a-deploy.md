---
title: MCP servers added and scoped from the admin panel, without a deploy
status: draft
areas: [admin, connectors, api, auth]
adrs: [27, 32, 33, 35, 36, 38]
---

# MCP servers added and scoped from the admin panel, without a deploy

## TLDR

The catalogue of connectable services stops being compiled in and becomes rows
a platform administrator edits: add Notion, enable it, restrict it to two
organizations, no release. The enabling discovery is that the OAuth flow is
already provider-agnostic — `connect/route.ts` reads everything off the
provider manifest and hands it to `@ai-sdk/mcp`'s `auth()`, so a catalogue row
needs no new authentication code. The cost is one unpleasant migration:
`McpConnectorProvider` is a Postgres enum referenced by 57 files across three
apps, and it has to become a string.

## What exists today

Adding one connector — say Notion — currently means touching, at minimum:

1. `McpConnectorProvider` in `prisma/schema.prisma` — a **Postgres enum**, so a
   migration, and the hazard in
   [`docs/lessons/adding-an-enum-value-breaks-older-readers.md`](../lessons/adding-an-enum-value-breaks-older-readers.md)
   across the separately generated clients.
2. `CONNECTOR_PROVIDERS` + `CONNECTOR_METADATA` in
   `packages/platform-contracts` (ADR-33), checked against the schema by
   `packages/platform-contracts/src/__tests__/connectors.test.ts`, which
   regex-parses `enum McpConnectorProvider` out of `prisma/schema.prisma` and
   asserts set equality. (`tests/architecture/connector-dto-agrees.test.ts` is
   a different guard — it compares the two hand-copied `ConnectorDto` `Pick`s
   against the `select` in `getUserConnectors`.)
3. A `ProviderDefinition` manifest in
   `apps/web/src/features/connectors/providers/`, registered in
   `PROVIDER_REGISTRY` — a `Record<McpConnectorProvider, …>`, so the compiler
   demands the entry.
4. **The same manifest again** in `apps/api/src/connectors/providers/`, a
   parallel copy of all eleven files.
5. An icon under each app's `public/assets/connectors/`.
6. Server URL and OAuth credentials as environment variables — `MCP_*_SERVER_URL`
   in `shared-config.ts`, `*_MCP_CLIENT_ID` / `*_MCP_CLIENT_SECRET` read inline
   in each manifest.

Then a redeploy of web, api and admin.

The per-organization *restriction* is the only part already dynamic:
`OrganizationSettings.allowedConnectors` (a `String[]`, empty = no
restriction), edited from `apps/admin`'s `/connectors` with platform defaults
in `Settings`. So the brief's diagnosis is right: the allowlist over the
catalogue is data, the catalogue itself is code.

Three things already exist that this spec leans on rather than rebuilds:

- **The OAuth flow is generic.** `apps/web/src/app/api/connectors/external/connect/route.ts`
  validates the callback origin, reads `oauthClientId`, `oauthClientSecret`,
  `scopes`, `useUserScope` and `mcpServerUrl` off the manifest, and calls
  `mcpAuth()` with `RagenAuthOAuthClientProvider`. Nothing in it is
  per-provider. A row can feed it.
- **The vault already keys on a free string.** `packages/vault-client`'s
  `tokenPath(customerId, provider)` takes `provider: string` and URL-encodes
  it. Nothing there requires an enum.
- **An SSRF policy already exists** for user-supplied connector URLs:
  `apps/api/src/connectors/private-address.ts`, enforced at parse time
  (`normalizeSiteUrl`) and at connect time (`guarded-fetch.ts`,
  `guarded-mcp-transport.ts`). Its header says it is deliberately *not* applied
  to deployer-controlled `MCP_*_SERVER_URL` values. That exemption is the thing
  this spec has to re-decide, because a catalogue row is both.

## Problem

An operator cannot add a service to their installation. Not "cannot add it
easily" — cannot, without a code change, a migration, and a coordinated deploy
of three services. That blocks two concrete things:

- A self-hosted installation whose client uses Notion waits for an upstream
  release to support Notion, even though the MCP server exists and the flow
  that would talk to it is already generic.
- An internal MCP server — a company's own, on its own network — cannot be
  connected at all, at any price, without forking.

It also produces a smaller, daily cost: eleven connectors are described twice,
in `apps/web/src/features/connectors/providers/` and
`apps/api/src/connectors/providers/`, and the two copies are kept in step by
nothing but attention.

## Out of scope

- **Org admins cannot add catalogue entries.** The catalogue is
  installation-wide, so under ADR-35 it belongs to `apps/admin`. An
  organization still only connects to what `allowedConnectors` permits, and
  `apps/web` gains no new surface. The rejected alternative matters enough to
  name: letting an org admin add one hands every customer the ability to point
  the server at a URL of their choosing.
- **`api_key_custom_header` entries stay code-defined** in this work — the
  WooCommerce / Open Mercato shape, where the *user* supplies a shop URL at
  connect time and `mcpServerUrlPath` is appended. It pulls the whole
  user-URL normalisation path into scope and serves two connectors.
- **No external registry.** The catalogue is seeded and edited locally; pulling
  it from a public MCP registry is a different spec with a network dependency a
  self-hosted install may not have.
- **`apps/mcp` is untouched.** That is the reverse direction — an external
  client calling into Ragen (ADR-36).
- **No per-entry tool allowlists.** Which tools a server exposes is the
  server's business; ADR-38 is explicit that MCP is the extension API and
  nothing loads in-process.
- **The `ragen-connectors` repository is untouched.** Its four Google services
  keep working exactly as they do.

## Proposed solution

### The catalogue becomes rows

A new `McpCatalogEntry` table, seeded by the migration with the eleven
connectors that exist today. It carries what a manifest carries: slug, label,
description, icon, server URL, auth type and its parameters, scopes, the system
prompt fragment, and `enabled`.

`ProviderDefinition` does not disappear. It stops being the answer to *which
connectors exist* and becomes a **behaviour pack**: optional code keyed by
slug, for the two things a row cannot hold.

- A `systemPromptFragment` that is a *function* — Google Calendar's takes the
  user's timezone. Rows hold text; functions stay in code.
- `api_key_custom_header` URL assembly, out of scope above.

An entry with no behaviour pack works entirely from data. That is the whole
point: Notion is a row.

**Where a seeded row's values come from.** Not from
`packages/platform-contracts`: `CONNECTOR_METADATA` carries only `value`,
`label` and an asset path. Everything else a row needs — `authType`, scopes,
`authBaseUrl`, `useUserScope`, the system prompt — lives in the per-app
`ProviderDefinition` manifests. The seed is therefore a script that imports
`apps/web`'s `PROVIDER_LIST` and writes rows from it, not a SQL literal list,
and the two `icon` fields are both carried (see the model).

**That import is a dependency, and it is load-bearing in the wrong direction.**
`PROVIDER_LIST` pulls in every manifest, `shared-config.ts` reads server URLs
from `process.env` at module load, and the HubSpot and Slack manifests read
OAuth client ids and secrets the same way. So a seed runner without the web
alias, the generated Prisma module graph, or those variables fails before it
writes a row — and it fails while holding secrets it had no reason to load. The
seed therefore reads a **dependency-free projection** (slug, label, authType,
scopes, prompt fragment) generated from the manifests and committed beside it,
and a test compares the projection against `PROVIDER_LIST` so the two cannot
drift. The comparison belongs in CI, not in the migration path.

**A built-in's server URL stays in the environment.** `MCP_GOOGLE_SERVER_URL`
and its four siblings are read at module load in `shared-config.ts`, with
fallbacks, and every deployment sets them. Seeding those values into a column
would mean a database promoted or restored between environments silently points
Google at the wrong host, and changing the variable would stop working with no
error. So: **`mcpServerUrl` is null for `isBuiltIn` rows and the behaviour pack
resolves it from env; it is required and authoritative for every row an
operator creates.** A later spec may move built-ins to the column; doing it
here would mean writing the environment's current values into the database at
migration time, which is the one thing a migration cannot see.

**And `McpConnector.mcpServerUrl` is a third source that already has rows in
it.** It is a required column on every existing connector, written when the
connector was created, so after this work three places can name a server: the
environment (built-ins), the catalogue row (operator entries), and the
connector row (all of them, historically). The resolver reads exactly one:
**the catalogue entry, or the behaviour pack's environment lookup for a
built-in. The connector's own column is never consulted again.** It is left
written and unread by the same argument that keeps
`OrganizationSettings.contentModerationEnabled` alive elsewhere — a column
dropped in the release that replaces it is a column with no rollback — and a
follow-up removes it. Any other order would mean a catalogue edit silently not
reaching the connectors it exists to govern, and the SSRF policy checking a URL
that is not the one being dialled.

Rejected alternatives:

- **Keep the eleven in code, add a parallel "custom servers" table.** No
  migration, and permanently two code paths for every read. The decisive
  argument is not the branching itself but that it leaves the common case — a
  *known* service the operator wants — still needing a release, which is the
  brief. (ADR-42's "one function, never a second branch" is about thread
  encryption; it is an analogy here, not a precedent.)
- **Enum with spare members (`CUSTOM_1…20`).** No migration on add, at the cost
  of an identifier that means nothing in a log, in a vault path, or in
  `allowedConnectors`.
- **A YAML file, like `infra/llm-gateway/routes.yaml`.** No migration, but the
  admin panel cannot edit a file on a container's disk, which is the brief.

### The slug, and why the eleven keep shouting

`McpConnector.provider` and `McpOAuthToken.provider` stop being
`McpConnectorProvider` and become `String`, holding a catalogue slug.

**The eleven built-in slugs are exactly their current enum strings** —
`GOOGLE_CALENDAR`, `SLACK`, and so on. Not a tidier `google-calendar`. Three
things already store those strings and would otherwise all need rewriting in
step: vault token paths (`/v1/tokens/{customerId}/{provider}`), every
`allowedConnectors` array, and `customerId` itself
(`{orgId}:{userId}:{provider_lowercase}`). Renaming them buys consistency and
risks orphaning live OAuth tokens.

New entries get lowercase-kebab slugs (`notion`, `spotify`). So the column
holds two casings by design. The alternative — normalising on read — is a
function that rewrites vault paths, which is the failure this avoids. The
column comment says so; the validator enforces immutability after creation and
**the format it actually documents**: `^[a-z][a-z0-9-]*$` for anything created
from now on, with the eleven legacy uppercase values admitted only by the seed
and the migration. The looser `^[A-Za-z][A-Za-z0-9_-]*$` would accept `Foo_Bar`
— a twelfth casing convention, in the column whose casing feeds vault paths and
`customerId`, which is the cost this section is trying not to pay twice.

### Migrating the column without a maintenance window

Web, api and admin deploy independently, so a column whose type changes in one
release is a column that breaks whichever service redeploys second. Expand and
contract, four steps, each one safe alone:

1. Add `providerSlug String?` beside `provider`. Backfill `provider::text`.
2. Deploy every reader reading `providerSlug ?? provider`, and every writer
   writing both.
3. Make `providerSlug` `NOT NULL`; stop writing `provider`.
4. Drop `provider` and the `McpConnectorProvider` type.

Rejected: a single `ALTER TYPE … USING provider::text` in one migration. It is
one line, and it is correct only if all three services restart together, which
they do not.

### What the enum was giving us, and what replaces it

`PROVIDER_REGISTRY: Record<McpConnectorProvider, ProviderDefinition>` made
"every connector has a manifest" a **compile error**. Deleting the enum deletes
that guarantee, and nothing about moving to rows brings it back.

Two things replace it, and they are weaker on purpose — the guarantee was
protecting a list that is no longer meant to be fixed:

- A runtime resolver that answers "no behaviour pack" rather than `undefined`,
  so a row with no code is a supported state rather than a crash.
- `tests/architecture/every-seeded-connector-resolves.test.ts` — every seeded
  entry loads, has a reachable icon path, and has a behaviour pack if its
  `authType` requires one.

### Authentication, from a row

Three auth types are supported for an entry created at runtime:

| `authType` | What the admin supplies | Works from a row because |
|---|---|---|
| `server_side` | URL only | no credential exists; the connector goes straight to `CONNECTED` |
| `api_key_bearer` | URL only | the *user* pastes their key at connect time; it goes to the vault, as Fireflies' does |
| `external_mcp` | URL, client id, client secret, scopes | `connect/route.ts` is already generic (see above) |

**OAuth client secrets go to ragen-token-vault, never to the database.** The
admin action writes them under a catalogue-scoped customer id and the row keeps
only `oauthCredentialsStored Boolean`. That is ADR-32's line, and it also keeps
the secret out of every `SELECT *` and out of the admin audit log, whose
`stripSensitiveFields` would otherwise be the only thing standing between a
client secret and the activity feed.

`connect/route.ts` and its API-side counterpart currently read
`providerDef.oauthClientId` / `oauthClientSecret` from `process.env`. They
change to read the vault for a row-defined entry and keep the env read for a
built-in whose secrets are already there — one `if`, in one place, retired when
an operator moves them.

### SSRF: the exemption has to be re-decided

`private-address.ts` rejects every non-globally-routable address for
user-supplied URLs, and exempts deployer-controlled `MCP_*_SERVER_URL` because
apps/api legitimately talks to loopback services.

A catalogue row is deployer-controlled *and* typed into a web form. Applying
the exemption to it means a platform admin can point the server at
`http://169.254.169.254/` and read cloud metadata through an MCP transport;
applying the policy strictly means an operator cannot connect their own MCP
server on an internal network, which is one of the two problems this spec
exists to solve.

So: **the policy applies by default, and an entry may opt out** with
`allowsPrivateAddress`, off by default, settable only by a platform admin, with
the form stating what it permits. The opt-out is recorded in the audit log.

**The opt-out does not reach the address this section opened with.** An
operator's internal MCP server lives on RFC 1918 space; cloud metadata lives on
link-local `169.254.0.0/16` (and `fd00:ec2::254`), and nothing an operator
legitimately self-hosts is there. So `allowsPrivateAddress` widens the guard to
the private ranges only, and link-local, loopback, unique-local and the
metadata addresses stay refused with the flag on — checked after DNS
resolution, where a public hostname that resolves to `169.254.169.254` is the
attack this ordering exists to stop. A flag that permitted everything the guard
was written for would be a rename of "off", and the threat this spec names by
address would be reachable through the feature it proposes.

**The policy has to move before it can be applied.** It lives in
`apps/api/src/connectors/` and nowhere else, while `apps/web` opens MCP
sessions of its own — `src/libs/mcp/client.ts`, and the external connect and
callback routes — with no address check at all, and `apps/admin` is where the
URL will now be typed. Applying this rule as written would produce a third copy
of `private-address.ts`, which is the duplication this spec complains about in
Problem. So `private-address.ts`, `guarded-fetch.ts` and
`guarded-mcp-transport.ts` move to **`packages/connector-guard`** and all three
apps import them. That move is a step in Phase C, and it closes a gap that
exists today independently of this work: `apps/web`'s MCP client has never had
an address check.

The check then runs at three moments: save time in `apps/admin`, connect time
in both apps through `guarded-mcp-transport` (a public hostname can resolve to
a private address later), and on every tool call for the life of the
connector.

### Verifying an entry is real

The entry form gets a **Test connection** button: it opens an MCP session
against the URL and lists the tool names. It is the only way an operator can
tell a working MCP endpoint from a typo before a customer does, and it doubles
as the evidence that the server speaks MCP at all. Failures render the reason,
the way `lastError` / `lastErrorAt` already do on a connector card.

It is also an admin-triggered outbound request to an address the admin just
typed, so it is bounded rather than open-ended: a connect deadline and a
tool-list deadline (5 s each), an `AbortSignal` propagated from the request so
navigating away stops the work, and the MCP client and its transport closed on
every exit — success, failure, timeout and cancellation alike. Without that, one
unresponsive endpoint holds an admin request open for as long as it cares to.

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `prisma/schema.prisma` | one model; `provider` expand/contract on two models; enum dropped last | migrations + `npm run verify`; the four-step order below |
| `packages/platform-contracts` | catalogue contracts + the slug validator + the behaviour-pack resolver; `CONNECTOR_*` become the seed's input, not the runtime source. **No Prisma** — it ships to the browser | `connectors.test.ts` (rewritten at B5), `client-bundles-stay-browser-safe.test.ts` |
| `packages/connector-guard` (new) | the SSRF policy, moved out of `apps/api` so web and admin can enforce it too | its own tests; the three apps' builds |
| `packages/vault-client` | none — `provider` is already `string` | package tests |
| `apps/web` connectors feature | registry becomes a behaviour-pack lookup; loader binding reads rows; **gains an address check it never had** | feature tests + `p0` e2e |
| `apps/api` connectors module | same; its SSRF helpers move out | api spec suite |
| `apps/admin` | new `/mcp-catalogue` page and actions; `/connectors` allowlist lists rows and stops validating against `isConnectorProvider` | `server-actions-are-guarded` |
| `scripts/screenshots/demo-data.sql` | four enum casts | the demo seed run |
| ragen-token-vault | a new scope for catalogue-level OAuth credentials | vault client tests + a manual round trip |
| `packages/create-ragen-app` | the seeded catalogue replaces per-connector env vars in the first-run path | `create-ragen-app-manifest-is-current.test.ts` |

The migration's real size is worth stating plainly: `McpConnectorProvider` is
referenced by **35 files in apps/web, 20 in apps/api and 2 in apps/admin**,
generated clients excluded — plus two in `packages/platform-contracts` (the
contract and its schema-parsing test) and four `'SLACK'::"McpConnectorProvider"`
casts in `scripts/screenshots/demo-data.sql`, which is where a "we only touch
the apps" plan breaks. Most sites are a type annotation, and they stop
typechecking at **B2**, not at the drop — see the phase note there.

## Data model

```prisma
model McpCatalogEntry {
  id          Int      @id @default(autoincrement())
  publicId    String   @unique @default(uuid()) @map("public_id")
  /// Stable identifier. For the eleven seeded entries this is the OLD
  /// `McpConnectorProvider` value, verbatim — vault token paths, customerIds
  /// and every `allowedConnectors` array already hold that string, and
  /// renaming them in step would orphan live OAuth tokens. New entries use
  /// lowercase-kebab. Immutable after creation, and unique
  /// case-INSENSITIVELY: `customerId` is `{orgId}:{userId}:{slug.toLowerCase()}`,
  /// so a slug `slack` beside the built-in `SLACK` would send both connectors
  /// the same `x-customer-id`. Postgres `@unique` is case-sensitive, so the
  /// migration adds `CREATE UNIQUE INDEX … ON mcp_catalog_entries (lower(slug))`.
  slug        String   @unique
  label       String
  description String?
  /// Brand asset: a path under each app's `public/`, or an uploaded asset's
  /// URL. Distinct from `lucideIcon` below — the two `icon` fields in today's
  /// code are different things and collapsing them loses one.
  icon        String?
  /// A lucide icon name (`message-square`), which is what
  /// `ProviderDefinition.icon` holds and what the connector gallery renders
  /// when there is no brand asset.
  lucideIcon  String?  @map("lucide_icon")
  /// Null for `isBuiltIn` rows, whose URL is resolved from the environment by
  /// their behaviour pack; required for every row an operator creates.
  mcpServerUrl String? @map("mcp_server_url")
  /// Required here, although `ProviderDefinition.authType` is optional and
  /// several paths branch on it being undefined. A manifest with no authType
  /// seeds to `OAUTH` — stated rather than inherited, because "unset" is not
  /// an auth shape.
  ///
  /// **Corrected during B4.** This said `SERVER_SIDE`, on the reading that it
  /// is "what those paths already do in effect". It is not: a manifest with no
  /// `authType` falls through every branch in `ConnectorCard` to the popup at
  /// `authBaseUrl + authPath`, which is how the five Google connectors reach
  /// `/auth/google`. `server_side` is the opposite branch — the MCP service
  /// already holds the credential, so the card skips the popup and flips the
  /// connector straight to CONNECTED. Seeded that way, those five would have
  /// claimed to be connected without ever authorizing. `OAUTH` is right
  /// because nothing in either app branches on `'oauth'`, so every path takes
  /// the turn it takes for `undefined` today. See
  /// docs/lessons/an-unset-auth-type-is-oauth-not-server-side.md.
  authType    McpAuthType @map("auth_type")
  authBaseUrl String?  @map("auth_base_url")
  authPath    String?  @map("auth_path")
  scopes      String[] @default([])
  useUserScope Boolean @default(false) @map("use_user_scope")
  /// Set once the admin has stored client id + secret in ragen-token-vault.
  /// The credentials themselves are never columns (ADR-32).
  oauthCredentialsStored Boolean @default(false) @map("oauth_credentials_stored")
  /// Appended to the system prompt when this connector is enabled in a chat.
  /// Text only — a fragment that must compute (Google Calendar's timezone one)
  /// stays a behaviour pack in code.
  systemPrompt String? @map("system_prompt")
  /// Off by default. On, this entry's URL may resolve to a private address —
  /// for an operator's own MCP server on an internal network. Platform admin
  /// only, audited, and stated on the form.
  allowsPrivateAddress Boolean @default(false) @map("allows_private_address")
  /// Seeded by the migration rather than created by an operator. Drives
  /// whether the row may be deleted and whether env-held OAuth secrets are
  /// still consulted.
  isBuiltIn   Boolean  @default(false) @map("is_built_in")
  enabled     Boolean  @default(true)
  createdBy   String?  @map("created_by")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz

  @@index([enabled])
  @@map("mcp_catalog_entries")
}

enum McpAuthType {
  SERVER_SIDE
  API_KEY_BEARER
  EXTERNAL_MCP
  /// Seeded only; not offered when creating an entry (out of scope).
  API_KEY_CUSTOM_HEADER
  OAUTH
  API_KEY
}
```

`McpAuthType` is a Postgres enum and stays one: the set of *authentication
shapes* changes when code changes, unlike the set of services. That is the
distinction this whole spec turns on, and it is worth having the schema state
it.

On `McpConnector` and `McpOAuthToken`: `providerSlug String?` → `String`, and
`provider McpConnectorProvider` eventually dropped. `@@unique([organizationId,
userId, provider])` moves to `providerSlug` in step 3.

`OrganizationSettings.allowedConnectors` needs **no migration**: it is already
`String[]`, and the seeded slugs are the strings it already holds.

It does need a code change that is easy to miss and would defeat the whole
feature: `apps/admin/src/app/(dashboard)/connectors/actions.ts` validates saves
with `isConnectorProvider` from `platform-contracts`, which knows only the
eleven. Until that validator asks the catalogue instead, a newly added
connector cannot be granted to any organization — the row exists, the gallery
can show it, and the allowlist page refuses to save it. This is exactly the
per-organization restriction the brief asks for, which is why the `p0` e2e
below covers it.

## Failure modes

| Situation | Behaviour |
|---|---|
| Admin saves a URL that is not an MCP server | Nothing breaks until a user connects. Mitigated by Test connection, which is offered but not mandatory — a server that is temporarily down should not block creating its entry. |
| Admin points an entry at a private address | Refused unless `allowsPrivateAddress` is on, at save time and again at connect time (DNS rebinding). |
| Admin deletes an entry with live connectors | Refused. The entry is disabled instead, which hides it from the gallery and stops new connections while existing `McpConnector` rows keep resolving. Deletion is allowed only once no connector references the slug. |
| An entry is disabled mid-conversation | The turn already loaded its tools; it finishes. The next turn does not see them. |
| A slug is reused after deletion | Prevented, and "zero referencing connectors" is not enough on its own: `allowedConnectors` arrays and vault paths are keyed by slug too, and the row below admits an array can still name a deleted one. So deletion requires zero referencing connectors **and** purges the slug from every `allowedConnectors` array and every vault path that carries it; a slug that cannot be fully purged cannot be deleted, only disabled. Otherwise a reused slug inherits an old allowlist entry or an old token — the quietest possible way for one operator's server to be handed another's credentials. |
| Two entries expose tools with the same name | The MCP client namespaces per connector, as it does today for eleven. No new failure, but Test connection surfaces the names so an operator can see a collision coming. |
| OAuth client secret rotated upstream | Every existing token keeps working until it refreshes, then fails to `ERROR` with `lastError` set. The admin re-stores credentials; no row changes. |
| Vault unreachable when an admin stores credentials | The action fails and the row keeps `oauthCredentialsStored = false`. Nothing half-succeeds: the row is written only after the vault confirms. |
| Vault unreachable at connect time | Existing behaviour, unchanged — the connector goes to `ERROR` with the reason. |
| A behaviour pack exists for a slug that has no row | Ignored. The resolver keys on rows, so a leftover pack is dead code, caught by `every-seeded-connector-resolves.test.ts` from the other direction. |
| An older service reads a `providerSlug` value it has no enum member for, mid-migration | Cannot happen if the four steps are followed: step 2 deploys every reader before step 3 makes the slug authoritative. This is the failure the expand/contract exists to prevent, and skipping step 2 reproduces exactly the enum hazard the lesson file documents. |
| `allowedConnectors` holds a slug whose entry was deleted | Filtered out on read, as an unknown value already is. The admin page shows the stale value with a "no longer in the catalogue" marker rather than silently dropping it. |

## Phases

Each phase leaves the application working.

### Phase A — the catalogue exists, and nothing reads it

- [x] **A1.** `McpCatalogEntry` + `McpAuthType`, migration, the case-insensitive
      slug index, and the seed of the eleven — slugs equal to the current enum
      values, `isBuiltIn = true`, `mcpServerUrl` null. The seed is a script that
      imports `apps/web`'s `PROVIDER_LIST`, because that is the only place the
      full manifest exists.
- [x] **A2.** Contracts (`McpCatalogEntryDto`, the slug validator, the
      behaviour-pack resolver) in `packages/platform-contracts`, and the Prisma
      loader as a **thin per-app binding** — the split `tenant-scope` already
      uses, and the only one available: `platform-contracts` is imported by
      `'use client'` components and is policed by
      `client-bundles-stay-browser-safe.test.ts`, so a Prisma query cannot live
      there.
- [x] **A3.** `apps/admin` → `/mcp-catalogue`, **read-only**: the list, each
      entry's auth type, resolved server URL and which organizations may use
      it. An operator sees the catalogue before they can change it, and nothing
      on the page claims an effect it does not have.

### Phase B — the column stops being an enum

Expand and contract. This is the phase to rehearse on demo, and B2 is the large
step — not B4.

- [x] **B1.** Add `providerSlug String?` to `McpConnector` and `McpOAuthToken`;
      backfill from `provider::text`; write both columns everywhere. Additive,
      no reader changes.
- [x] **B2.** Every reader reads `providerSlug ?? provider`. **This is where the
      57 sites stop typechecking**, because the expression widens to `string`:
      annotations, DTOs, function signatures and the two `packages/` files all
      change here, plus the four enum casts in
      `scripts/screenshots/demo-data.sql`. Behaviour is unchanged; the diff is
      not small.
- [x] **B3.** `providerSlug` `NOT NULL`, uniqueness moved to it, writes to
      `provider` stopped.
- [x] **B4.** Replace `PROVIDER_REGISTRY`'s `Record<McpConnectorProvider, …>`
      with the runtime resolver, and add
      `tests/architecture/every-seeded-connector-resolves.test.ts` — **while the
      enum still exists**, so this step is deployable and reversible on its own.
- [x] **B5.** Drop `provider` and the `McpConnectorProvider` type; update
      `packages/platform-contracts/src/__tests__/connectors.test.ts`, which
      parses that enum out of `schema.prisma` and fails the moment it is gone.
      Nothing else ships in this release.

### Phase C — an operator can add one

- [x] **C1.** Move `private-address.ts`, `guarded-fetch.ts` and
      `guarded-mcp-transport.ts` into `packages/connector-guard`; wire
      `apps/web`'s MCP client and connect/callback routes through it. This
      lands **before** anything can save a URL, and it closes a gap that
      predates this spec: `apps/web` has never checked connector addresses.
- [x] **C2.** `/mcp-catalogue` becomes writable for `SERVER_SIDE` and
      `API_KEY_BEARER` entries — create, edit, enable, disable,
      delete-when-unused — **with the address policy and `allowsPrivateAddress`
      in the same step**. A form that saves a URL and a check on that URL are
      one change: shipping the first alone hands a platform admin an
      unvalidated endpoint the server will open a session against.
- [x] **C3.** Icon handling — a brand asset URL or an upload through the
      storage abstraction (ADR-27), plus the lucide fallback — before entries
      can be created, so none is created without one.
- [x] **C4.** The allowlist validator in
      `apps/admin/.../connectors/actions.ts` asks the catalogue instead of
      `isConnectorProvider`. Without this a new entry cannot be granted to any
      organization.
- [ ] **C5.** Test connection — opens an MCP session, lists tool names, renders
      failures the way `lastError` / `lastErrorAt` already do.

### Phase D — OAuth entries

- [ ] **D1.** Catalogue-scoped credential storage in ragen-token-vault;
      `oauthCredentialsStored` written only after the vault confirms.
- [ ] **D2.** `connect/route.ts` and the API counterpart read credentials from
      the vault for row-defined entries, env for built-ins.
- [ ] **D3.** `EXTERNAL_MCP` offered in the entry form, with scopes and
      `useUserScope`. End-to-end proof: add Notion from the panel and connect
      it as a user, on demo, before this phase is called done.

### Phase E — the seams that outlive it

- [ ] **E1.** `docs/mcp-integrations.md` rewritten around rows; a Task Router
      row; an ADR for "the connector catalogue is data, not an enum".
- [ ] **E2.** `packages/create-ragen-app`: a fresh install gets the seeded
      catalogue and no per-connector environment variables beyond those a
      built-in still needs.

### Later, deliberately not now

**Retiring the duplicated manifest directory in `apps/api`.** It is the daily
cost named in Problem and it is genuinely worth doing — which is exactly why it
does not belong here: an operator can add Notion without it, it would ride on
this migration's momentum, and it is the step most likely to be dropped for
time while this spec still reads as finished. Its own spec, after B5.

Also later: `API_KEY_CUSTOM_HEADER` entries created from the panel;
org-private entries; pulling the catalogue from an external MCP registry;
per-entry tool allowlists.

## Testing

**Unit**: the resolver (row + optional behaviour pack, including a row with
none and a pack with no row); slug validation and immutability; the SSRF policy
against catalogue URLs including the `allowsPrivateAddress` path; the seed
producing exactly the eleven current slugs.

**Integration**: `providerSlug ?? provider` through B1–B3 with rows written
under each scheme; the vault round trip for catalogue credentials; Test
connection against a stub MCP server.

**Architecture**: `every-seeded-connector-resolves.test.ts` replacing the
enum's compile-time guarantee; `connector-dto-agrees.test.ts` updated for the
column rename.

**E2E**, in the tier that gates a merge: a **new** `p0-` spec covering an
organization whose `allowedConnectors` permits one slug and not another. New is
the operative word — the only connector spec today is
`apps/web/e2e/p1-33-connectors.spec.ts`, and a `p1` does not gate the PR that
breaks it. This is the per-organization restriction the brief asks for and the
one behaviour a column rename could silently break.

**Manual, and named because nothing else covers it**: adding Notion from the
panel on demo and connecting it as a real user. D3 is not done without it.

## Rollout and rollback

Phase A is additive and revertible by reverting the code; the table stays,
seeded and unread.

Phase B is the one that needs care. Each step is independently deployable, and
the order is the whole safety argument:

- After B1 both columns are written; reverting B1 leaves `providerSlug`
  populated and ignored.
- B2 is the big diff and the safe one: every service reads the new column with
  a fallback, and this is a state it is safe to sit in for as long as needed.
- B3 is the first step that is not trivially reversible — reverting it means
  writing `provider` again for rows created since. Take it only once B2 has
  been on demo through a full connector connect and token-refresh cycle.
- B4 replaces the compile-time registry while the enum is still there, so it
  reverts by reverting code.
- B5 is irreversible without a restore. Nothing else ships in that release.

Phases C and D revert by reverting code, and it is worth being exact about what
that costs rather than reassuring: the runtime resolver treats an unknown
`authType` as "not connectable" rather than throwing, so nothing crashes — but a
customer who connected an operator-defined external server before the revert
finds it stops connecting, which is a broken connector from the only seat that
matters. Nothing crashing is not nothing happening. So reverting D is gated the
way B3 is: the admin action refuses while any `EXTERNAL_MCP` connector row
exists, and taking the revert anyway is a decision made with that count on
screen. Phase D should not reach a deployment carrying real connectors until it
has been through demo for a full connect and token-refresh cycle.

There is no feature flag over the catalogue: an entry's `enabled` is the
switch, and an operator who wants none of this simply never adds a row.
