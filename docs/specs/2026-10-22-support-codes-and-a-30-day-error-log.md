---
title: Support codes on every error, and a 30-day error log in the admin panel
status: approved
areas: [admin, api, worker, mcp, observability, install]
adrs: [06, 21, 33, 35, 36, 37, 42, 44, 50]
---

# Support codes on every error, and a 30-day error log in the admin panel

## TLDR

Every error a person can see (panel, public API, MCP tool, failed ingest)
carries a stable, documented **support code** such as `RGN-4102` and a
**reference** such as `7F3K-92QD` that finds the matching log entries in every
app. The code says _what_ went wrong and is described in ragen-docs. The
reference says _which_ occurrence it was. Warnings and errors from every app
are kept, redacted, for 30 days in the install's own Postgres and shown in
`apps/admin`, because an offline appliance has no Grafana, no Railway log view
and nobody on our side who can look.

## Decisions

Answered 2026-10-22, then revised the same day against two goals the owner
set for every answer: **support has to be easy and pleasant**, for the person
reporting the problem and for whoever handles it, and **logging must not cost
the application measurable performance.** The sections below are written from
these decisions.

- **D1. One spec, three phases.** Phase A (codes and references) ships and
  helps support on its own, with only one additive column migration. Phase B
  (the stored log) and Phase C (support bundle) build on it. The spec review
  suggested moving the bundle into its own spec because it has its own threat
  model. It stays here, and that threat model is written out in §6.
- **D2. The code format is `RGN-` plus four digits**, and the thousands digit
  names the area. Bare numbers from 100 were rejected, because 100–599
  collides with HTTP statuses on the same screens and in the same logs, and a
  prefix can be searched for in docs, tickets and Slack.
- **D3. Every `error` is stored, but a `warn` only if it carries a support
  code.** Rows are structured and redacted, in a Postgres table. An
  unclassified warning stays on stdout and OTel, along with `info`/`debug`.
  Volume is the performance risk, and an uncoded warning is noise a support
  person cannot act on, so both goals point the same way: everything in the
  admin log has a code and an explanation. There is no Loki or ClickHouse
  container, because that would be a second database to size, back up and
  upgrade on every appliance.
- **D4. Two readers.** Platform admins see everything in `apps/admin`
  (ADR-35: platform-wide is admin). Org owners and admins see their own
  organization's entries in `apps/web`, limited to code, time, reference, area
  and the catalogue's text, with "what to do" shown first and no stack traces
  or attributes. Most problems on a one-org appliance are fixed by the
  customer's own admin, without a ticket.
- **D5. End users see the code and reference, and copy them in one click.**
  "Copy details" copies a ready-to-paste block (code, reference, time, app
  version, page). When the install has a support contact configured, a
  "Contact support" link opens it with the subject prefilled. The reference is
  a random opaque id, not a row id, so it leaks nothing.
- **D6. Retention defaults to 30 days**, configurable per install with
  `ERROR_LOG_RETENTION_DAYS` (1–365). Regulated customers ask for both 7 and 90. A hard row cap bounds the table whatever the window.
- **D7. Logging has a performance budget, and a test holds it.** The
  request path only enqueues; it never awaits the database. The sink writes on
  its own single connection, so it never takes one from the request pool. The
  budget and how it is measured are in §4, "Performance budget".

## Problem

A self-hosted or offline install fails in front of someone who cannot read
our code, and today nothing they see leads anywhere:

1. **Errors have no identity.** The panel's error boundary
   (`src/app/[locale]/(panel)/error.tsx`) shows a translated "something went
   wrong" and logs `error.digest`. It never shows the digest, so a screenshot
   cannot be matched to a log line. `apps/api`'s `ApiExceptionFilter`
   returns `{ message: 'Internal server error' }` with no code and no id.
2. **The codes that exist are local and duplicated.** `ChainErrorCode`
   (`moderation-error`, `model-not-configured`, …) is declared twice, in
   `apps/web/src/libs/chains/types/errors.ts` and
   `apps/api/src/chains/types/errors.ts`. It covers only chat, and nothing a
   customer can read documents it. Ingest, connectors, the worker and MCP
   have no codes at all.
3. **Logs are not kept anywhere the install owns.** web, worker and mcp write
   `pino-pretty` colourised text to stdout, and api uses Nest's `Logger`.
   OTel export does nothing unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and
   the bundled collector (`infra/otel/collector-config.yaml`) only prints to
   its own stdout. After `docker compose down`, or a log-driver rotation, the
   evidence is gone.
4. **Failed jobs disappear in a day.** BullMQ keeps failed jobs for 24 h
   (`packages/jobs-bullmq/src/index.ts`, `RETENTION.removeOnFail`).
   `UserFile` records `parsingFailedAt`/`embeddingFailedAt` but not why, so a
   document that failed to ingest on Friday has no explanation on Monday.
