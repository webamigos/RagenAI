---
title: Support codes on every error, and a 30-day error log in the admin panel
status: draft
areas: [admin, api, worker, mcp, observability, install]
adrs: [21, 33, 35, 37, 44]
---

# Support codes on every error, and a 30-day error log in the admin panel

## TLDR

Every error a person can see (panel, public API, MCP tool, failed ingest)
carries a stable, documented **support code** such as `RGN-4102` and a
**reference id** that finds the matching log entry. The code says *what* went
wrong and is described in ragen-docs; the reference says *which* occurrence.
Warnings and errors from all five apps are kept, redacted, for 30 days in the
install's own Postgres and shown in `apps/admin`, because an offline appliance
has no Grafana, no Railway log view and nobody on our side who can look.

## Open Questions

<!--
Hard gate (docs/specs/README.md): nothing below "Proposed solution" is final
until these are answered. Each has a recommendation; answer "yes" to take it.
-->

- **Q1. Split into two specs?** The brief bundles two capabilities that are
  each useful alone: (a) support codes + reference ids + docs, (b) a stored
  30-day log with an admin view and a support bundle. *Recommendation:* one
  spec, but phased so A ships and helps support without B.
- **Q2. Code format.** The brief suggests numbers starting at 100.
  *Recommendation:* `RGN-` plus four digits, the thousands digit naming the
  area (table below). Bare 100–599 collides with HTTP statuses, which appear
  on the same screens and in the same logs ("error 404" vs "error 404"), and
  a prefix is searchable in docs, tickets and Slack.
- **Q3. What is stored for 30 days?** *Recommendation:* `warn` and `error`
  records only, structured and redacted, in a Postgres table. Not every
  `info` line: a busy install writes millions, Postgres is the wrong store for
  that, and stdout/OTel already carries the full stream for whoever runs a
  log backend. Alternative: ship a Loki/ClickHouse container in the appliance
  profile — rejected as a second database to size, back up and upgrade.
- **Q4. Who sees the log?** *Recommendation:* platform admins in `apps/admin`
  see everything (ADR-35: platform-wide is admin). Org owners/admins in
  `apps/web` see only their organization's entries, and only the code,
  time, reference and area — not stack traces. Alternative: admin-only.
- **Q5. Does the reference id appear to end users,** or only to admins?
  *Recommendation:* to end users, always, next to the code — it is the one
  thing they can copy into a ticket. It is an opaque random id, not a row id,
  so it leaks nothing.
- **Q6. Is the retention fixed at 30 days?** *Recommendation:* default 30,
  configurable per install via `ERROR_LOG_RETENTION_DAYS` (min 1, max 365),
  because some regulated customers will ask for 90 and some for 7.

## Problem

A self-hosted or offline install fails in front of someone who cannot read
our code, and today nothing they see leads anywhere:

1. **Errors have no identity.** The panel's error boundary
   (`src/app/[locale]/(panel)/error.tsx`) shows a translated "something went
   wrong" and logs `error.digest`, but never shows the digest, so a screenshot
   cannot be matched to a log line. `apps/api`'s `ApiExceptionFilter` returns
   `{ message: 'Internal server error' }` with no code and no id.
2. **The codes that exist are local and duplicated.** `ChainErrorCode`
   (`moderation-error`, `model-not-configured`, …) is declared twice, in
   `apps/web/src/libs/chains/types/errors.ts` and
   `apps/api/src/chains/types/errors.ts`, covers only chat, and is not
   documented anywhere a customer can read. Ingest, connectors, the worker
   and MCP have no codes at all.
3. **Logs are not kept anywhere the install owns.** web, worker and mcp write
   `pino-pretty` colourised text to stdout; api uses Nest's `Logger`. OTel
   export is a no-op unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and the
   bundled collector (`infra/otel/collector-config.yaml`) only prints to its
   own stdout. After `docker compose down`, or a container restart on a
   default Docker log driver, the evidence is gone.
4. **Failed jobs disappear in a day.** BullMQ keeps failed jobs for 24 h
   (`packages/jobs-bullmq/src/index.ts`, `RETENTION.removeOnFail`). A
   document that failed to ingest on Friday has no trace on Monday.
5. **No thread from one app to the next.** A chat turn crosses web → api →
   gateway, an upload crosses web/api → worker → Docling. Nothing carries one
   id across them outside OTel traces, which an offline install does not have.
