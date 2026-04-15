# Polish Registry MCP Service — Design

Status: proposal.
Owner: @patryk
Ticket: CU-86b9ebx1m.

## Goal

Enable B2B lead scoring inside the Ragen chat by auto-enriching Polish
companies from public registries. A sales user drops a NIP (or picks a
lead) into a chat, the assistant calls MCP tools to pull KRS/financial
data, and combines the result with scoring rules stored as a KB
document to produce a rated lead with justification.

**Killer feature:** no competitor on the PL RAG market ships this.

## Out of scope (phase 1)

- GUS REGON BIR1 fallback (free source for PKD / form / headcount band).
- Wappalyzer technography.
- `resolve_email_to_company` — domain → NIP resolver.
- Scheduled periodic refreshes. Cache is populated on demand only.

All tracked in the followups section at the bottom.

## Architecture at a glance

```
┌──────────────┐  tool calls   ┌─────────────────────┐
│  ragen-app   │ ────────────▶ │ ragen-mcp/rejestrio │
│  (chat/RAG)  │               │  (FastMCP + Hono)   │
└──────┬───────┘               └──────────┬──────────┘
       │                                  │
       │ denormalized                     │ HTTP
       │ snapshot on lead                 │ Authorization: <key>
       ▼                                  ▼
┌──────────────┐                ┌────────────────────┐
│ ragen-app DB │                │ rejestrio DB       │  ← separate
│ (Postgres)   │                │ (Postgres, same    │    logical DB
│              │                │  cluster initially)│
│ leads.…      │                │ company_profile    │
│  + nip       │                │ financial_document │
│  + industry  │                │ request_audit      │
│  + revenue   │                └────────┬───────────┘
│  + …         │                         │
└──────────────┘                         │ cache miss
                                         ▼
                                ┌────────────────────┐
                                │ rejestr.io/api/v2  │
                                │  (paid, 0.05 PLN   │
                                │   or 0.50 PLN/call)│
                                └────────────────────┘
```

### Why a separate DB

- **Ownership.** MCP service owns its data. No round-trip back to
  ragen-app just to read its own cache.
- **Blast radius.** A runaway scrape grows unbounded; isolating it from
  the app DB keeps backups/replicas/PITR policies independent.
- **Lifecycle.** Easy to move to a warehouse later without schema
  surgery.
- Same PG cluster initially — no new infra to operate, just a second
  logical DB (`rejestrio`). Can split to its own cluster later.

### How aggregate queries still work

"Pokaż leady z branży budowlanej z przychodem > 5M" doesn't need a
cross-DB JOIN. When a lead is enriched, we denormalize the scoring
fields onto the lead row in ragen-app:

- `lead.nip` (lookup key)
- `lead.companyName`
- `lead.pkdMain` (e.g. `41.20.Z`)
- `lead.pkdCategory` (e.g. "Budownictwo")
- `lead.revenueLast` (last known, PLN)
- `lead.profitLast`, `lead.employeeSize`, `lead.isBankrupt`, …
- `lead.companyEnrichedAt` (freshness)

The snapshot is also the right semantics — the score reflects what we
knew at scoring time, not whatever the cache shows today.

## Data flow

1. User sends chat message with NIP (or pastes a lead).
2. Assistant (LiteLLM chain in ragen-app) has MCP tools loaded because
   the `Rejestr.io` connector is enabled on the org.
3. LLM decides which tool to call (usually `get_company_profile` —
   see Tool API).
4. Tool call hits ragen-mcp `/mcp` over HTTP. MCP service:
   a. Looks up `company_profile` in its own PG by NIP or KRS.
   b. If fresh (within TTL), returns cached payload.
   c. If stale or missing, calls Rejestr.io API, writes to cache,
      returns.
5. Tool result returned to chain. Chain retrieves the scoring-rules
   doc from the project KB via normal RAG, composes final scoring in
   system prompt.
6. Chain writes final answer. In parallel, chain writes the
   denormalized snapshot onto the lead row in ragen-app DB (so the
   aggregate query works).

## Tool API (phase 1, three tools)