5. **Nothing links one app's logs to the next.** A public-API chat request
   crosses mcp → api → web's internal `api/v1` → model provider. An upload
   crosses web → worker → Docling. Only OTel traces carry one id across them,
   and an offline install has no traces.
6. **The appliance spec depends on this.** Its C3 first-line role "can read
   logs with message content redacted"
   ([on-prem spec](2026-10-17-ragen-as-an-on-premises-appliance.md),
   Phase C), and no such logs exist yet.

What exists and stays as it is: `AuditLog` (business actions, shown in
`apps/admin` `/activity-log` and the org's `organization/audit-logs`) and
`SecurityEvent` (security incidents, `/incidents`). Neither is for
operational errors, and neither should become one, because each has its own
readers, retention and redaction.

## Out of scope

- **A log backend.** No Loki, Elastic, ClickHouse or Grafana in the default
  stacks (D3). OTel export remains the way to get full logs, traces and
  metrics.
- **Storing `info`/`debug` lines** (D3).
- **Alerting.** `SecurityEvent` already notifies. "Email the admin when
  RGN-6xxx spikes" is a follow-up and needs this log first.
- **The remote support channel.** That is on-prem C3. This spec builds what
  C3's first-line role reads.
- **Client-side (browser) errors beyond the panel's error boundary.** A
  boundary that catches is reported with a code and reference (A3). Browser
  console errors are not shipped to the server.
- **Translating the docs pages.** The docs ship in English. On-screen
  messages are translated in the app as today (next-intl).
- **Changing `ChainErrorCode` strings on the wire.** They stay, and each maps
  to a support code.

## Proposed solution

### 1. One catalogue, declared once

A new module in `@ragenai/platform-contracts`, `support-codes.ts`, is the only
place a code exists (ADR-33: declare it once, never per app):

```ts
export const SUPPORT_CODES = {
  'RGN-4102': {
    area: 'models',
    level: 'error',
    httpStatus: 503,
    audience: 'admin', // who can fix it: 'user' | 'admin'
    title: 'Model provider unreachable',
    cause: 'The route for this model points at a server that did not answer.',
    action: 'Check the model server is running, then run `npm run gateway:preflight -- --probe`.',
    since: '1.14.0',
  },
  // …
} as const satisfies Record<string, SupportCodeEntry>;

export type SupportCode = keyof typeof SUPPORT_CODES;
```

`cause` and `action` are English and serve the docs, the admin views and
logs. Text for end users lives in next-intl under `support-codes.<code>`, with
a generic fallback, so a missing translation still shows a sentence.

**Areas:**

| Range    | Area                                                               |
| -------- | ------------------------------------------------------------------ |
| RGN-1xxx | auth, sessions, SSO, permissions                                   |
| RGN-2xxx | documents: upload, storage, parsing, embedding, versions           |
| RGN-3xxx | retrieval: Qdrant, reranker                                        |
| RGN-4xxx | models: routes, credentials, provider errors, limits, moderation   |
| RGN-5xxx | connectors and MCP                                                 |
| RGN-6xxx | jobs and the worker                                                |
| RGN-7xxx | configuration and infrastructure (env, DB, Redis, KMS, migrations) |
| RGN-8xxx | public API and API keys                                            |
| RGN-9xxx | unclassified. `RGN-9000` is "unexpected error", the fallback       |

Inside an area the hundreds digit groups related codes (`41xx` routes and
providers, `42xx` rate limits, `43xx` usage ceilings, `44xx` moderation and
guardrails), so the docs index reads in sections.

**Initial set.** This is the set A1 ships with. The numbers are fixed in A1's
review and never change after that:

| Code     | Meaning                                              | From today's code                                |
| -------- | ---------------------------------------------------- | ------------------------------------------------ |
| RGN-1001 | Session expired or missing                           | `UnauthorizedException`                          |
| RGN-1002 | Missing permission for this action                   | capability guards (ADR-39)                       |
| RGN-1003 | Company sign-in provider unreachable                 | OIDC discovery failure (on-prem B1)              |
| RGN-1004 | Registration is closed                               | closed sign-up                                   |
| RGN-2001 | File type not supported                              | upload validation                                |
| RGN-2002 | File too large                                       | upload validation                                |
| RGN-2101 | Storage write or read failed                         | `packages/storage` errors                        |
| RGN-2201 | Document parser (Docling) unreachable                | `docling-client.ts`                              |
| RGN-2202 | Document could not be parsed                         | `parsingStatus = FAILED`                         |
| RGN-2203 | Parsing timed out                                    | Docling timeout                                  |
| RGN-2301 | Embedding failed                                     | `embeddingStatus = FAILED`                       |
| RGN-3001 | Vector store (Qdrant) unreachable                    |                                                  |
| RGN-3002 | Vector size does not match the collection            | `VECTOR_SIZE` mismatch                           |
| RGN-3101 | Reranker unavailable, results not reranked (warn)    |                                                  |
| RGN-4101 | Model offered but not configured                     | `model-not-configured`                           |
| RGN-4102 | Model provider unreachable                           | `llm-api-error` (network)                        |
| RGN-4103 | Model provider refused the credentials               | `api-key-error`                                  |
| RGN-4104 | Model provider returned an error                     | `llm-api-error` (other)                          |
| RGN-4201 | Rate limit reached                                   | `rate-limit-exceeded`                            |
| RGN-4301 | Monthly usage limit reached                          | `usage-limit-exceeded`, `LimitExceededException` |
| RGN-4401 | Message flagged by moderation                        | `moderation-error`                               |
| RGN-4402 | Message blocked by a guardrail rule                  | `guardrail-blocked`                              |
| RGN-5001 | Connector address refused (private network)          | `connector-guard`                                |
| RGN-5002 | Connector sign-in expired                            | token vault refresh failure                      |
| RGN-5003 | Connector tool call failed                           | MCP client error                                 |
| RGN-6001 | Job queue (Redis) unreachable                        |                                                  |
| RGN-6002 | Job failed after all retries                         | BullMQ `failed`                                  |
| RGN-6003 | Job stalled                                          | BullMQ `stalled`                                 |
| RGN-7001 | Required configuration missing                       | env validation                                   |
| RGN-7002 | Database unreachable                                 | Prisma connection errors                         |
| RGN-7003 | Encryption key unavailable                           | `packages/crypto`                                |
| RGN-7004 | Database migrations pending                          |                                                  |
| RGN-8001 | API key invalid                                      | ADR-13 key check                                 |
| RGN-8002 | API key revoked or expired                           |                                                  |
| RGN-8003 | Request failed validation                            | `ValidationPipe`                                 |
| RGN-9000 | Unexpected error                                     | `unknown-error`, anything uncaught               |
| RGN-9001 | Log rate limited: records counted, not stored (warn) | the sink's own ceiling                           |

**How code reaches a code.** A `SupportError` class in `platform-contracts`
carries `code`, a safe `message` and an optional `cause`. The existing error
classes (`ChainError`, `LimitExceededException`, `NotFoundException`,
`UnauthorizedException`, storage and crypto errors) gain a `supportCode`
property instead of being replaced, so `catch` blocks keep working. A
`toSupportCode(err)` function returns that property, maps known library
errors (Prisma `P1001` → `RGN-7002`, `ECONNREFUSED` to a known host → the
matching code) and falls back to `RGN-9000`.

**Rules,** enforced by `tests/architecture/support-codes-are-catalogued.test.ts`:

- a code is never renumbered or reused. A retired code stays with
  `retired: true`, because old screenshots and tickets still name it;
- every `RGN-\d{4}` literal in source exists in the catalogue;
- every entry has `title`, `cause`, `action` and `since`;
- `ChainErrorCode` is declared only in `platform-contracts`, so the two copies
  in web and api go away (also covered by `shared-contracts-are-not-recopied`).
  The copies have already drifted (web's carries members and comments api's
  lacks), so A1 merges them into their union rather than moving one.

**Who depends on the catalogue.** web, api and admin already depend on
`platform-contracts`. The worker gains that dependency. `apps/mcp` does not:
it relays the `code` string apps/api returns and never decides a code itself
(ADR-36 keeps it a thin adapter).

_Rejected:_ codes per app, because they drift, which is how `ChainErrorCode`
ended up in two files. An enum in the Prisma schema, because a code is not
data a migration should gate. Reusing HTTP status numbers (D2).

### 2. A reference that crosses every app

- **Format.** 8 Crockford base32 characters (no I, L, O, U), shown as
  `7F3K-92QD` and stored without the dash. That is 40 bits: enough not to
  collide within a 30-day window on any realistic install, and short enough to
  read over the phone. Lowercase and a missing dash are accepted when
  searching.
- **Where it starts.** At each edge: `src/proxy.ts` for panel requests (as a
  request header, so server components and actions see it), an `apps/api`
  middleware, `apps/mcp` once per tool call, and the worker for a scheduled
  job that no request started.
- **How it travels.** As `x-ragen-ref` on web ↔ api calls. An incoming
  `x-ragen-ref` is honoured only on `INTERNAL_API_SECRET` paths, so an
  outside client cannot plant one and make its errors look like someone
  else's. `apps/mcp` sends its ref to apps/api the same way, as a trusted
  caller holding a key. Through `@ragenai/jobs`, a job carries the ref of
  the request that enqueued it, and a worker failure on an upload shares the
  upload's ref. **This is a contract change:** `JobRuntime.start(job, runId,
payload)` has no metadata slot today, so it gains an optional fourth
  argument `meta: { ref?: string }`, implemented in both adapters (BullMQ
  and the Temporal adapter, ADR-44) and kept out of `JobPayloads`, so no
  handler's payload type changes. It is also set as the `ragen.ref` span attribute, so an
  install that does export traces can go from ref to trace.
- **How it reaches log lines.** It is held in `AsyncLocalStorage` (a
  `runWithRef()` helper in `@ragenai/observability`), and each app's pino
  `mixin` (Nest adapter for api) adds `ref` to every record. No call site
  passes it by hand.

### 3. Errors carry code + ref to whoever sees them

- **Panel.** The error boundary, the chat error bubble and error toasts show
  a human sentence in the reader's language first ("The AI model is not
  responding right now"), then "Kod błędu RGN-4102 · Ref 7F3K-92QD" in a
  smaller, muted line. The code is never the headline.
  - **"Copy details"** copies a plain-text block that pastes cleanly into an
    email, Teams or a ticket:

    ```text
    Ragen error RGN-4102 (Model provider unreachable)
    Ref: 7F3K-92QD
    Time: 2026-10-22 14:03:11 CEST
    Version: 1.14.0
    Page: /chat/[threadId]
    ```

    The page is the route template, never the URL with ids.

  - **"Contact support"** appears when the install sets `SUPPORT_CONTACT`
    (`mailto:` or an `https` URL). It sits beside the instance branding of the
    on-prem spec (D5 there), because on an appliance it is usually the
    customer's own IT. It opens with the subject "RGN-4102 · 7F3K-92QD" and
    the details as the body.
  - For `audience: 'user'` codes the sentence says what _they_ can do ("The
    file is larger than 50 MB. Split it or compress it."). For
    `audience: 'admin'` codes it says "Your administrator can fix this", so
    nobody retries something that cannot succeed.
  - An org admin also sees the catalogue's `action` and the docs link, inline,
    because on an offline install the link does not open.
- **Error boundary.** In production Next sends a client `error.tsx` only the
  `digest`, so the server-side ref and code cannot reach it. The boundary
  therefore shows `RGN-9000` and the digest as its reference ("Ref
  a1b2c3d4"). The server's `onRequestError` hook (`instrumentation.ts`) logs
  the same error with its ref, code and `digest`, and `/logs` search accepts
  a digest, so the screenshot still leads to the row and from there to the
  real code. Handled errors (toasts, chat, API) get the ref from the
  `x-ragen-ref` response header or the stream event, and show the real code.
- **Public API (`apps/api`).** `ApiExceptionFilter` returns
  `{ message, code, ref }` and sets the `x-ragen-ref` response header. The
  OpenAI-compatible surface keeps OpenAI's `error` object exactly and adds
  `ragen_code` and `ragen_ref` inside it. Clients that ignore unknown fields
  keep working, and a contract test pins the shape.
- **MCP (`apps/mcp`).** A failing tool returns `isError: true` with
  `(RGN-5003, ref 7F3K-92QD)` appended to its text, because MCP clients show
  only the text.
- **Ingest.** A failed parse or embedding writes `failureCode` and
  `failureRef` on `UserFile`, and the knowledge-base view shows "Failed:
  RGN-2202" with the reference, instead of just "Failed".
- **Streaming chat.** An error event in the stream carries `code` and `ref`
  next to today's `ChainErrorCode`, so an older client that reads only the
  old field keeps working.

### 4. A 30-day error log in the install's Postgres

The sink's core (allowlist, scrubber, dedup key, bounded queue, batching)
lives in `@ragenai/observability/sink`, a subpath with no OpenTelemetry
imports, because `apps/admin` deliberately runs no OTel
(`apps/admin/src/lib/logger.ts`). The core takes a `write(rows)` function, so
each app supplies its own Prisma client. It is wired into the four apps that
own a database client:

- web and worker: a pino destination stream;
- api: a Nest `LoggerService` adapter;
- admin: its `console`-shaped `AdminLogger` calls the sink for `warn` and
  `error`.

**`apps/mcp` writes no rows.** ADR-36 says it has no database access, and
this spec does not change that. Its own failures (transport, a refused key)
stay on stdout and OTel. Every failure that comes back from apps/api has
already been logged by apps/api under the same ref, which mcp passed along,
so the "same reference" view still shows the MCP request.

The sink takes every `error` record and every `warn` that carries a code
(D3), and writes them to `OperationalEvent` in batches (every 2 s or 100
records), asynchronously, from a bounded in-memory queue. On `SIGTERM` it
flushes what it holds, with a 2-second limit. Its own write errors go to
stdout only, never back into the sink, so a broken database cannot make the
sink log about itself in a loop.

#### Performance budget

Logging an error must not slow down the request that hit it, and the log
must not slow down anyone else's.

- **The request path only enqueues.** In the caller, the sink does a
  level/code check, builds the row (allowlist, truncation, scrubber) and
  pushes it onto an array. It never awaits I/O. Budget: **under 50 µs per
  stored record** on the calling path, measured by a benchmark in the
  package's tests. Records that will not be stored (`info`, `debug`,
  uncoded `warn`) cost one comparison.
- **Bounded work per record.** `message` is cut to 1 KB _before_ the
  scrubber runs, so the regexes run on bounded input. The stack keeps its top
  15 frames, at most 4 KB. The stack is the one the error already carries,
  so nothing is captured just for logging.
- **Its own connection.** The sink writes through a dedicated `pg` pool with
  `max: 1` and a 2-second `statement_timeout`. It never competes with
  requests for the app's Prisma pool, and a slow insert times out instead of
  piling up. A web replica therefore opens one extra connection; the
  appliance sizing in the on-prem spec counts it.
- **One statement per batch.** A batch is a single multi-row
  `INSERT … ON CONFLICT DO UPDATE` (dedup below), so 100 records cost one
  round trip.
- **Ceiling per process.** At most 20 rows per second are written per
  process, after dedup. Beyond that, records are only counted, into one
  `RGN-9001` "log rate limited" summary row per minute, so a storm costs the
  database a constant amount, and the admin sees that a storm happened.
- **Few, cheap indexes.** Each index is paid on every write, so there are
  six, and the time index is a BRIN, which an append-only table keeps
  almost for free (Data model).
- **Retention off the hot path.** The prune runs at 03:45, after the
  analytics prune at 03:30, and deletes in batches of 5 000 with a pause
  between them, so it never holds a long lock or saturates I/O.
- **Reads are bounded too.** Admin lists use keyset pagination (no
  `OFFSET`), and they never run an exact `COUNT(*)` over 30 days: they show
  "1 000+" past a limit. The dashboard tiles come from one grouped query,
  cached for 60 s. The search by reference or code is an index lookup across
  the full retention window.
- **Measured, not assumed.** Phase B ends with a load run from
  `apps/web/perf` (chat and upload scenarios) with 5 % of requests forced to
  fail. Its p95 latency with the sink on must stay within 5 % of the same run
  with `ERROR_LOG_ENABLED=false`. The result is written into this spec.
- **Kill switch.** `ERROR_LOG_ENABLED=false` turns the sink off with a
  restart, and the request path then pays nothing beyond the level check.

**What a row holds is an allowlist, not a denylist:** time, app, level, code,
ref, organizationId, userId, message, error class, stack (only for `error`:
frames, i.e. file, line and function, with no values), and an `attributes`
JSON restricted to named keys: `job`, `queue`, `attempt`, `modelId`, `route`,
`provider`, `documentPublicId`, `connectorSlug`, `httpStatus`, `method`,
`path` (route template, not the raw URL), `durationMs`, `digest`. Any other
key is dropped and counted.

**Never stored:** prompts, answers, document text, file names, query strings,
headers, cookies, tokens, connector payloads, raw error messages from
providers. Thread content is encrypted per org (ADR-06/42), so a log row must
not become an unencrypted copy of it. The `message` field is pino's message
string after a scrubber removes emails, phone numbers, IBANs and key-shaped
strings. The scrubber is regex-based and needs no Presidio, because Presidio is
an optional profile. A test feeds records full of PII and secrets through the
sink and asserts none of it reaches the row.

**Deduplication.** `dedupKey` is a hash of (app, code, error class, top
stack frame, organizationId), and `minuteBucket` is the occurrence time
truncated to the minute. A unique index on the pair lets each batch write
with `INSERT … ON CONFLICT DO UPDATE`, which increments `count`, sets
`lastSeenAt` and appends the ref to `refs` while it holds fewer than 20.
This works across replicas, where an in-process "open row" would not. Each
reference a user reports therefore stays searchable, and an error loop
cannot fill the disk.

**Retention.** A scheduled worker job, `pruneOperationalEvents`, shaped like
`ANALYTICS_RETENTION_SCHEDULE` in `apps/worker/src/schedules.ts`, deletes rows
older than `ERROR_LOG_RETENTION_DAYS` nightly, in batches (see Performance
budget). Daily table partitions, where retention would be a `DROP`, were
considered and rejected for now. Prisma migrations do not manage partitions,
and at a 2 M-row cap batched deletes are cheap. Revisit if an install needs
a much larger cap. A hard cap of
`ERROR_LOG_MAX_ROWS` (default 2 000 000) prunes oldest first even inside the
window, and the admin says when that happened.

**Failed jobs.** The worker writes an `RGN-6002` row when a job exhausts its
retries, with the job name, attempt count and the ref from its envelope. The
row outlives BullMQ's 24-hour `removeOnFail`, which stays as it is.

_Rejected:_ a file sink with rotation (not queryable, not visible in the
admin, lost with the container). A Loki container (D3). Writing into
`AuditLog` or `SecurityEvent` (each has its own readers and retention).

### 5. Admin views

**`apps/admin` `/logs`** (platform admin), on the same components as
`/activity-log` (`DateFilter`, `Pagination`, `SortableHeader`,
`ExportButton`, `SearchableSelect`):

- a list filtered by app, level, code, area, organization and time. It opens
  on the last 24 hours, which is what someone is asking about, and the filter
  goes back the full retention window. An "unclassified" filter for
  `RGN-9000` is the backlog of errors that still need a code;
- one search box that takes whatever the customer sent: a reference in any
  form (`7F3K-92QD`, `7f3k92qd`, `Ref: 7F3K-92QD`), a code (`RGN-4102`,
  `4102`), a Next digest, or the whole "Copy details" block pasted as is. The
  box finds the ref or code inside it. It always searches the whole window;
- **"Same reference"**: every app's entries for one ref, in time order. This
  is the support engineer's main view;
- a detail page: the catalogue's "what to do" first, then cause, the docs
  link, how many times it repeated and in how many organizations, and the
  raw record last. A "Support bundle for this incident" button prefills the
  bundle's scope with this organization and the hour around the error;
- the dashboard gains "top codes, last 24 h / 7 d" `StatTile`s and a line for
  "N events could not be stored" (see Failure modes);
- export to CSV/JSONL through the existing `ExportButton` route, as an
  `AuditLog` entry.

**`apps/web` `organization/errors`** (org owners and admins, D4), next to
`organization/audit-logs` and gated the same way, by capability
(`canManageOrg()`), never by comparing the role string. It is scoped by the
session's organization (`getOrgIdFromAuthOrThrow()`), never by a parameter.
Each entry leads with the catalogue's action ("Check the model server is
running"), then shows time, code, title, area, reference, count and the docs
link. It shows no stack, attributes, user or app. Its empty state says "No
errors in the last 30 days", which is itself useful to a customer asking "is
it us or you".

### 6. Support bundle

"Download support bundle" in `apps/admin` produces a zip an offline customer
can email:

- versions: every app, the git SHA, image tags, Node, Postgres, Qdrant, Redis;
- the health checks the setup page already runs, run now, with their results;
- the route table with credentials removed;
- the environment, **every value masked by default.** `@ragenai/env` does not
  record which variables are secret, so the bundle shows a variable's name and
  whether it is set. It shows a value only for an allowlist: model ids,
  feature flags, `VECTOR_SIZE`, ports, and URLs with any user info stripped.
  The allowlist lives in the bundle module and has a test;
- BullMQ queue counts (waiting, active, failed, delayed);
- applied and pending migrations;
- the last 7 days of `OperationalEvent` as JSONL, redacted as stored.

**The bundle leaves the install**, usually by email to us, so it has its own
threat model. On a multi-org install it would otherwise export every tenant's
ids to a third party:

- `organizationId` and `userId` are replaced with HMAC pseudonyms keyed by a
  per-install secret generated on first use. The same org gets the same
  pseudonym in every bundle, so support can still say "only one org is
  affected". Only the install can map a pseudonym back, through `/logs`
  search;
- the admin chooses the scope first: the whole install, or one organization;
- before the download, a preview page lists every file and the row counts,
  plus a sample of the event rows. The admin downloads only after seeing it;
- every download is an `AuditLog` entry naming the scope.

**Cost.** The bundle is built on request and streamed, not stored. Only one
can be built at a time per install, its event rows are capped at 50 000, and
the health checks run with their usual timeouts, so a support request cannot
load a struggling install further.

This is what first-line support asks for first, and it works with no support
channel at all.

### 7. Docs in ragen-docs

`npm run docs:error-reference` writes one page per code (title, area, cause,
action, since, retired) plus an index grouped by area into a sibling
ragen-docs checkout. It is the same mechanism as `docs:config-reference`
(`scripts/docs/generate-config-reference.mjs`). The panel and the admin link
to `<docs-base>/errors/RGN-4102`. A test checks that the generator's output
matches the catalogue, so a code cannot ship undocumented.

## Core surfaces touched

| Surface                         | Change                                                                                                                   | What catches a mistake                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/platform-contracts`   | catalogue, `SupportError`, `toSupportCode`, the single `ChainErrorCode`; worker gains the dependency                     | package tests, `shared-contracts-are-not-recopied`, new `support-codes-are-catalogued`                 |
| `packages/observability`        | ref context, pino mixin; `/sink` subpath (no OTel) with scrubber and dedup; admin gains a dependency on the subpath only | package tests (redaction fixtures), each consumer's build                                              |
| `packages/jobs` + both adapters | `JobRuntime.start` gains optional `meta: { ref }`; failed-job event                                                      | `npm run worker:test:jobs`, the Temporal adapter's tests                                               |
| Better Auth org/user deletion   | hooks delete or anonymise log rows                                                                                       | hook tests (the library owns deletion, so no Prisma delete beside it)                                  |
| `prisma/schema.prisma`          | `OperationalEvent`, `UserFile.failureCode` / `failureRef`                                                                | migration + `npm run verify`                                                                           |
| `packages/env`                  | `ERROR_LOG_ENABLED`, `ERROR_LOG_RETENTION_DAYS`, `ERROR_LOG_MAX_ROWS`, `SUPPORT_CONTACT`, one fragment for every app     | package tests; `create-ragen-app` gains them (Post-Task step 4)                                        |
| `apps/api` filters              | responses gain `code`, `ref`, `ragen_*`                                                                                  | filter specs, OpenAI-surface contract test                                                             |
| auth / tenant scoping           | org view by session org                                                                                                  | the IDOR test (the gate); `OperationalEvent` is also added to the tenant-scope guard, which only warns |
| `src/proxy.ts`                  | sets the ref header only (no auth)                                                                                       | proxy tests                                                                                            |