6. **The appliance spec depends on this.** Its C3 first-line role "can read
   logs with message content redacted"
   ([on-prem spec](2026-10-17-ragen-as-an-on-premises-appliance.md), Phase C).
   No such logs exist to read.

What exists and stays: `AuditLog` (business actions, shown at
`apps/admin` `/activity-log`) and `SecurityEvent` (security incidents, shown
at `/incidents`). Neither is for operational errors, and neither should
become one: different readers, different retention, different redaction.

## Out of scope

- **A log backend.** No Loki, Elastic, ClickHouse or Grafana in the default
  stacks. OTel export stays the path for full logs, traces and metrics.
- **Storing `info`/`debug` lines** (see Q3).
- **Alerting and paging.** `SecurityEvent` already notifies; operational
  alerting (email the admin when RGN-6xxx spikes) is a follow-up.
- **The remote support channel itself** — that is on-prem spec C3. This spec
  provides what C3's first-line role reads.
- **Translating the docs pages.** Codes ship with English docs; user-facing
  messages are translated in the app as today (next-intl).
- **Renaming `ChainErrorCode` strings** on the wire. They stay; each maps to a
  support code.

## Proposed solution

### 1. One catalogue, declared once

A new module in `@ragenai/platform-contracts` (ADR-33: declare it once, never
per app), `support-codes.ts`, is the only place a code exists:

```ts
export const SUPPORT_CODES = {
  'RGN-4102': {
    area: 'models',
    severity: 'error',
    httpStatus: 503,
    title: 'Model provider unreachable',
    // English, for docs and logs. UI text lives in next-intl by code.
    cause: 'The route for this model points at a server that did not answer.',
    action: 'Check the model server is running; run `npm run gateway:preflight -- --probe`.',
    audience: 'admin', // 'user' | 'admin' — who can fix it
  },
} as const satisfies Record<SupportCode, SupportCodeEntry>;
```

| Range | Area |
|---|---|
| RGN-1xxx | auth, sessions, SSO, permissions |
| RGN-2xxx | documents: upload, parsing (Docling), storage, versions |
| RGN-3xxx | retrieval: Qdrant, embeddings, reranker |
| RGN-4xxx | models and the gateway: routes, credentials, provider errors, limits |
| RGN-5xxx | connectors and MCP |
| RGN-6xxx | jobs and the worker |
| RGN-7xxx | configuration, environment, infrastructure (DB, Redis, KMS) |
| RGN-8xxx | public API and keys |
| RGN-9xxx | unclassified — `RGN-9000` is "unexpected error", the fallback |

Rules, enforced by an architecture test
(`tests/architecture/support-codes-are-catalogued.test.ts`):

- a code is never renumbered or reused; a retired code stays with
  `retired: true`, because old screenshots and tickets still name it;
- every `RGN-\d{4}` literal in source exists in the catalogue;
- every entry has `cause` and `action`.

`ChainErrorCode` values map onto entries (`model-not-configured` →
`RGN-4101`, `usage-limit-exceeded` → `RGN-4301`, …) and the duplicate type in
web and api is replaced by the contracts export.

*Rejected:* codes per app (they drift — that is how `ChainErrorCode` ended up
in two files); an enum in the Prisma schema (a code is not data a migration
should gate).

### 2. A reference id that crosses every app

- Each inbound request gets a **reference id** (`ref`): 8 Crockford base32
  characters shown as `7F3K-92QD`, generated at the edge (`src/proxy.ts`,
  `apps/api` middleware, `apps/mcp` per tool call) or taken from an incoming
  `x-ragen-ref` header from a trusted caller (`INTERNAL_API_SECRET` paths
  only — an outside client cannot plant one).
- It travels as `x-ragen-ref` on web ↔ api calls, inside job data through
  `@ragenai/jobs` (so a worker failure carries the ref of the upload that
  started it), and as an attribute on the OTel span, so installs that do
  export traces can jump from ref to trace.
- It is held in `AsyncLocalStorage` and every logger adds it as a field, so
  no call site passes it by hand.

### 3. Errors carry code + ref to whoever sees them

- **Panel:** error boundary, toasts and the chat error bubble show
  "Kod błędu RGN-4102 · Ref 7F3K-92QD" with a copy button and, for
  `audience: 'admin'` codes, "Tell your administrator". The localized
  message comes from next-intl keyed by code, falling back to a generic one.