Matching the original spec: `lookup_company`, `get_financials`,
`get_krs_info`. Each tool is a **composed** operation that may hit
multiple Rejestr.io endpoints. Cost profile documented in the tool
description so Claude doesn't call the expensive one casually.

### `lookup_company`

Resolve a company by NIP, REGON, or fragment of the name. Returns a
short list (max 10) of candidates with their KRS number, which is
the primary key for all downstream calls.

Input:
- `nip` (string, optional) — preferred if known; exact match.
- `regon` (string, optional) — exact match.
- `nazwa` (string, optional) — fragment; word-boundary match per API
  rules.

Exactly one of the three must be set. Zod validation inside the tool.

Output (abridged):
```json
{
  "results": [
    {
      "krs": 12345,
      "nip": "5260250995",
      "regon": "012345678",
      "nazwaPelna": "EXAMPLEX POLSKA SPÓŁKA AKCYJNA",
      "formaPrawna": "spółka akcyjna",
      "pkdGlowny": "Działalność usługowa w zakresie …",
      "siedziba": { "miejscowosc": "Warszawa", "kod": "00-001" },
      "wWykresleniu": false,
      "wUpadlosci": false,
      "wLikwidacji": false
    }
  ],
  "totalFound": 1
}
```

Rejestr.io endpoints used: **01** (wyszukiwanie-organizacji).
Cost: 0.05 PLN per search call (not per result).

### `get_krs_info`

Pull the KRS snapshot: management, shareholders, recent entries, and
related organizations/persons. Composed from endpoints 02 + 03 + 06.

Input:
- `krs` (integer, required) — or `nip`, which we resolve via `lookup_company` first.

Output fields (high level):
- `nazwa`, `numery`, `adresy`, `formaPrawna`, `kapital`
- `zarzad`: list of board members (imiona, nazwisko, funkcja)
- `udzialowcy`: list of shareholders with share count/value
- `powiazania`: list of related entities (current + historical if
  Premium plan active)
- `wpisyKrs`: last N entries, each with date and brief description
- `stan`: booleans for wykreślona / likwidacja / upadłość / zawieszenie

Cost: 3× 0.05 PLN = 0.15 PLN per uncached call.

### `get_financials`

Pull revenue / profit / costs / size-band across available years.

**Two-tier strategy — discovered via contract probe (2026-04-15):**

**Tier 1: current-year snapshot from basic-data (cheap, ~80% coverage).**
With Premium plan, endpoint 02 returns `ostatnie_sprawozdanie.glowne_pola`
inline — przychody, koszty, zysk, aktywa, pasywa, podatek_dochodowy —
for SMEs that file structured statements. That's the 80%+ case for
B2B scoring targets. No extra API call, no extra cost. `get_krs_info`
already exposes this; `get_financials(years=1)` reads the same source.

**Tier 2: historical time-series (expensive, partial coverage).**
Uses endpoints 10 + 11. Two probe-discovered gotchas:

- **`czy_ma_json` filter is mandatory.** Documents with
  `czy_ma_json: false` return literal `null` on endpoint 11, so we'd
  pay 0.50 PLN per call for nothing. GPW and other
  consolidated/large filers are almost entirely `czy_ma_json: false`.
  The client MUST filter to `czy_ma_json: true` before calling
  endpoint 11.