## Data model

```prisma
model OperationalEvent {
  id             Int      @id @default(autoincrement())
  publicId       String   @unique @default(uuid()) @map("public_id") // detail-page URL
  dedupKey       String   @map("dedup_key")
  minuteBucket   DateTime @map("minute_bucket") @db.Timestamptz
  occurredAt     DateTime @default(now()) @map("occurred_at") @db.Timestamptz
  lastSeenAt     DateTime @default(now()) @map("last_seen_at") @db.Timestamptz
  count          Int      @default(1)
  app            String   // web | api | worker | mcp | admin
  level          String   // warn | error
  code           String   // RGN-xxxx, RGN-9000 when unclassified
  ref            String?  // the first occurrence's reference, for display
  refs           String[] @default([]) // every occurrence's ref (first included), max 20; searched via GIN
  organizationId String?  @map("organization_id")
  userId         String?  @map("user_id")
  message        String
  errorClass     String?  @map("error_class")
  stack          String?
  attributes     Json     @default("{}")

  @@unique([dedupKey, minuteBucket])
  @@index([occurredAt], type: Brin)
  @@index([refs], type: Gin)
  @@index([code, occurredAt])
  @@index([organizationId, occurredAt])
  @@map("operational_events")
}

model UserFile {
  // …existing fields
  failureCode String? @map("failure_code")
  failureRef  String? @map("failure_ref")
}
```