- **Public API (`apps/api`):** `ApiExceptionFilter` returns
  `{ message, code: 'RGN-…', ref }` and sets `x-ragen-ref`. The OpenAI
  surface keeps OpenAI's `error` object shape and adds `ragen_code` and
  `ragen_ref` beside it — clients that ignore unknown fields keep working.
- **MCP (`apps/mcp`):** a failing tool returns its text with the code and
  ref appended, since the client shows only text.
- **Worker:** a failed ingest stores the code on the document row, so the
  knowledge-base view shows "Failed — RGN-2203" instead of just "Failed".

### 4. A 30-day error log in the install's Postgres

New table `OperationalEvent` (name open) written by a small sink in
`@ragenai/observability`: a pino transport (and a Nest `LoggerService`
adapter for api) that writes every `warn`/`error` record, batched and
asynchronous, so a slow database never blocks a request.

Stored fields are an **allowlist**, not a denylist: time, app, level, code,
ref, organizationId, userId, area, message template, error class, stack (for
`error` only, file paths and function names — no local variable values), and
a small `attributes` JSON restricted to known keys (job name, model id, route
name, document publicId, HTTP status, duration). Never: prompts, answers,
document text, file names typed by users, headers, tokens, connector
payloads. Thread content is encrypted per org (ADR-06/42); a log row must not
become the unencrypted copy of it. A test feeds a record full of PII and
secrets through the sink and asserts none of it reaches the row.

Deduplication: identical (app, code, error class, top stack frame) within
one minute increment a `count` on the latest row instead of inserting, so an
error loop cannot fill the disk.

Retention: a scheduled worker job, in the same shape as
`prune-analytics-retrievals`, deletes rows older than
`ERROR_LOG_RETENTION_DAYS`. A hard row cap (e.g. 2 M) prunes oldest-first
even inside the window.

*Rejected:* a file sink with rotation (not queryable, not visible in the
admin, lost with the container); a Loki container (Q3); writing into
`AuditLog` or `SecurityEvent` (different readers and retention).

### 5. Admin views

- **`apps/admin` `/logs`** (platform admin): filter by app, level, code,
  area, organization, ref and time (default 30 days, reusing `DateFilter`,
  `Pagination`, `ExportButton`); a detail page showing the record, the
  catalogue's cause/action and a link to the docs page for the code; "same
  ref" shows every app's entries for one request — the support engineer's
  main view.
- **Search by ref** is a single box on the page: the user reads `7F3K-92QD`
  over the phone, the admin types it, sees the chain.
- **`apps/web` organization settings** (if Q4 = yes): the org's own entries,
  code + time + ref + docs link only.
- **Top codes, last 24 h / 7 d** as `StatTile`s on the admin dashboard —
  the cheapest "is something broken" signal.

### 6. Support bundle

A "Download support bundle" button in `apps/admin` producing a zip an offline
customer can email: versions of every image and package, the health checks
the setup page already runs, the route table with credentials removed, the
env with secrets masked (driven by `@ragenai/env`'s schema, which knows which
vars are secrets), BullMQ queue counts, and the last 7 days of the error log
as JSONL. Every download is an `AuditLog` entry. This is what first-line
support asks for first, and it works with no tunnel.

### 7. Docs in ragen-docs

`npm run docs:error-reference` generates one page per code (title, area,
cause, action, since-version, retired) plus an index into a sibling
ragen-docs checkout — the same mechanism as `docs:config-reference`. Error
screens link to `docs/errors/RGN-4102`. On an offline install the link
cannot open, so the panel also shows cause/action inline for admins.

## Core surfaces touched

| Surface | Change | What catches a mistake |
|---|---|---|
| `packages/platform-contracts` | the catalogue; `ChainErrorCode` mapping | package tests, `shared-contracts-are-not-recopied`, new `support-codes-are-catalogued` |
| `packages/observability` | ref context, DB sink, redaction | package tests (redaction), each consumer's build |
| `packages/jobs` / `jobs-bullmq` | ref travels in job data | `worker:test:jobs` |
| `prisma/schema.prisma` | `OperationalEvent`; code column on document ingest state | migration + `npm run verify` |
| `packages/env` | `ERROR_LOG_RETENTION_DAYS`, a fragment shared by every app | package tests, `create-ragen-app` (new env var) |
| `apps/api` filters | response gains `code`, `ref` | filter specs; OpenAI-surface contract test |
| auth / tenant scoping | org view filtered by `organizationId` | tenant-scope guard covers the new model; an IDOR test |

