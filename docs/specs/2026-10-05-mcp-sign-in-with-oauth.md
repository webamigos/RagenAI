---
title: Signing in to the Ragen MCP server with OAuth
status: approved
areas: [auth, api, mcp, knowledge-base]
adrs: [13, 21, 36, 39, 50]
---

# Signing in to the Ragen MCP server with OAuth

## TLDR

Today `apps/mcp` accepts only a Ragen API key, which a person has to copy
into their MCP client. claude.ai and ChatGPT connectors don't take a pasted
key. They sign in with OAuth 2.1. This spec adds OAuth as a second way in,
next to API keys: `apps/web` (Better Auth) issues the tokens, `apps/mcp`
checks them, and `apps/mcp` then calls `apps/api` as a trusted service on
behalf of the signed-in user (variant (a)). The non-obvious part is that last
hop. The token's audience is `apps/mcp`, so the MCP spec forbids passing it on
unchanged to `apps/api`. The way `apps/mcp` speaks for a user to `apps/api`
is the new trust boundary this spec has to get right.

## Decisions

Answered 2026-10-05; every one as recommended. The rest of the spec refers to
them by number.

- **Q1. A grant binds to an organization plus an optional assistant**, the
  same boundary an API key's `knowledgeScope` draws. A user who connects "the
  HR assistant" to claude.ai does not hand over every assistant in the
  organization.
- **Q2. `apps/mcp` vouches for the user with its own secret,**
  `MCP_SERVICE_SECRET`, checked by a new guard on the three routes the MCP
  tools call. Not `SESSION_AUTH_SECRET`, and not RFC 8693 token exchange. See
  "The hop from `apps/mcp` to `apps/api`".
- **Q3. Two gates:** a deployment env var, `MCP_OAUTH_ENABLED`, for the
  discovery documents and the authorization server, and a per-org feature key,
  `mcpOAuth` (default `false`), checked at consent and on every call.
  Discovery runs before anyone has signed in, so a per-org key cannot gate it.
- **Q4. Any member may connect an app** in an organization that has `mcpOAuth`
  on. The token never grants more than the member already sees in the panel.
- **Q5. Dynamic client registration is open** (RFC 7591), because claude.ai
  registers itself without credentials. It sits behind a redirect-URI guard
  and a per-IP rate limit. Client ID Metadata Documents may come later as an
  addition, not a replacement.

## Problem

- Someone who wants to use a Ragen assistant from claude.ai, Claude Desktop
  or ChatGPT cannot. Those clients add a remote MCP server as a "connector"
  and expect OAuth 2.1 with discovery (RFC 9728, RFC 8414), dynamic client
  registration and PKCE. A static `Authorization` header is supported only
  by developer clients (Claude Code, Cursor, the MCP Inspector).
- An API key is an organization credential, shown once and pasted into a
  config file. Handing one to every employee who wants an assistant in
  claude.ai means one long-lived secret per person, stored outside Ragen,
  revocable only by an admin.
- `ADR-36` says `apps/mcp` needs "no OAuth callback to serve, since the
  caller already has a Ragen API key". That held while the only callers were
  developers. It does not hold for end users.

What already works and does not change: `apps/api` resolves document
visibility per user. `ChatService` and `ChatCompletionsService` call
`folders.getMembershipContext(orgId, userId)`, and for an API key `userId` is
the key's creator. An OAuth caller gets the same per-user retrieval scope for
free, as long as the request reaches `apps/api` with the right `userId`.

## Out of scope

- **Write tools.** The three tools stay as they are: `ragen_chat`,
  `ragen_search_knowledge_base` and `ragen_list_assistants`. OAuth scopes
  reserve `mcp:write`, but nothing issues it.
- **OAuth for the public REST API** (`apps/api` `/v1/*` called directly).
  Only `apps/mcp` accepts OAuth tokens. `apps/api` keeps API keys and the
  service guard from Q2.
- **Removing or replacing API keys.** Keys stay the way in for scripts, CI
  and developer MCP clients.
- **Client ID Metadata Documents, DPoP, token introspection.** DPoP-bound
  tokens are refused, not supported.
- **Platform-admin management of OAuth clients** in `apps/admin`. A user
  disconnects their own apps in `apps/web`; an org admin's view of everyone's
  connections is a follow-up (ADR-35 decides which app it lives in).
- **Anything in `ragen-connectors`.** That is Ragen consuming other MCP
  servers. This spec is the reverse direction.

## Proposed solution

### Roles

| Role                 | Who                         | What it does                                                                                       |
| -------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| Authorization server | `apps/web`, Better Auth     | sign-in, picking the organization and assistant, consent, issuing and refreshing tokens, JWKS     |
| Protected resource   | `apps/mcp`                  | RFC 9728 metadata, the 401 challenge, verifying the access token, mapping it to a user and an org |
| Data                 | `apps/api`                  | unchanged business logic; a new guard accepts `apps/mcp`'s service assertion on three routes     |