There are six indexes counting the `publicId` key, and no more, because each is paid on every write. The search
by reference goes through the GIN index on `refs`, which includes the first
ref, so `ref` itself needs no index of its own. The time index is a BRIN,
because rows arrive in time order. Admin queries filter on time, so it
narrows them at a fraction of a B-tree's write cost.

The id follows the repo's convention (`Int` plus `publicId`), so rows
serialize in Server Actions and exports with no BigInt handling. `Int` is
enough: the row cap bounds the table, and at 2 M rows a month the sequence
lasts for decades.

`OperationalEvent` has no foreign keys to `Organization` or `User`: a log
row must not block their deletion. Better Auth owns that deletion, so the
cleanup runs in its hooks, not in a Prisma delete beside them. The
organization's after-delete hook (`organizationHooks` in
`src/lib/auth.ts`) deletes the org's rows, because the customer asked for
their data to go. The user's after-delete hook (`databaseHooks`) sets
`userId` to null and keeps the row, because the error is still the
install's. Both hooks are tested. Nothing is
backfilled: the log starts empty on upgrade, and existing failed files show
"Failed" without a code, as today.

## Failure modes

- **Postgres down.** That is exactly when errors are worth logging. The sink
  keeps writing to stdout, holds up to its queue size, then drops the oldest
  and counts the drops. It never throws into a request. Once the DB is back,
  the first batch includes a `RGN-7002` summary row with the drop count, which
  the admin dashboard shows.