## Data model

Sketch, to be fixed after the questions:

```prisma
model OperationalEvent {
  id             BigInt   @id @default(autoincrement())
  occurredAt     DateTime @default(now()) @map("occurred_at") @db.Timestamptz
  lastSeenAt     DateTime @default(now()) @map("last_seen_at") @db.Timestamptz
  count          Int      @default(1)
  app            String   // web | api | worker | mcp | admin
  level          String   // warn | error
  code           String?  // RGN-xxxx; null = not yet classified
  ref            String?
  organizationId String?  @map("organization_id")
  userId         String?  @map("user_id")
  message        String
  errorClass     String?  @map("error_class")
  stack          String?
  attributes     Json     @default("{}")

  @@index([occurredAt])
  @@index([ref])
  @@index([code, occurredAt])
  @@index([organizationId, occurredAt])
  @@map("operational_events")
}
```

No foreign keys to `Organization`/`User`: a log row must survive the deletion
of what it describes for its 30 days, and must not block that deletion.
Nothing existing is backfilled — the log starts empty on upgrade.

## Failure modes

- **Postgres down** — the very errors worth logging. The sink drops to
  stdout only and counts drops; it never throws into the request. The admin
  shows "N events could not be stored" from that counter once the DB is back.
- **Error storm** — dedup per minute plus the row cap; the sink's queue is
  bounded and drops oldest.
- **PII in a message string** (`logger.error(\`failed for ${email}\`)`) —
  the message is stored as the template where pino gives one; otherwise it
  goes through a regex scrubber (emails, phones, IBAN, key-shaped strings)
  that needs no Presidio, because Presidio is an optional profile. Lint rule against template
  literals in logger calls, as a follow-up.
- **Forged ref from outside** — refs are accepted only on internal-secret
  paths; elsewhere a new one is generated.
- **Code missing for a new error** — it logs as `RGN-9000` with its error
  class; the admin's "unclassified" filter is the backlog.
- **Org admin reads another org's entries** — query is scoped by session
  org (`getOrgIdFromAuthOrThrow()`), never a parameter.

## Phases

Each phase leaves the application working; A alone already helps support.

### Phase A — codes and refs people can quote

- [ ] **A1.** Catalogue in `platform-contracts` with the initial codes
  (every `ChainErrorCode`, the `LimitExceededException`/`NotFoundException`
  family, Docling/ingest failures, missing env), architecture test.
- [ ] **A2.** Ref context in `observability`, generated at web/api/mcp edges,
  propagated web ↔ api and through job data; every logger adds it.
- [ ] **A3.** Panel error boundary, chat error bubble and toasts show code +
  ref; `apps/api` and the OpenAI surface return them; MCP tool errors append
  them; failed ingest stores its code.
- [ ] **A4.** `docs:error-reference` generator and the first pages in
  ragen-docs.

### Phase B — the 30-day log

- [ ] **B1.** `OperationalEvent` migration, redacting DB sink in
  `observability`, wired into all five apps, retention job and env var.
- [ ] **B2.** `apps/admin` `/logs`: list, filters, ref search, detail with
  catalogue text, dashboard tiles.
- [ ] **B3.** Org-scoped view in `apps/web` settings (if Q4).

### Phase C — support bundle

- [ ] **C1.** Support bundle download in `apps/admin`, audited.
- [ ] **C2.** First-line checklist in `docs/appliance-runbook.md` rewritten
  around codes: "RGN-4102 → check the model server", and the on-prem C3 role
  pointed at `/logs`.

## Testing

- Unit: catalogue invariants, ref generation and parsing, redaction (PII
  and secret fixtures), dedup, retention job.
- Integration: a request through web → api → worker leaves rows sharing one
  ref; API filter specs for both surfaces.
- E2E: `smoke-*` — a forced error in the panel shows a code and a ref, and
  that ref is findable in `apps/admin` `/logs` (blocks merge, because the
  whole point is that the two match).

## Rollout and rollback

Phase A has no migration and reverts as a PR. Phase B's migration is
additive; the sink is behind `ERROR_LOG_ENABLED`, which defaults to `false`
while B1–B2 land (ADR-50) and flips to `true` once the admin view exists.
Turning it off stops writes without a deploy. Dropping the table is safe — nothing references it.
`create-ragen-app` gains the new env vars in the PR that introduces them.