- **Partial coverage.** Smaller sp. z o.o. typically has JSON for
  some documents per period (specifically the "Roczne sprawozdanie
  finansowe"). Some years will return no JSON at all — degrade
  gracefully rather than fail.

Input:
- `krs` (integer, required)
- `years` (integer, optional, default **1** — yes, 1, not 3; most
  scoring cases want only the latest)

Behavior, two branches:

1. **Fast path** (`years=1` AND `ostatnie_sprawozdanie.glowne_pola`
   populated in the endpoint 02 cache):
   - Return from cache. Zero upstream call beyond the 02 fetch the
     caller already paid for.
2. **Historical path** (`years > 1`, OR the fast path returns no
   `glowne_pola`):
   - Call endpoint 10 — 0.05 PLN.
   - Filter `dokumenty[*]` to `czy_ma_json: true` AND `nazwa`
     containing "Roczne sprawozdanie finansowe".
   - For each of the top N, call endpoint 11 — 0.50 PLN each.
   - For periods where no matching JSON-bearing doc exists, emit a
     placeholder with `source: 'unavailable'` so the caller sees the
     gap explicitly.

Output:
```json
{
  "krs": 12345,
  "statements": [
    {
      "rocznik": 2024,
      "source": "basic_snapshot",
      "przychody": 3029247.85,
      "koszty": 2925887.47,
      "zysk": 92707.38,
      "aktywa": 636946.28,
      "pasywa": 636946.28,
      "podatek": 10653
    },
    {
      "rocznik": 2023,
      "source": "fin_document",
      "documentId": 987654,
      "przychody": 2800000.0,
      "zysk": 85000.0
    },
    {
      "rocznik": 2022,
      "source": "unavailable",
      "reason": "no_json_available"
    }
  ]
}
```

Cost per uncached call:
- Tier 1 (`years=1`, snapshot present): **0 PLN** beyond the 02 call
  already paid for by `get_krs_info`.
- Tier 2 (`years=3`): `0.05 + up to 3 × 0.50` = up to **1.55 PLN**,
  but only pays for JSON-bearing docs actually fetched.

Rejestr.io endpoints used: **10** + **11 (×N)** — historical path
only. Current-year comes from **02**. Requires **Rejestr.io Premium**.

## Rejestr.io endpoint mapping + cost

| # | Endpoint | Used by | Cost/call | Plan |
|---|----------|---------|-----------|------|
| 01 | wyszukiwanie-organizacji | `lookup_company` | 0.05 | base |
| 02 | podstawowe-dane-organizacji | `get_krs_info` | 0.05 | base |
| 03 | zaawansowane-dane-organizacji | `get_krs_info` | 0.05 | base (some chapters Premium) |
| 06 | powiazania-organizacji | `get_krs_info` | 0.05 | Premium for historical |
| 10 | lista-dokumentow-finansowych | `get_financials` | 0.05 | Premium |
| 11 | dokument-finansowy-organizacji | `get_financials` | **0.50** | Premium |

## Data model

### `rejestrio` DB (MCP service owns this)

```prisma
// rejestrio/prisma/schema.prisma

model CompanyProfile {
  id                Int       @id @default(autoincrement())
  krs               Int       @unique
  nip               String    @unique
  regon             String?   @unique
  nazwaPelna        String
  nazwaSkrocona     String?
  formaPrawna       String?
  pkdGlowny         String?
  siedzibaRaw       Json?     // whole adres object
  kontaktRaw        Json?     // emaile/www (if Biznes)
  stanRaw           Json?     // likwidacja/upadlosc flags
  basicRaw          Json?     // endpoint 02 full payload
  advancedRaw       Json?     // endpoint 03 full payload
  powiazaniaRaw     Json?     // endpoint 06 full payload
  fetchedAt         DateTime
  basicFetchedAt    DateTime?
  advancedFetchedAt DateTime?
  powiazaniaFetchedAt DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  financialDocuments FinancialDocument[]

  @@index([nip])
  @@index([pkdGlowny])
}

model FinancialDocument {
  id          Int       @id @default(autoincrement())
  companyKrs  Int
  rocznik     Int?
  dataOd      DateTime?
  dataDo      DateTime?
  przychody   Float?
  koszty      Float?
  zysk        Float?
  aktywa      Float?
  pasywa      Float?
  podatek     Float?
  rawPayload  Json      // endpoint 11 full response — don't lose anything
  fetchedAt   DateTime
  createdAt   DateTime  @default(now())

  company     CompanyProfile @relation(fields: [companyKrs], references: [krs])

  @@unique([companyKrs, rocznik])
  @@index([companyKrs])
}

model RequestAudit {
  id          Int       @id @default(autoincrement())
  endpoint    String    // "01" .. "11"
  krs         Int?
  nip         String?
  costPln     Float     // 0.05 or 0.50
  httpStatus  Int
  latencyMs   Int
  orgId       String?   // ragen org that triggered it (for chargeback)
  cached      Boolean   @default(false)
  error       String?
  createdAt   DateTime  @default(now())

  @@index([createdAt])
  @@index([orgId, createdAt])
}
```

`RequestAudit` is how we answer "how much did Rejestr.io cost us this
month" and "which org is driving the bill." Not optional — if pricing
is this high per call, we need to see it.

### ragen-app DB (this branch)

New fields on the existing lead table (TBD which one — probably
`ProjectLead` if it exists; else we add a minimal `Lead` model). All
optional; populated on enrichment.

```prisma
model ProjectLead {
  // ... existing fields ...

  // Enrichment snapshot — populated by MCP tool calls.
  // Intentionally denormalized so aggregate filters work as plain SQL
  // without cross-DB joins.
  nip                  String?
  companyKrs           Int?
  companyName          String?
  pkdMain              String?
  pkdCategory          String?
  revenueLast          Float?
  profitLast           Float?
  employeeSize         String?   // "mikro" | "mala" | "srednia" | "duza"
  isBankrupt           Boolean?
  isLiquidation        Boolean?
  companyEnrichedAt    DateTime?

  @@index([nip])
  @@index([pkdMain])
  @@index([revenueLast])
}
```

## Caching & cost strategy

TTL per data class:

| Data | TTL | Reason |
|------|-----|--------|
| Search results (01) | 7d | Search intent is user-specific; mildly cacheable. |
| Basic / advanced / powiązania (02,03,06) | 30d | KRS changes rarely; monthly refresh is plenty. |
| Financial document (11) | 365d | A filed statement never changes. Refresh only when a new `rocznik` appears. |
| List of documents (10) | 7d | Cheaper to re-fetch — this is how we detect a new filing. |

**Cost guardrails inside the MCP service:**

- Budget per org per day (env-configurable, default e.g. 20 PLN).
  Exceeded → tool returns structured error, chain surfaces it.
- Hard global kill-switch env var
  (`REJESTRIO_DISABLE_PAID_CALLS=true`) — returns only cached data
  when set. Useful for incident response.
- `RequestAudit` with per-org attribution from day one.

**What we do NOT do in phase 1:**

- No proactive refresh job. Everything is pull-on-demand.
- No share-the-cost model across orgs (technically possible since
  company data is public and the DB is global) — but we don't count
  cache hits as zero-cost for the requesting org either. Think about
  it in phase 2.

## Config & secrets

MCP service env (on Railway, per the existing ragen-mcp deployment
pattern):

```
REJESTRIO_API_KEY=<secret, from Rejestr.io dashboard>
REJESTRIO_BASE_URL=https://rejestr.io/api/v2
REJESTRIO_DATABASE_URL=postgresql://.../rejestrio
REJESTRIO_PLAN_TIER=premium    # base|premium|biznes — gates some features
REJESTRIO_DEFAULT_DAILY_BUDGET_PLN=20
REJESTRIO_DISABLE_PAID_CALLS=false
```

Auth header (important, non-RFC): the Rejestr.io API takes the raw key
in the `Authorization` header with **no scheme prefix**. Not `Bearer`.
Code comment will be explicit so nobody "fixes" it:

```ts
// Rejestr.io uses a bare-token Authorization header — NOT RFC 7235 /
// Bearer. `Authorization: sk_xxx` is correct. Do not prefix.
headers: { Authorization: REJESTRIO_API_KEY }
```

ragen-app env (for the connector enable flow):

```
MCP_REJESTRIO_SERVER_URL=https://<ragen-mcp-host>/mcp/rejestrio
```

## Rate limits & backpressure

Unknown from docs. Assume generous (e.g. 10 req/s burst, a few thousand
req/day). Implementation:

- Per-process concurrency cap of **4** in-flight Rejestr.io calls.
- Simple token-bucket at 8 req/s — configurable, tune after first prod
  exposure.
- On 429, exponential backoff with jitter, max 3 retries. On 5xx,
  fail fast (no retry), surface a structured error to the chain.
- `Retry-After` header respected if present.

## Testing

Per repo convention (see ragen-app CLAUDE.md §Testing Requirements):

- Unit tests for all scoring/parsing helpers — mock HTTP layer with
  `msw` (stable fixture JSON stored in `services/rejestrio/test/fixtures/`).
- Integration-style tests for the tool handlers that spin up the MCP
  server in-process and assert tool contracts (input schema + output
  schema stable).
- Cache-hit path tested explicitly — fixture in DB + mocked HTTP that
  would fail if called → tool must still succeed.
- DO NOT call real Rejestr.io in CI. Any test that does must be
  opt-in via env and tagged `@integration`.
- Add two smoke Playwright specs in ragen-app exercising the assistant
  flow end-to-end with a mocked MCP response.

## Local development — docker compose

**Per-service pattern.** Each ragen-mcp service owns its own
`docker-compose.yml` (matches ragen-token-vault, avoids coupling the
app stack to MCP infra). ragen-app's compose files stay focused on
the app.

For rejestrio specifically:

```bash
cd ../ragen-mcp/services/rejestrio
docker compose up -d postgres           # port 5434 — dedicated to rejestrio
npm run db:migrate:dev                  # apply Prisma migrations
npm run dev                             # start the MCP server
```

Port map across the org to avoid collisions:
- `5432` — ragen-app main Postgres
- `5433` — ragen-token-vault Postgres
- `5434` — rejestrio Postgres
- `8002` + `9002` — rejestrio HTTP + MCP httpStream

ragen-app's compose files (`docker-compose.yml`, `docker-compose.app.yml`)
do NOT need a block for any MCP service. Keep those focused on
ragen-app's own deps.

## Contract probe (before any production code)

Rejestr.io docs describe the superset of fields; real responses
drift. Before writing Zod schemas "for real" or relying on any field
in the scoring logic, run a dedicated probe against the live API.

### Location

Lives in the ragen-mcp repo as a workspace under
`services/rejestrio/` — same directory that will house the real MCP
server code in PR B. Keeping the probe, schemas, and fixtures
colocated with the service means the fixtures transition naturally
into the service's test corpus without any moves later.

```
ragen-mcp/services/rejestrio/          # npm workspace @ragen-mcp/rejestrio
├── package.json                       # scripts: probe, probe:dry, build
├── tsconfig.json                      # extends ragen-mcp/tsconfig.base.json
└── src/
    ├── probe/                         # probe + fixtures (this tool)
    │   ├── probe.ts
    │   ├── client.ts
    │   ├── companies.ts               # 3 curated KRS numbers
    │   ├── schemas/index.ts           # permissive Zod schemas (v3)
    │   ├── fixtures/                  # real responses, committed
    │   │   └── <endpoint>-<krsOrNip>.json
    │   └── README.md
    └── (PR B — MCP server, tools, cache, etc.)
```

Run commands:

```bash
# From this workspace:
cd ragen-mcp/services/rejestrio
npm run probe:dry                          # validate fixtures, 0 PLN
npm run probe -- --max-cost-pln 5          # live API run

# From ragen-mcp repo root:
npm run probe --workspace @ragen-mcp/rejestrio -- --dry-run
```

`REJESTRIO_API_KEY` and `REJESTRIO_PLAN_TIER` live in
`ragen-mcp/services/rejestrio/.env.local` (git-ignored). NOT in
ragen-app's env — that key is the MCP service's concern, not the
app's.

### What it does per company × endpoint

1. Make a real Rejestr.io call using `Authorization: <api_key>`.
2. Save raw JSON response to `fixtures/<endpoint>-<krs>.json`.
3. Zod-validate against the paired schema.
4. If a previous fixture exists, diff against it — flag API drift.
5. Accumulate cost.

At end: print schema violations + total cost + drift report.

### Guardrails

- `--max-cost-pln <n>` (default 5). Probe aborts if projected cost
  exceeds. Prevents a typo from billing us.
- `--dry-run` validates existing fixtures without HTTP calls
  (this is the one that's safe to run anywhere, including CI).
- `REJESTRIO_API_KEY` from `.env.local`; fail-loud if missing.
- Never imported by any production code or test. CI never runs it
  with real calls.

### Test company archetypes

Goal: cover response diversity in the smallest number of companies.
Three is usually enough:

1. **Large SA / GPW** — richest response. Tests happy path, all
   optional fields populated.
2. **Small sp. z o.o.** — sparse response. Tests null handling.
3. **Wykreślona / w upadłości / w likwidacji** — dead-state flags
   set. Tests that scoring correctly de-ranks insolvent companies.

Actual KRS numbers: TBD (owner must pick — production-relevant
examples are better than famous ones).

### Expected cost per full probe run

- 7 endpoints × 3 companies = 21 × 0.05 = **1.05 PLN**
- Plus 2 financial docs × 3 companies = 6 × 0.50 = **3.00 PLN**
- **Total: ~4.05 PLN per run**

Subsequent dry-runs against committed fixtures: 0 PLN.

## Deployment

- ragen-mcp repo gets a new service directory. Follow the existing
  `services/google/` pattern (FastMCP + Hono, Dockerfile, Railway
  service definition).
- ragen-mcp shared infra (logger, auth middleware) lives in
  `packages/`; reuse.
- PG migration on the new `rejestrio` DB runs on deploy.
- Secrets injected via Railway.

## Work breakdown

### Phase 1 — this ticket (two PRs)

**PR A — ragen-app (this branch):**
1. Prisma migration: lead snapshot fields listed above.
2. Server action / query to upsert the snapshot after a tool call.
3. A place in the chat stream code that calls the upsert with the MCP
   tool result, if the result looks like a company profile.
4. Connector plumbing: add `REJESTRIO` to `McpConnectorProvider` enum,
   wire into the Settings > Connectors UI, hook into
   `createMcpToolsFromConnectors()`.
5. Tests.

**PR B — ragen-mcp (separate branch in that repo):**
1. Scaffold `services/rejestrio/` from `services/google/` template.
2. Prisma schema + migration for the `rejestrio` DB.
3. `RejestrioClient` — thin HTTP client with the bare-token auth.
4. Cache repository — read-through / write-through by
   `(endpoint, krs)` key with TTL logic.
5. Three MCP tools wired up.
6. `RequestAudit` emission on every upstream call.
7. Per-org daily budget guard.
8. Tests (fixtures-based).
9. Railway deployment config.

### Phase 2 — followups (new ticket)

- GUS REGON BIR1 integration (free fallback for PKD + headcount band).
- Wappalyzer technography — "ta firma używa Salesforce, sygnał
  zainteresowania tech" signal.
- `resolve_email_to_company` tool — domain → NIP pipeline with
  free-domain filter list.
- Proactive refresh job (scheduled Temporal workflow) that re-pulls
  companies whose last statement is > 1 year old.
- Cross-org cache sharing with proper cost attribution.

## Open questions (confirm before PR A)

1. ~~**Plan tier** — confirmed Premium?~~ **Confirmed Premium** (2026-04-15). All three phase-1 tools available.
2. **Lead table name** — is it `ProjectLead`, `Lead`, or do we need
   to create one? Affects PR A migration.
3. **Connector UI copy** (PL) — who writes it, me or you?
4. **Budget default** — 20 PLN/org/day reasonable, or tune?

## Pricing quick-reference

| Action | Calls | Cost |
|--------|-------|------|
| Lookup by NIP (cache miss) | 1× #01 | 0.05 PLN |
| Full KRS info (cache miss) | 3× endpoints | 0.15 PLN |
| Financials, 3 years (cache miss) | 1× #10 + 3× #11 | 1.55 PLN |
| Full enrich (all three, miss) | everything above | **~1.75 PLN** |
| Any of the above on cache hit | 0 | 0 PLN |

At Rejestr.io scale, getting to cache-hit > 80% within a few weeks of
use is the thing that makes this feature economically viable.