- **Error storm.** One-minute dedup, a bounded queue and the row cap.
- **PII in a message** (`logger.error(\`failed for ${email}\`)`). The
  scrubber catches the known shapes. An ESLint rule against template literals
  as a logger's message argument follows in B1, so values go in fields, where
  the allowlist applies.
- **Forged reference.** A ref is accepted from a caller only on
  internal-secret paths. Everywhere else a new one is generated.
- **New error without a code.** It is logged as `RGN-9000` with its error
  class, and the admin's "unclassified" filter is the backlog.
- **Org admin asks for another org's entries.** The query is scoped by the
  session's organization, never by a parameter. An IDOR test sends a
  foreign `ref` and gets nothing back.
- **Reference collision.** Unlikely at 40 bits, and harmless: "same
  reference" shows two unrelated chains, distinguishable by time.
- **Docs link offline.** The panel shows the catalogue's action inline, so
  the link is a convenience, not the only source.
- **Process exits with a full queue.** The `SIGTERM` flush has a 2 s limit,
  and whatever is still queued is lost. A hard kill loses the queue, at most
  one batch window of records. stdout still has them.
- **The sink's own write fails.** It reports to stdout only, never to
  itself, so it cannot loop.
- **Index growth.** The GIN index on `refs` and the dedup unique index grow
  with the table, which the row cap bounds. A retention run is followed by
  Postgres' normal autovacuum, not a manual `VACUUM FULL`.