Users sign in only at `apps/web`. That is the rule ADR-21 already set for
`SessionAuthService`, and this keeps it: no app other than `apps/web` reads a
Better Auth session.

### Authorization server in `apps/web`

`better-auth` goes from `^1.7.2` to `^1.7.7`, and adds `@better-auth/mcp`
(the MCP preset over `@better-auth/oauth-provider`) plus the `jwt()` plugin.
Not the 1.6-era `mcp` plugin from `better-auth/plugins`: that one stores
tokens in plaintext, ignores RFC 8707 `resource`, and has no hook for "which
organization does this token act for". `@better-auth/oauth-provider` hashes
tokens and client secrets by default, binds tokens to a resource, and has
`postLogin` + `consentReferenceId`, which is where the organization choice
goes.

Configuration, in a new non-`'use server'` module beside `src/lib/auth.ts`:

- `resource` = the public URL of `apps/mcp`'s endpoint, e.g.
  `https://mcp.ragen.ai/mcp`, from a new env var `RAGEN_MCP_PUBLIC_URL`.
  Declared explicitly in `resources` with `allowedScopes` listing every scope
  we issue. The plugin writes `null` for "unrestricted", which Prisma reads
  back as `[]`, and `[]` allows no scope at all.
- Scopes: `openid`, `offline_access`, `mcp:read`. `mcp:write` is declared but
  not grantable yet.
- Grants: `authorization_code` with PKCE S256 always, and `refresh_token`.
- Access token: a JWT, 15 minutes, `aud` = the resource, claims `org`
  (Better Auth's `Organization.id`, which `Member`, `ApiKey` and `Project`
  all reference), `project` (optional, Q1), `scope`,
  `client_id`. Refresh token: rotating, 30 days.
- Dynamic client registration: open (Q5). A `before` hook on
  `/oauth2/register` refuses any redirect URI that is not `https://`, or
  `http://` on `localhost` / `127.0.0.1`. Loopback clients (Claude Code) must
  register as `application_type: "native"`; the plugin refuses loopback
  redirects for web clients. Per-IP rate limit on the endpoint.
- Discovery documents at the origin root, outside Better Auth's base path:
  `/.well-known/oauth-authorization-server` and
  `/.well-known/openid-configuration`, as Next route handlers that hand the
  request to `auth.handler`.

### The flow

1. The client calls `apps/mcp` without a token. `apps/mcp` answers `401` with
   `WWW-Authenticate: Bearer resource_metadata="<mcp-origin>/.well-known/oauth-protected-resource"`.
2. Protected-resource metadata (served by FastMCP's built-in
   `oauth.protectedResource` option) names the resource, the authorization
   server (the `apps/web` issuer) and the scopes.
3. The client reads the authorization-server metadata from `apps/web`,
   registers itself, and opens `/api/auth/oauth2/authorize` with
   `resource=<mcp-origin>/mcp`.
4. Not signed in: the normal sign-in page, which resumes the flow afterwards.
   Magic link and every other sign-in method keep working, because the flow
   only needs a session at the end.