- **Bundle sent to the wrong person.** It carries pseudonyms, not ids, and
  no content. The `AuditLog` entry shows who downloaded which scope.
- **Sink disabled** (`ERROR_LOG_ENABLED=false`). Codes and references still
  appear (Phase A does not depend on B). `/logs` says the log is off instead
  of showing an empty table.

## Phases

Each phase leaves the application working. Phase A alone already helps
support.

### Phase A: codes and references people can quote

- [ ] **A1.** Catalogue, `SupportError`, `toSupportCode` and the initial set in
      `platform-contracts`. `ChainErrorCode` moves there and the web/api copies are
      deleted. The architecture test lands with it.
- [ ] **A2.** Ref context in `observability` (`runWithRef`, pino mixin, Nest
      adapter), generated at the web, api and mcp edges, and honoured only from
      trusted callers. `JobRuntime.start` gains `meta: { ref }` in both adapters.
      Every log line has `ref`.
- [ ] **A3.** The existing error classes gain `supportCode`. The panel error
      boundary, the chat error bubble and toasts show a human sentence, then code +
      ref, "Copy details" and, when `SUPPORT_CONTACT` is set, "Contact support".
      `apps/api` (both surfaces) and the chat stream return them. MCP tool errors
      append them. next-intl messages for the initial set, in `en` and `pl`.
- [ ] **A4.** `UserFile.failureCode` / `failureRef` (additive migration),
      written by the worker on parse and embed failures and shown in the
      knowledge-base view.
- [ ] **A5.** `docs:error-reference` generator, its drift test, and the first
      pages in ragen-docs.

### Phase B: the 30-day log

- [ ] **B1.** `OperationalEvent` migration, env fragment, and the
      `observability/sink` core with allowlist, scrubber, upsert dedup, bounded
      queue and `SIGTERM` flush. It is wired into web, api, worker and admin (not
      mcp, per ADR-36), behind `ERROR_LOG_ENABLED` (default `false`, ADR-50). The
      worker records failed jobs. The Better Auth delete hooks and the ESLint rule
      for logger messages land in the same step.
- [ ] **B2.** `pruneOperationalEvents` schedule and the row cap.
- [ ] **B3.** `apps/admin` `/logs`: list, filters, ref/code search, "same
      reference", detail, export, dashboard tiles. `ERROR_LOG_ENABLED` flips to
      `true` by default in this step, once B3a has passed.
- [ ] **B3a.** Load run from `apps/web/perf` with 5 % forced failures, sink on
      vs off. The p95 must stay within 5 %, and the result is recorded here.
- [ ] **B4.** `apps/web` `organization/errors` for org owners and admins,
      with nav entry by capability and the IDOR test.