5. **Post-login page** `/[locale]/connect/workspace`: the user picks an
   organization from their memberships, then optionally one assistant (Q1).
   Only organizations with `mcpOAuth` on are offered (Q3). The pick is stored
   against the session *and the client* (two connect flows in one browser
   must not overwrite each other's pick) and becomes `consentReferenceId` =
   `"<orgId>:<projectId|all>"`.
6. **Consent page** `/[locale]/connect/consent`: the client's name, its
   redirect host, the chosen organization and assistant, and the scopes. The
   redirect host is the one thing that tells a user a lookalike client from
   the real one, so it is shown prominently, not in small print.
7. The token endpoint issues the access and refresh tokens. The org and
   project claims come from the consent reference id, re-validated against
   the live membership when the token is minted.

### `apps/mcp`: two kinds of credential

`authenticate` branches on the token's shape:

- `sk-…` is the API-key path, unchanged: the header is forwarded to
  `apps/api` and `ApiKeyGuard` decides.
- Anything else is verified as a JWT: signature against `apps/web`'s JWKS
  (`jose`'s `createRemoteJWKSet`, cached, refetched on an unknown `kid`),
  then `iss`, `aud` = this resource, `exp`, and `scope` containing
  `mcp:read`. A DPoP-bound token is refused. Failure is `401` with
  `error="invalid_token"`. A missing scope is `403` with
  `error="insufficient_scope"`.

`RagenSession` becomes a union:

```ts
type RagenSession =
  | { kind: 'api_key'; apiKey: string }
  | { kind: 'oauth'; accessToken: string; userId: string; orgId: string;
      projectId?: string; clientId: string; expiresAt: number };
```

**Expiry inside a long session.** With the installed versions (fastmcp
3.35.0 over mcp-proxy 6.7.13), `authenticate` runs on every POST, so an
expired token already gets a 401 with `WWW-Authenticate`. But the `session`
a tool's `execute` receives is captured once, when the MCP session is
created. After the client refreshes on the same `mcp-session-id`, a tool
would still see the old token, its old expiry and its old identity. So a
tool must never take identity from a stateful session. The default is
`stateless: true`, where every request builds its session from the token it
carries. D1 confirms that the three tools work stateless, and records the
fallback (read identity from the current request) only if they do not.

### The hop from `apps/mcp` to `apps/api` (Q2)

`apps/mcp` cannot forward the user's access token: its audience is
`apps/mcp`, and the MCP authorization spec forbids token passthrough. So
`apps/mcp` speaks for the user with its own credential.

**Chosen (Q2): a dedicated service assertion.**

- A new shared secret, `MCP_SERVICE_SECRET`, held by `apps/mcp` and
  `apps/api` only.
- `apps/mcp` signs a short-lived assertion per call (HMAC, 30 s TTL)
  carrying `typ: "mcp"`, `userId`, `orgId`, `projectId?`, `clientId` and the
  access token's `jti`. It is sent as `Authorization: Bearer
  mcp.<payload>.<sig>`, and the signature covers the `mcp.` prefix too. The
  session-token format in `issue-session-token.ts` has no type field, so a
  copy of it would tell the two tokens apart only by which secret signed
  them. Both services refuse to boot when `MCP_SERVICE_SECRET` equals
  `SESSION_AUTH_SECRET`, which matters for installs that generate both.
- A new `McpServiceGuard` in `apps/api` verifies it and then runs the live
  checks a key gets from its row: the `Member` row still exists for that user
  in that organization, the user is not banned, the organization has
  `mcpOAuth` on, and, with a project, the member can view that project
  (`getEffectiveProjectPermission(...).canView`, the panel's own rule), not
  merely that it belongs to the organization. Only then does it build the same `ApiContext` the controllers
  already read.
- The guard is accepted only on `POST /v1/chat`, `POST /v1/search` and
  `GET /v1/assistants`, via a composite guard (`ApiKeyGuard` or
  `McpServiceGuard`) on those three handlers. Today `@UseGuards(ApiKeyGuard)`
  sits at class level on all three controllers, and Nest ANDs class and
  method guards, so a handler-level "either" would still be refused.
  `ChatController` and `SearchController` swap the class guard for the
  composite one. `AssistantsController` moves to per-handler guards instead,
  because swapping its class guard would open create, update and delete to
  MCP assertions. Those three stay API-key only, and a test says so.
- `throttleTracker` gets an MCP-assertion branch that counts against
  `user:<userId>`. Without it every OAuth call arrives from `apps/mcp`'s one
  IP, and every user in every organization shares one per-IP bucket.

Why not the alternatives:

- **Reuse `SESSION_AUTH_SECRET`.** That secret already authorizes every
  `SessionAuthGuard` route: documents, folders, threads, connectors. Giving it
  to `apps/mcp`, the one app that faces the public internet with no session
  of its own, would let a compromise of `apps/mcp` act as any user on all of
  them. A separate secret on three routes bounds that to what the MCP tools
  can already do.
- **RFC 8693 token exchange at `apps/web`.** The textbook answer: `apps/mcp`
  trades the user's token for one with `aud` = `apps/api`. Better Auth 1.7
  does not ship it, so it would be our own grant type on a library-owned
  token table ("a library that owns a table also owns how it is queried").
  Worth revisiting if a second resource ever needs user tokens.
- **Variant (b): `apps/api` accepts the MCP token itself.** Rejected when
  choosing variant (a). It needs `apps/api` to trust a token whose audience is
  another service, which is the passthrough the spec forbids, only moved.

`ApiContext` changes in one place. `keyId: KeyId` becomes
`credential: { type: 'api_key'; id: KeyId } | { type: 'oauth'; id: string }`,
where the OAuth id is `"<clientId>:<userId>"`. Today `keyId` is assigned in
the guard and read nowhere else, so this is cheap. `knowledgeScope` is
`'ASSISTANT'` when the grant names a project and absent when it does not,
which `AssistantScopeService` reads as "no key boundary".

**That is not enough for an org-wide grant.** With no boundary,
`AssistantScopeService.resolve` checks only that a project is in the
organization, and `AssistantsService.list` returns every project in it. That
is right for an API key, an organization credential. It is wrong for a
person: a plain member would list and chat with colleagues' private
assistants and read their instructions. So for an OAuth credential, `list`
returns only projects the member can view, and `resolve` refuses a project
the member cannot view, with the same `getEffectiveProjectPermission` rule
the panel uses. Folder membership still limits retrieval inside a project, as
it does today. `debugMode` is `false` and `teamId` absent for an OAuth
context.

### Revocation

A **Connected apps** section in the user's account settings: one row per
client the user has consented to, with the organization it acts for and its
last use, and a **Disconnect** button. Disconnect deletes the consent and the
client's refresh and access tokens for that user, through the plugin's API,
not with Prisma directly. An access token already issued lives until it
expires, at most 15 minutes. Membership removal, a ban and turning
`mcpOAuth` off take effect on the next call, because `McpServiceGuard`
reads them live.

## Core surfaces touched

| Surface                                  | Change                                                                                   | What catches a mistake                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                   | the plugin's OAuth tables + `jwks`; one table for the post-login pick                    | an additive migration on a throwaway DB, plus `npm run verify`                                           |
| Better Auth tables                       | new library-owned tables; `better-auth` minor bump                                       | `tests/architecture/`, `test-e2e` (sign-in end to end), the `ragen-upgrade-dependency` skill            |
| `src/lib/auth.ts`                        | two plugins, a registration hook                                                         | its unit tests, `test-e2e`                                                                               |
| `apps/api` `ApiContext` and guards       | `credential` union; `McpServiceGuard`; guards on three routes; throttle; assistant visibility | guard unit tests; a test that every other `ApiKeyGuard` route still refuses an MCP assertion            |
| `packages/platform-contracts`            | feature key `mcpOAuth`                                                                   | package tests, `shared-contracts-are-not-recopied.test.ts`                                               |
| `packages/env`                           | `MCP_SERVICE_SECRET` (mcp + api), `RAGEN_MCP_PUBLIC_URL` (web + mcp), `MCP_OAUTH_ENABLED` | a fragment shared by the apps that read it, plus each app's env schema tests                            |
| `packages/create-ragen-app`              | the new secret generated at install, the public MCP URL asked for                        | its tests + `create-ragen-app-manifest-is-current.test.ts`; said in the PR description                  |
| `apps/mcp`                               | JWT verification, protected-resource metadata, the service assertion                     | its own tests, including a real server started in a test                                                 |

## Data model

- **Plugin tables.** Whatever `@better-auth/oauth-provider` 1.7.7 declares,
  taken from the installed package's schema in step A1, not written from
  memory. At the time of writing that is `oauthClient`, `oauthAccessToken`,
  `oauthRefreshToken`, `oauthConsent`, plus `jwks` from `jwt()` and the MCP
  preset's resource table. Mapped to snake_case columns like every other
  Better Auth table. String ids, as Better Auth tables keep.
- **Null scalar lists.** The plugin writes `null` to unset `string[]`
  columns. Prisma rejects that on write and reads NULL as `[]`. The adapter
  layer drops those nulls for the OAuth models, and a test keeps its field
  list in sync with the schema, so a new plugin column cannot slip past.
- **`mcp_connect_selections`**: `sessionId` (FK to `sessions`, cascade) and
  `clientId`, together the primary key; `userId`, `organizationId`,
  `projectId?`, `createdAt`. A pick older than 10
  minutes is treated as absent, so a later connect asks again.
- **Not `McpOAuthToken`.** That existing model stores tokens Ragen holds as
  an MCP *client* of other servers. The new tables are Ragen as an
  authorization server. Different direction, never joined; the schema comment
  on each says so.
- **Rows written before this change:** none of these tables exist yet, so no
  backfill. `ApiKey` and every existing table are untouched.

## Failure modes

- **`apps/web` unreachable when `apps/mcp` needs the JWKS.** A cached key set
  keeps verifying. A cold start with no cache refuses OAuth tokens with `503`.
  API keys are unaffected.
- **Signing key rotated.** An unknown `kid` triggers one JWKS refetch, rate
  limited, then a `401`.
- **Token expired mid-session.** See "Expiry inside a long session": a `401`
  the client refreshes on. Never a silent extension.
- **Member removed, member leaves, organization deleted, user banned.** The
  refresh token still works at the token endpoint until it is revoked, but
  every call fails in `McpServiceGuard`. Step E1 revokes the user's grants in
  that organization on every one of these paths, so a dead grant does not
  linger in Connected apps.
- **One client connected to two organizations.** The plugin keeps one consent
  per client and user. Connecting the same app to a second organization
  replaces the first grant and revokes its refresh tokens. Connected apps shows
  the organization the grant currently acts for. Two organizations at once
  from one app is a follow-up, if anyone asks.
- **Private assistants in an org-wide grant.** Covered by the per-member
  project check in `list` and `resolve`. A test lists assistants as a member
  who owns none and is shared none, and expects only public ones.
- **`mcpOAuth` turned off for an org.** Calls fail at once in the guard.
  Existing grants stay listed, so turning it back on does not make every user
  reconnect.
- **Hostile client registration.** Open DCR lets anyone register a client
  named "Ragen". The redirect-URI guard limits where a code can go, and the
  consent page shows the redirect host. A consent screen is the defence
  against a lookalike, so it must not be skippable for a first-time client.
- **Registration flood.** Per-IP rate limit on `/oauth2/register`. Unused
  clients are pruned after 30 days with no consent.
- **`MCP_SERVICE_SECRET` leaked.** The holder can call three routes as any
  user. Rotation is changing it in both services; assertions live 30 s, so
  nothing in flight needs migrating. This is the residual risk Q2 accepts.
- **Replay of a service assertion.** 30 s TTL, and the `jti` of the access
  token is logged with each call so a replay is at least visible.
- **Two requests race on a refresh token.** Rotation in the plugin; the loser
  gets `invalid_grant` and the client signs in again. Accepted.
- **Usage ceilings.** `ChatService` and `SearchService` already check the
  monthly ceilings per organization, and an OAuth call reaches the same code
  with the same `orgId`. Listing assistants costs nothing and has no ceiling.
  Step C3 asserts it with a test, because a limit is a call site.

## Phases

Each phase leaves the application working. Everything new is off until
`MCP_OAUTH_ENABLED=true` on the deployment and `mcpOAuth` on for an
organization (ADR-50).

### Phase A — plugin in place, nothing reachable

- [x] **A1.** (#1572) `better-auth` and `@better-auth/stripe` to `^1.7.7`;
  `apps/admin`'s range with them. Read the 1.7.3–1.7.7 changes for sign-in,
  session, organization and member queries against our direct writes (seed,
  the user-creation hook). Behaviour-neutral, its own PR, `test-e2e` green.
  *As landed:* 1.7.3+ checks the Prisma schema against every plugin at
  runtime and refuses all auth requests on a mismatch. That needed a
  migration for five `subscriptions` columns `@better-auth/stripe` always
  declared. The prisma adapter also reads `_runtimeDataModel` at
  `betterAuth()` time, which `apps/admin`'s lazy client proxy now answers
  without building a client. The plugin tables in A2 are covered by the same
  runtime check, so a missing column there fails sign-in in `test-e2e`, not
  silently.
- [x] **A2.** `@better-auth/mcp` + `jwt()` registered only when
  `MCP_OAUTH_ENABLED=true`. Additive migration for the plugin tables and
  `mcp_connect_selections`, checked on a throwaway database first. The
  null-list adapter and its field-list test. Env fragment for the new vars.
  *Implementation prepared 2026-10-06:* the preset and JWT are conditional,
  with explicit resource scopes, a 15-minute access TTL, a 30-day refresh TTL
  and strict refresh rotation. DCR and token claims remain closed until B.
  The installed 1.7.7 schema also declares `oauthClientResource` and
  `oauthClientAssertion`; these are included in the additive migration.
  The Prisma extension normalizes list writes, including transactions and
  bulk/upsert operations, and relations follow the Prisma adapter's join
  names. All 91 migrations replayed on disposable PostgreSQL (PGlite);
  real Better Auth + Prisma sign-up/sign-in passed with the plugins enabled
  and disabled, as did resource seeding, list create/update and an OAuth join.
  The installer generates a separate service secret and writes the local MCP
  URL. Local full-gate and Playwright results are recorded below.

### Phase B — authorization server in `apps/web`

- [x] **B1.** Root discovery routes, the registration guard and its rate
  limit. Unit tests for every redirect-URI case.
- [x] **B2.** The post-login page: organizations with `mcpOAuth` on, then
  assistants the member can see. Feature key `mcpOAuth` in
  `platform-contracts`, default `false`.
- [x] **B3.** The consent page and the token claims. Proof: the MCP Inspector
  against a local stack completes the flow and gets a JWT whose claims match
  the pick.

### Phase C — `apps/api` accepts `apps/mcp`'s assertion

- [x] **C1.** `ApiContext.credential` replaces `keyId`. No behaviour change.
- [x] **C2.** `McpServiceGuard` with its live checks; the composite guard on
  chat and search; per-handler guards on `AssistantsController`. Tests: every
  other `ApiKeyGuard` and `SessionAuthGuard` route refuses an MCP assertion,
  and so do `POST`, `PATCH` and `DELETE` on `/v1/assistants`.
- [x] **C3.** Per-member project visibility in `AssistantsService.list` and
  `AssistantScopeService.resolve` for an OAuth credential. API keys keep
  seeing every project in the organization.
- [x] **C4.** The `throttleTracker` branch. Tests that an OAuth-credentialed
  request hits the usage ceilings, a per-user throttle bucket and the
  folder-membership retrieval scope.

### Phase D — `apps/mcp` speaks OAuth

- [x] **D1.** Switch to `stateless: true` and run the three tools against
  Claude Code and the MCP Inspector. Record the result here.
- [x] **D2.** Protected-resource metadata, the 401/403 challenges, JWT
  verification with a cached JWKS, and the `RagenSession` union.
- [x] **D3.** The service assertion on every call to `apps/api` for an OAuth
  session. A test that an OAuth session's access token never appears in an
  outgoing request.
- [x] **D4.** Connected apps in account settings, with Disconnect. It comes
  before the first real connection, so nobody on demo connects an app they
  cannot disconnect.
- [ ] **D5.** End to end on the demo environment: claude.ai custom connector
  added, sign-in, a chat answer, a search, the assistant list, Disconnect.

### Phase E — revocation and docs

- [x] **E1.** Removal, leaving, organization deletion and a ban revoke the
  user's grants in that organization.
- [x] **E2.** A new ADR records the decision and amends ADR-36's "auth is the
  caller's API key" paragraph. `create-ragen-app` updated (secret, public
  MCP URL). ragen-docs: connecting from claude.ai. A changelog note.

## Testing

- **Unit:** the registration guard, claim mapping, JWT verification (each of
  `iss`/`aud`/`exp`/`scope`/DPoP failing alone), the assertion format,
  `McpServiceGuard`'s live checks, the null-list adapter.
- **Integration:** `apps/mcp` started for real in a test, against a stub
  JWKS and a stub `apps/api`, so the 401 challenge and the outgoing assertion
  are read off the wire, not off a mock of our own client.
- **E2E:** `p0-` spec for the consent flow in `apps/web`, from authorize to
  code, because it touches sign-in and must gate the PR that breaks it. The
  claude.ai connector itself cannot run in CI; D5 is a manual check on demo,
  recorded in `docs/regression-checklist.md`.

### A2 local validation — 2026-10-06

- All 91 migrations replayed on an empty disposable PostgreSQL (PGlite).
  Selection keys isolate clients within a session; session deletion cascades.
- Real Better Auth + Prisma sign-up/sign-in passed with OAuth enabled and
  disabled, along with resource seeding, null-list writes, adapter joins and
  refusal of dynamic registration.
- `npm run verify -- --continue=always`: 69 of 70 tasks passed, including
  every application build, typecheck, lint and test suite. Four root
  architecture tests failed; the same failures were reproduced on unchanged
  `main`: an untracked `packages/db` cache directory is counted as a workspace,
  and the sibling documentation's environment reference is stale.
- The final malformed-URL validation fix passed the env build, 13 env tests
  and 33 focused web tests.
- Docker Desktop supplied PostgreSQL, Redis and Qdrant. Pending migrations
  were applied only to the dedicated `ragen_e2e` database. Playwright smoke
  04–06 (sign-in validation, sign-in success, sign-out success) passed 3/3
  with OAuth disabled and 3/3 with `MCP_OAUTH_ENABLED=true`.
- This covers phase A2. Phases B–E and the real OAuth connector flow remain
  unimplemented; no demo rollout has been performed.

## Rollout and rollback

- Order: A1 alone, then A2…E behind `MCP_OAUTH_ENABLED` (deployment) and
  `mcpOAuth` (per org). Demo first; there is no production yet.
- **Turning it off:** `MCP_OAUTH_ENABLED=false` removes discovery, the
  authorization endpoints and OAuth verification in `apps/mcp`. API keys keep
  working throughout. Per org, `mcpOAuth` off stops calls immediately.
- **Rolling back the code:** the migration is additive. Reverting the code
  leaves the OAuth tables unused and harmless. They are dropped in a
  follow-up migration only if the feature is abandoned.
- **Rotating `MCP_SERVICE_SECRET`:** change it in `apps/mcp` and `apps/api`
  together. Assertions live 30 s, so the window of refused calls is a deploy.


### Phase B local validation — 2026-10-06

Root discovery, guarded dynamic registration, workspace selection and consent
are implemented behind the deployment and organization gates. The browser E2E
completes sign-in, selects an organization and assistant, accepts consent,
exchanges the PKCE code and verifies the issued JWT against the advertised
JWKS. It checks issuer, audience, user, organization, project, client, scope
and the 15-minute lifetime, then proves refresh is refused when the live
organization flag is disabled. Discovery and registration smoke tests pass.
B3's specific MCP Inspector proof remains pending until the protected-resource
phase makes the local MCP endpoint support OAuth. The browser test is evidence
for the authorization server, not a claim that the full MCP integration ships.

Final validation: OAuth discovery/registration, email sign-in, password
reset, sign-out and consent E2E passed (6/6) on Docker Desktop. The full
web unit suite passed separately (511 files, 5,046 tests). Full verification
completed all builds, lint and typechecks; four previously reproduced root
architecture failures remain (`packages/db` without a manifest, its missing
architecture entry, the resulting package count, and a stale configuration
reference in the sibling documentation checkout). One existing
`PublicShareDialog` test timed out while builds ran concurrently; all three
of its cases and the entire web suite passed on recheck without code changes.
CodeRabbit was unavailable in this session; a manual review checked the signed
query, live grant checks and provider administrative privileges.


### Phase C local validation — 2026-10-06

The API context now distinguishes API keys from OAuth credentials. A shared
`@ragenai/crypto/mcp-service` helper signs the typed `mcp.` namespace with a
dedicated secret and a 30-second lifetime. The API verifies it and checks the
live member, ban, organization flag and project permission before constructing
a context with debug disabled and no caller-supplied team.

The real AppModule test enumerates every controller: only chat, search and
assistant listing use the composite guard; every remaining API-key/session
handler rejects a correctly signed MCP assertion. OAuth assistant listing
filters permissions before pagination, and resolution applies the same panel
permission service even to a bound project. Tests prove the per-user throttle,
usage ceilings and caller folder membership also apply to OAuth.

The browser OAuth test now calls the real Docker-backed API with the selected
identity: it lists only the chosen assistant, rejects JWT passthrough, rejects
internal project reads and assistant POST/PATCH/DELETE, and refuses the next
API call after the organization's flag is switched off. Discovery, registration
and this complete flow passed (3/3). API tests passed (116 files, 1,312 tests),
and the assertion helper's 13 tests passed. No OAuth token is forwarded to the
API. Deployment and organization gates remain off by default.

Final phase C verification completed 69/70 tasks. All application builds,
lint, typechecks and tests passed; the sole failing task was the root suite's
four previously reproduced architecture failures described above.


### Phase D1 transport probe — 2026-10-06

HTTP now starts with `stateless: true`; stdio keeps its existing lifecycle.
A real FastMCP server and the official Streamable HTTP SDK run chat, search
and assistant listing twice. Changing the credential between calls changes
the credential reaching the API for all three tools, without reconnecting,
and no MCP session ID is created. All 19 MCP test files (114 tests) pass.

FastMCP 3.35.0 waits about one second for client capabilities on each
stateless request and logs a warning when it cannot infer them; the SDK calls
still succeed. The integration test has a 20-second budget for eight protocol
requests rather than the default five seconds. This proves SDK compatibility;
the specifically requested Claude Code and Inspector probes remain pending,
so D1's checkbox is not yet marked complete.

### D2/D3 verification — 2026-10-06

The real FastMCP HTTP integration test `oauth-http.test.ts` verifies public
protected-resource metadata, missing/invalid-token 401 challenges, the 403
insufficient-scope challenge, and one cached JWKS fetch. All three tools
run twice through the official MCP SDK with a changed JWT on the same client.
The mock API verifies every service assertion and its current user identity;
neither access token appears in outgoing authorization headers.
MCP verification: 21 files, 131 passing tests; typecheck and lint pass.
The follow-up `oauth-jwks-rotation.test.ts` verifies a real remote JWKS
rotation: cached keys are reused, an unknown kid is refused during JOSE's
default 30-second fetch cooldown, and a fresh set is fetched after that
cooldown and then cached. Issuer configuration accepts HTTPS origins and
loopback HTTP only, with no path, credentials, query or fragment; the
configured origin derives the Better Auth issuer and its `/api/auth/jwks`.
Final MCP verification: 22 files, 137 tests; typecheck and lint pass.
D1's named-client probes remain outstanding.

### D4 Disconnect API verification — 2026-10-06

The provider's `/oauth2/delete-consent` endpoint only deletes consent; it
does not revoke tokens. The gated `mcp-grants` Better Auth plugin adds
`POST /api/auth/mcp/disconnect` with session middleware and a consent id.
Its adapter transaction first verifies ownership and the MCP scope, then
deletes access tokens, refresh tokens and consents for that user/client.
The Prisma adapter enables real transactions only with MCP OAuth enabled.
The real-handler memory-adapter integration test signs up a user and proves
401 without a session, 404 for a foreign consent, 403 for a foreign origin
(with production CSRF checks explicitly enabled), and preservation of other
users' and clients' grants after a successful Disconnect.
D4 remains open for the account UI, last-use tracking, and Docker-backed
end-to-end verification of refresh refusal after Disconnect.

### D4 account settings and Docker verification — 2026-10-06

Account settings now lists this user's MCP clients once each, with workspace
and accessible assistant names, last use, and Disconnect. The gated plugin
API returns only display fields; inaccessible project/workspace labels are
not disclosed. All 17 locales translate the section and format its dates.
The Ragen-owned `McpGrantActivity` table records accepted MCP calls after
live guard checks and cascades on user or organization deletion. The additive
migration was applied only to Docker Desktop's `ragen_e2e` database.
The extended browser gate signs in, grants consent, calls the actual API,
checks live flag revocation, opens account settings, disconnects the client,
and proves refresh refusal plus zero refresh-token/consent rows for that
user/client. Playwright: 54 passed, 1 skipped (including dependent smoke
tests); the OAuth/Disconnect gate itself passed in 2.8 seconds. Production
web build, API/web typechecks and focused guard/integration tests passed.
Full verification completed with 69/70 tasks successful. It exposed a missing
crypto dependency in the MCP image and missing tenant-registry coverage for
McpGrantActivity; both are fixed. The two focused suites then passed 185
tests. A final root run passed 3999 tests and retained only the four proven
baseline failures (the ignored packages/db/.turbo directory and its tree/count
consequences, plus the stale sibling configuration reference). The real MCP
Docker Desktop image build is in progress separately.

### E1 organization lifecycle verification — 2026-10-06

The gated Better Auth plugin revokes access tokens, refresh tokens and consent
through its adapter transaction after successful remove-member, leave and
delete-organization endpoints. Scope derives from the server-returned member
or organization, not posted identifiers. Matching `referenceId` uses the
exact organization prefix including its colon separator.
The real-handler integration test now creates organizations and another user,
leaves one organization, removes that other member, and deletes an organization.
It verifies that all three token/consent tables lose only affected grants,
that the owner's grants survive removal of a different member, and that a
similarly prefixed neighboring organization survives organization deletion.
Seven focused tests, web typecheck and targeted lint pass. E1 remains open
for the admin-panel ban path and workspace replacement revocation.

### E1 ban and replacement verification — 2026-10-06

The admin ban action now revokes all of the banned user's OAuth grants through
a server-only Better Auth adapter transaction. The admin app registers the
provider schema without exposing OAuth issuer endpoints. Focused adapter tests
cover foreign users, unbanned users and the private endpoint; all 704 admin
tests and the production build pass. The web ban hook also uses the successful
server response, never the posted user id.

Accepting a new workspace consent replaces older workspace grants for the same
user and client. Every fresh authorization requires the workspace checkpoint;
only the signed continuation may reuse a live selection. The browser test
authorizes twice, verifies that exactly one consent remains and that the old
refresh token fails, then exercises permission changes and Disconnect. It
passes on Docker Desktop (1/1). The MCP production Docker image also builds
successfully, including the shared assertion package.

### E2 documentation verification — 2026-10-06

ADR-53 records the issuer/resource/API boundary, stateless requests, independent
service assertions, live permissions, replacement and revocation limits. ADR-36
now describes both authentication paths. A changelog note explicitly says the
feature is behind disabled deployment and organization gates. The installer
already generates the independent service secret and local public MCP URL.

The ragen-docs commit `ab305a6` adds claude.ai automatic client registration,
workspace consent, all three tools, Connected apps/Disconnect and self-hosting
configuration to the existing MCP pages. The generated configuration reference
is synchronized with its source. MDX syntax and docs.json checks pass; the ADR
reference, generated-reference and installer suites pass (41 tests).

### D1 named-client interoperability verification — 2026-10-06

MCP Inspector 2.9.0 CLI and Claude Code 2.1.282 both connected to the real built
FastMCP server with `stateless: true`, discovered the three tools and called
`ragen_list_assistants`, `ragen_chat` and `ragen_search_knowledge_base`.
Each returned `success: true`. The isolated transport fixture used a local
JWKS issuer and a signed 15-minute bearer JWT; its API accepted only valid
service assertions for the expected user. It recorded six accepted calls,
three from each client, in the expected order. Claude Code ran with only these
MCP tools, an explicit session config and no session persistence. No production
API or knowledge-base data was used. This proves D1 client compatibility, not
B3's Inspector authorization flow or D5's demo claude.ai rollout gate.

### B3 Inspector authorization verification — 2026-10-06

MCP Inspector 2.9.0 web completed resource discovery, dynamic registration,
Ragen email sign-in, workspace and assistant selection, consent, code exchange
and authenticated MCP connection (protocol 2025-11-25). Its memory-only token
store supplied the actual issued JWT for signature verification against the
web JWKS, with issuer `http://localhost:3000/api/auth` and audience
`http://localhost:3300/mcp`. Verified claims match the seeded E2E user,
organization and selected assistant exactly; scope contains `mcp:read` and
`exp - iat` is 900 seconds. The organization flag is restored after the check.

This check caught a contract mismatch hidden by isolated synthetic tokens:
web issues `org`/`project`, while the MCP verifier read `orgId`/`projectId`.
Commit `0bf1d9f5c` aligns the verifier and its fixtures with the specified
wire claims, keeping the internal assertion identity names unchanged.
All 138 MCP tests, build and typecheck pass after the correction.

### JWKS availability verification — 2026-10-06

The JOSE remote resolver now uses its public `customFetch` hook to distinguish
failed key retrieval from invalid tokens. Network failures and non-successful
JWKS HTTP responses return 503 with `Retry-After: 30`, without claiming that
the user's token is invalid. A successful cached key continues to verify during
an issuer outage. Invalid signatures still return 401; API keys bypass the
resolver. A real HTTP JWKS test covers cold-cache refusal, the authentication
response, cache survival and signature refusal. All 139 MCP tests, typecheck
and build pass. No token, key material or internal fetch error is exposed.

### Unused client retention verification — 2026-10-06

`npm run mcp:prune-clients --workspace=@ragenai/web` performs the 30-day DCR
cleanup through the provider schema and Better Auth adapter, inside a
serializable Prisma transaction. It preserves owned clients, recent or unknown
dates, consents, tokens and explicit resource configuration. Pagination uses an
id cursor; serialization conflicts retry within three attempts. The command
loads the installation environment, runs once, and reports disabled without
OAuth queries when the deployment gate is off. Register it daily as described
in [the maintenance runbook](../runbooks/mcp-oauth-maintenance.md).

Sixteen focused tests and web typecheck pass. The `p0-98` Docker Desktop E2E
creates old unused, recent, owned and consented clients, verifies only the
eligible client is removed, repeats the run and preserves the consent (1/1).
The actual CLI succeeds with the gate both disabled and enabled on `ragen_e2e`.