### Phase C: support bundle and runbook

- [ ] **C1.** Support bundle in `apps/admin`: scope choice, preview,
      pseudonymised ids, audit entry. Tests cover the env allowlist and assert that
      no raw `organizationId` or `userId` appears in a bundle.
- [ ] **C2.** `docs/appliance-runbook.md`'s troubleshooting and first-line
      checklist rewritten around codes ("RGN-4102 → check the model server"),
      and on-prem C3's first-line role pointed at `/logs` and the bundle.

## Testing

- **Unit.** Catalogue invariants (architecture test). `toSupportCode` for every
  mapped error class and library error. Ref generation, parsing and
  normalisation. Scrubber and allowlist with PII and secret fixtures. Dedup
  and the folded-refs cap. The retention job and row cap. The bundle's env
  masking. A benchmark holds the calling-path budget (under 50 µs per stored
  record) and the per-process ceiling.
- **Integration.** A public-API chat request (`apps/api` `/v1/chat/completions`
  → web's internal `api/v1/chat`) that fails leaves rows in both apps sharing
  one ref, and the response carries it. A panel upload whose parse fails
  leaves a worker row with the upload's ref and `failureCode` on the file.
  Two concurrent sink writers on the same error produce one row with
  `count = 2`. The org and user delete hooks remove or anonymise rows. Filter specs for both API
  surfaces, and a contract test that the OpenAI error shape is unchanged
  apart from `ragen_*`. The sink with Postgres stopped never throws and
  reports drops.
- **E2E (`smoke-*`, blocks merge).** A forced panel error shows a code and a
  reference, and that reference is found in `apps/admin` `/logs`. The whole
  point is that the two match, so this gates the PR rather than sitting in
  `p1`.
- **E2E (`p1-*`).** An org admin sees their organization's entry in
  `organization/errors`, and a member does not see the page.

## Rollout and rollback

- **Phase A** has one additive migration (A4) and otherwise reverts as a PR.
  The new response fields are additions, so API clients need no change.
- **Phase B** is behind `ERROR_LOG_ENABLED`. It defaults to `false` while
  B1–B2 land, so those slices are `chore`s that release nothing (ADR-50).
  It flips to `true` in B3, once there is somewhere to read the log. That
  flip is the `feat` release: an existing install that never set the
  variable starts writing rows on upgrade, so the release note says so, and
  says how to opt out. Turning it off stops writes with a restart, no
  deploy. The migration is
  additive and nothing references the table, so it can be dropped.
- **`create-ragen-app`** gains the three env vars in the PR that introduces
  them (B1), with the default retention, and the PR description says so.
- **Changelog** (`docs/changelog-notes.md`): A3 ("errors now show a code
  and a reference you can send to support") and B3 ("30 days of errors in the
  admin panel") are both user-visible.
