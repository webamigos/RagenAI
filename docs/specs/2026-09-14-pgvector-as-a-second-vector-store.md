---
title: pgvector as a second, selectable vector store
status: draft
areas: [rag, worker, api, architecture, docs]
adrs: [11, 14, 20, 26, 31, 33, 37]
---

# pgvector as a second, selectable vector store

## TLDR

Ragen needs a Qdrant container to answer a single question, which is one
service too many for a small self-hosted install that already runs Postgres.
This adds `pgvector` as a second backend behind the `Organization.vectorStore`
selector that already exists, so a "light" install stores its chunks in the
database it already has. The non-obvious part: **pgvector cannot reproduce what
we currently call hybrid search.** Qdrant scores our BM25 sparse vectors
server-side with `modifier: idf`; Postgres has no equivalent, so the lexical
half becomes `tsvector`/`ts_rank_cd` and the fusion moves from Qdrant's Query
API into our own SQL. That is a different retrieval system, not a port, and
[ADR-20](../adrs/20-pause-and-measure-rag-quality.md) says we measure it before
we recommend it.

## Answered

- **Q1 — the backend is chosen per install.** Confirmed 2026-09-14.
  `Organization.vectorStore` stays the column every read path consults, because
  it already is one, and `DEFAULT_VECTOR_STORE` stamps it at organization
  creation. No UI offers the choice, and no install is expected to mix
  backends. One consequence is load-bearing: flipping `DEFAULT_VECTOR_STORE` on
  a running install changes nothing for the organizations already on it — their
  column still says `qdrant`, so they keep reading from Qdrant. Given Q5 that is
  the safe behaviour rather than an oversight, and it is what makes "per
  install" implementable without a migration.
- **Q4 — one shared package.** Confirmed 2026-09-14. `packages/vector-store`,
  pgvector only, built to CommonJS with the same `tsconfig` shape as
  `packages/rag-core`, so `apps/api`'s `module: nodenext` can consume it without
  the `require()` interop workaround that `@qdrant/js-client-rest` needs in
  three files today.
- **Q5 — an organization cannot switch backends.** Confirmed 2026-09-14. The
  choice is made at creation; changing it means re-indexing every document,
  which is an operator procedure documented in `docs/vector-store.md`, not a
  setting.
- **Q2 — no quality threshold is fixed in advance, and it does not block this.**
  Reclassified rather than answered, because it is not structural: it changes
  nothing about what gets built. Qdrant stays the default whatever the
  measurement says, so the number decides what the documentation _claims_, not
  whether the backend ships. The decision moves into Phase E, where the numbers
  exist, under a default rule — if pgvector retrieves materially worse, it ships
  as "light profile, lower recall, here is the number" rather than quietly, and
  rather than not at all.

## Open Questions

<!--
While this block is here, the spec is not ready to implement and no code
should be written from it.
-->

- **Q3 — does the 1024-dimension light embedding profile ship in this spec, or
  as a follow-up?** The research is done and written up under
  [The embedding model is the real lever on install size](#the-embedding-model-is-the-real-lever-on-install-size).
  It forces a choice rather than settling one: the current model must not be
  truncated, but a model that can be is already provisioned — at the cost of
  adding truncation to `packages/rag-core`, a third arm to the Phase E
  measurement, and a second supported dimensionality to carry from then on.
  _Recommendation: ship it here. 3584 dimensions are what make the pgvector
  profile expensive, so a "light install" without this is the headline without
  the thing in the headline._

## Problem

### The install is ten containers, and one of them exists only to hold vectors

`docker compose up` starts postgres, qdrant, temporal, temporal-ui,
litellm-postgres, litellm, docling, presidio-analyzer, presidio-anonymizer and
redis. Several of those are being questioned independently — the LiteLLM proxy
has [its own retirement spec](2026-09-14-replace-litellm-with-an-in-process-gateway.md)
dated the same day as this one. Qdrant is the easiest of them to remove,
because the thing it does has a Postgres implementation that is a `CREATE
EXTENSION` away, and Postgres is not optional: the schema, Better Auth and
Temporal all live in it.

The people this blocks are concrete:

- **Self-hosters on managed Postgres.** RDS, Cloud SQL, Neon, Supabase and
  Railway all ship pgvector. None of them ship Qdrant, so an install that
  otherwise needs no container orchestration acquires one.
- **`create-ragen-app` users.** The first-run path provisions the whole stack.
  Every service in it is a way for the first run to fail.
- **Evaluators.** "Try Ragen" currently means "run ten containers".

### Everything is already shaped for a second backend, and the shape is a trap

`Organization.vectorStore` exists, the `VectorStoreClient` interface exists, and
the read paths branch on the column. [ADR-31](../adrs/31-only-qdrant-is-a-supported-vector-store.md)
is the record of what that shape cost us: two backends were _selectable_ and
neither was ever _written to_, because ingest moved into `apps/worker` and the
worker writes to Qdrant unconditionally. An organization set to `supabase` read
from an empty store and returned nothing, indistinguishable from a knowledge
base with no answer.

So the constraint on this work is written down already, with a test behind it:

> Widening `SUPPORTED_VECTOR_STORES` without the worker change reintroduces
> exactly the failure this ADR removes — the test in
> `packages/rag-core/src/__tests__/vector-store-backends.test.ts` says so.

The worker routing is therefore not a later phase. It is the first one.

## Out of scope

- **Reviving Meilisearch or Supabase.** They stay exactly as ADR-31 left them:
  known, unsupported, unwritten. The Supabase client is the closest thing to
  prior art here and is _not_ the starting point — it is dense-only, applies its
  filter through a constructor rather than the intermediate filter format, and
  calls an RPC that lives outside this repository.
- **Making pgvector the default.** Qdrant stays `DEFAULT_VECTOR_STORE`. This
  adds a choice; it does not change the recommended one.
- **Removing the Qdrant container from the default compose file.** The light
  profile is opt-in, and lives in `create-ragen-app` plus a documented compose
  override.
- **Migrating existing vectors between backends.** See Q5.
- **pgvectorscale, ParadeDB `pg_search`, or any other extension.** They are more
  software, which is the thing this spec is trying to have less of. Stock
  pgvector plus stock Postgres full-text search only.
- **Porting the Qdrant client into the shared package.** Tempting while we are
  here, and a different change with a different risk profile.
- **Row-level security on the chunk table.** The app connects as the schema
  owner; RLS would be defence in depth against a bug in one file. Noted in
  Failure modes, not built.

## Relationship to the other 2026-09-14 specs

Four specs written on 2026-09-14 share one shape: **a seam, and a second
implementation behind it.** Two of them make a concern selectable and change
no default — the vector store and the document parser. The other two retire
something: the LiteLLM proxy, gone from `main` since 2026-09-15 (#1194), and
Temporal, which the worker spec replaced with BullMQ by a decision taken the
same day.

The install-size argument is what motivates them, and **this spec is one of the
two that leaves the incumbent in place.** Qdrant stays `DEFAULT_VECTOR_STORE`
and Docling stays the default parser — both written in the relevant spec's own
_Out of scope_. The job runtime is no longer in that group: BullMQ replaces
Temporal, whose adapter moves to `webamigos/ragen-enterprise` and is supported
from there.

| Spec                                                                           | Makes selectable                             | The incumbent, afterwards                            | What choosing the alternative costs                          |
| ------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| [BullMQ is the worker runtime](2026-09-15-bullmq-is-the-worker-runtime.md)     | — it **replaces** rather than adds           | Temporal leaves the default install and the repository; its adapter is supported from `ragen-enterprise` | no replay anywhere — a crash re-runs the job from the top; Redis becomes required |
| [pgvector](2026-09-14-pgvector-as-a-second-vector-store.md)                    | the vector store (`Organization.vectorStore`) | Qdrant stays the default, and the recommendation      | a shared failure domain with Postgres, and different retrieval numbers |
| [Mistral Document AI](2026-09-14-mistral-document-ai-as-a-second-parser.md)    | the document parser (`DOCUMENT_PARSER`)      | Docling stays the default                            | documents leave the deployment                                |
| [LiteLLM retirement](2026-09-14-replace-litellm-with-an-in-process-gateway.md) | — it replaced rather than added              | **done**: the proxy is gone from `main` (#1194)      | provider keys live in the application processes               |

The container count is now partly a default and partly a **consequence
available to an operator who selects every alternative**. `litellm` and
`litellm-postgres` are already gone; `temporal` and `temporal-ui` go with the
worker spec whether an operator chooses anything or not; `qdrant` and `docling`
go only for a profile that opts out of them. Nine compose services become seven
by default, four for that profile, and one once the BullMQ spec's Phase F puts
queues on Postgres and Presidio stays optional — though that spec also promotes
Redis from optional to required, so the arithmetic is smaller than it looks.
**These two specs subtract no capability; each adds a choice**, and the
elasticity is the deliverable.

That is worth stating in each spec because the reviewer of any one of them is
looking at a quarter of a programme, and the reason to accept a trade-off in one
is usually written in another.

Three ADR numbers are reserved so the phases do not collide, since two of these
specs originally both claimed ADR-44: **44** the job runtime, **45** the vector
store, **46** the document parser. They are reserved, not ordered — whichever
lands first writes its own number.

Three couplings are specific enough to act on here:

1. **The worker's vector activity is claimed by two specs.** B1 makes
   `addDocumentsToVectorStore` dispatch on the organization's backend and B2
   renames the directory; the BullMQ spec's C3 makes the same function delete
   this file's existing vectors before writing, because BullMQ re-runs a crashed
   job from the top and Qdrant's random point ids turn that into duplicated
   chunks. **The pgvector client should satisfy that requirement from the
   start** — it gets it more cheaply than Qdrant does, because a
   `DELETE … WHERE organization_id = $1 AND file_id = $2` in the same
   transaction as the insert is idempotent by construction. A1 states it in the
   client's contract rather than leaving it to a later spec to retrofit.

2. **D3 writes to a file another spec deletes.** It provisions
   `qwen3-embedding-8b` in `infra/litellm/config.yaml`; the LiteLLM retirement
   spec replaces that proxy with `packages/llm-gateway`. The model needs
   provisioning either way — the step belongs in whichever model registry
   exists when it lands, and D3 should be read as "provision it", not as "edit
   that file".

3. **The Phase E measurement has to pin the parser.** E1 compares three arms
   over one corpus. The Mistral spec changes the markdown that feeds chunking
   and says plainly that it is _not_ measured against the Docling baseline; a
   three-arm run over a Mistral-parsed corpus moves two variables and settles
   neither. E1 pins `DOCUMENT_PARSER=docling` and the published result says so,
   per ADR-20.

## Proposed solution

A `PgVectorStoreClient` in a new `packages/vector-store`, implementing the same
`VectorStoreClient` contract, storing every chunk in one `document_chunks` table
in the application's own database, and retrieving with dense HNSW + Postgres
full-text search fused by Reciprocal Rank Fusion in SQL.

### What pgvector can and cannot do, against what we do today

| What Qdrant does today                                  | pgvector equivalent                                  | Consequence                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Named dense vector, 3584 dims, cosine                   | `halfvec` column, `halfvec_cosine_ops` HNSW          | `vector` caps HNSW at 2000 dims, `halfvec` at 4000. 3584 only indexes as `halfvec`, i.e. fp16, and the precision loss must be in the measurement. At 2000 dims or fewer the column is plain `vector` and the question does not arise — see the light profile below. |
| Named sparse vector, BM25 with server-side IDF          | **none**                                             | `sparsevec` exists but ranks by inner product, not BM25, and caps at 1000 non-zero elements per indexed row. Maintaining IDF ourselves means rewriting every row as the corpus grows. Rejected.                                                                     |
| Lexical retrieval over `@ragenai/rag-core`'s `encode()` | `to_tsvector('simple', content)` + `ts_rank_cd`      | The shared BM25 encoder is **not used on this path**. `simple` does no stemming, which is what the current tokenizer does too — so it is the closest available match, not a downgrade in that specific respect.                                                     |
| Server-side RRF over two prefetch branches              | RRF over two CTEs in one SQL statement               | The fusion constant is ours to choose (60, the standard) where Qdrant's is not exposed. The two backends will not produce identical orderings even given identical candidates.                                                                                      |
| Collection per organization                             | One table, `organization_id` column                  | **This is the security-relevant change.** See below.                                                                                                                                                                                                                |
| Payload indexes on four metadata fields                 | Real columns + btree/GIN indexes                     | `accessible_by` becomes `text[]` with a GIN index; `match_any` becomes the `&&` overlap operator.                                                                                                                                                                   |
| `setPayload` by filter (permission sync)                | `UPDATE … SET accessible_by = $1 WHERE file_id = $2` | Strictly simpler, and transactional.                                                                                                                                                                                                                                |
| Filter applied inside the HNSW search                   | Filter applied **after** the index scan              | Without `hnsw.iterative_scan`, a selective filter (one project, one user's files) returns fewer than `k` rows from a large shared table. Set `iterative_scan = relaxed_order` per query. This is the single most likely way this ships subtly broken.               |
| Collection fixes dimensionality at creation             | Column typed at first use                            | Same failure, different message. Covered by `ensureSchema()` below.                                                                                                                                                                                                 |

### The embedding model is the real lever on install size

`bge-multilingual-gemma2` is 3584-dimensional, and that single number is what
makes the pgvector profile heavy: ~7.2 KB per chunk as `halfvec`, a comparable
HNSW index, roughly 1.5 GB of Postgres per 100k chunks. Halving the dimension
more than halves both, and at 2000 dimensions or fewer pgvector indexes the
plain `vector` type — no `halfvec`, so no fp16 rounding either.

Four things were checked, and the order matters, because the cheapest option is
the one that fails:

1. **Truncating the current model is not safe.** Scaleway's documentation says
   `bge-multilingual-gemma2` "features Matryoshka embeddings" and that "a
   4096-dimension vector can be truncated to its 768 first dimensions". BAAI's
   own model card mentions Matryoshka, MRL, truncation and variable dimensions
   exactly zero times, and the model's `config.json` reports
   `hidden_size: 3584` — the claim is wrong about the number it is making.
   Truncating a model that was not trained for it degrades retrieval silently.
   **Do not truncate this model.**
2. **Scaleway will not truncate it for us either.** Their Embeddings API lists
   `dimensions` among the unsupported parameters. Any truncation is ours to do
   client-side, followed by L2 re-normalisation — cosine over a truncated vector
   means nothing until it is renormalised.
3. **A model that genuinely supports it is already provisioned.**
   `qwen3-embedding-8b` sits in `infra/litellm/config.yaml` today, as the
   reranker, because Scaleway's `/v1/rerank` is a bi-encoder over its vectors.
   It is MRL-trained with user-defined output dimensions from 32 to 4096, has a
   32k context, and was top of the MTEB multilingual leaderboard at 70.58. Same
   provider, same credentials, same proxy entry.
4. **At full width it does not fit pgvector at all.** 4096 dimensions exceeds
   `halfvec`'s 4000-dimension HNSW ceiling, so on pgvector this model _must_ be
   truncated. The trade-off is a forcing function, not a preference.

The light profile is therefore `qwen3-embedding-8b` truncated client-side to
1024 and renormalised, stored as `vector(1024)`. The default profile is
unchanged: `bge-multilingual-gemma2` at 3584, stored as `halfvec`.

Truncation has to be allow-listed per model, not inferred from `VECTOR_SIZE`.
Today a `VECTOR_SIZE` smaller than the model's native width is a loud failure —
every upsert rejected. The moment truncation exists, the same misconfiguration
becomes _silent truncation of a model that cannot take it_, which is strictly
worse. So `packages/rag-core` carries an explicit list of models whose vectors
may be shortened, and for anything not on it a too-small `VECTOR_SIZE` keeps
throwing.

One interaction belongs here before someone trips on it: an install that embeds
with `qwen3-embedding-8b` **and** reranks through Scaleway's `/v1/rerank` is
asking a bi-encoder to correct a ranking produced by its own vectors. The rerank
stage then costs latency and money for approximately nothing. Reranking is
opt-in (`FEATURE_FLAG_RERANKING=1`) and off in the light profile, so this is a
documentation obligation rather than a bug — but it is exactly the sort of thing
switched on later by someone who read "reranking improves quality".

### Tenant isolation stops being structural

Today an organization's chunks are in their own Qdrant collection named by org
id. A filter bug widens retrieval _within_ one organization. In one shared
table, the same bug crosses organizations.

Three things answer that, and the spec is not implementable without all three:

1. The client takes `organizationId` as a **constructor argument**, not from the
   filter, and every statement it emits — search, insert, delete, update — has
   `organization_id = $1` appended by the client itself. A caller cannot omit it
   because a caller cannot express it.
2. The filter translator **throws on a key it does not recognise**. The
   intermediate format is `metadata.organization_id`, `metadata.project_id`,
   `metadata.file_id`, `metadata.accessible_by`, plus `is_null`. Anything else
   is a caller bug, and silently ignoring it is how a filter becomes wider than
   its author believes — the failure this repository keeps meeting from
   different directions.
3. The table is registered in `TENANT_SCOPED_MODELS` **and** carries its own
   unit test asserting the org predicate, because the tenant-scope guard is a
   Prisma extension and this client issues raw SQL that the guard never sees.

### Why one table and not one per organization

A schema or table per organization would mirror Qdrant's isolation exactly and
give each tenant its own small HNSW graph. It also means DDL on every signup,
thousands of tables in `pg_class`, and a migration story per tenant. For the
install size this spec targets — a handful of organizations, tens of thousands
of chunks — a single table indexed on `(organization_id, …)` is the right
trade. Declarative `HASH` partitioning by `organization_id` is the escape hatch
if an install outgrows it, and changes no application code.

### Why the schema is created lazily

`VECTOR_SIZE` decides the column and index types, and it is an environment
variable that must be settled before the first document is indexed —
`create-ragen-app`'s manual-setup text already says this about Qdrant
collections. A static migration cannot read it. So the migration creates the
extension, the table and the dimension-independent indexes, and the client
creates the dimension-typed HNSW index on first use, memoised per process
exactly as `ensureCollection()` is today.

The alternative — pinning 3584 into the migration — was rejected because it
makes `VECTOR_SIZE` a lie on the pgvector path, and the mismatch would surface
as rejected inserts long after ingest looked fine. That exact failure is
recorded in `vector-contract.ts`.

## Core surfaces touched

| Surface                           | Change                                                                                                                                                                                  | What catches a mistake                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`            | New `DocumentChunk` model, `Unsupported("halfvec")` embedding column, `@@map("document_chunks")`; a raw-SQL migration for `CREATE EXTENSION vector` and the generated `tsvector` column | migration + `npm run verify`; the model is never read through Prisma Client                    |
| `packages/rag-core`               | `SUPPORTED_VECTOR_STORES` gains `'pgvector'`; the dense/sparse vector names become documented as Qdrant-specific; MRL truncation plus the allow-list of models it may be applied to     | `vector-store-backends.test.ts` (updated deliberately, see Phase C), plus new truncation tests |
| `packages/vector-store` **(new)** | The pgvector client, filter translator and SQL                                                                                                                                          | package tests + integration tests against a real Postgres; consumers web / api / worker        |
| `packages/platform-contracts`     | `DocumentChunk` added to `TENANT_SCOPED_MODELS`                                                                                                                                         | `tenant-scope` package tests                                                                   |
| `packages/env`                    | `pgvector` fragment (none — it reuses `DATABASE_URL`), `VECTOR_STORE_*` group text updated                                                                                              | `config-groups.test.ts`                                                                        |
| `packages/create-ragen-app`       | Light profile: pgvector image, no Qdrant service, `DEFAULT_VECTOR_STORE=pgvector`                                                                                                       | `create-ragen-app-manifest-is-current.test.ts` + its own tests                                 |
| auth / tenant scoping             | The client's own org predicate replaces collection isolation                                                                                                                            | new unit tests; guard tests do **not** cover raw SQL                                           |
| `docker-compose.yml`              | `postgres:16` → `pgvector/pgvector:pg16`                                                                                                                                                | the stack starting; `CREATE EXTENSION` failing loudly otherwise                                |

`apps/web`, `apps/api` and `apps/worker` each gain a branch where they already
branch on `orgMetadata.vectorStore`. The worker gains its first one.

## Data model

```sql
-- migration: extension + table
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL,
  file_id         text        NOT NULL,
  project_id      text,
  accessible_by   text[]      NOT NULL DEFAULT '{}',
  content         text        NOT NULL,
  metadata        jsonb       NOT NULL DEFAULT '{}',
  embedding       halfvec     NOT NULL,
  content_tsv     tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX document_chunks_org_file_idx      ON document_chunks (organization_id, file_id);
CREATE INDEX document_chunks_org_project_idx   ON document_chunks (organization_id, project_id);
CREATE INDEX document_chunks_accessible_by_idx ON document_chunks USING gin (accessible_by);
CREATE INDEX document_chunks_tsv_idx           ON document_chunks USING gin (content_tsv);
```

```sql
-- ensureSchema(), once per process, dimension from VECTOR_SIZE
CREATE INDEX CONCURRENTLY IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks
  USING hnsw ((embedding::halfvec(3584)) halfvec_cosine_ops);
```

`halfvec` is the column type for the default 3584-dim profile. For the 1024-dim
light profile the client creates the column and index as plain `vector(1024)`,
which is exact rather than fp16 and roughly 40% smaller again. The type is a
function of `VECTOR_SIZE` — at most 2000, `vector`; above it, `halfvec` — and
that rule lives in one place in the client, next to `ensureSchema()`.

The four hot filter fields are real columns **and** stay inside `metadata`,
because `metadata` is round-tripped verbatim to readers that expect
`VectorStoreDocumentMetadata` — `source_regions`, `chunk_type`, `pii_mode` and
the rest are read from it by name. The columns are a projection for filtering,
not a replacement.

**Rows written before this change:** there are none. This table is new, and an
organization on Qdrant never touches it. Nothing is backfilled and nothing is
migrated; an organization created on pgvector starts empty and fills as its
documents are ingested.

### The query

```sql
WITH dense AS (
  SELECT id, row_number() OVER (ORDER BY embedding::halfvec($dim) <=> $query_vec) AS rank
  FROM document_chunks
  WHERE organization_id = $org AND <translated filter>
  ORDER BY embedding::halfvec($dim) <=> $query_vec
  LIMIT $k * 4
),
lexical AS (
  SELECT id, row_number() OVER (ORDER BY ts_rank_cd(content_tsv, query) DESC) AS rank
  FROM document_chunks, websearch_to_tsquery('simple', $q) AS query
  WHERE organization_id = $org AND content_tsv @@ query AND <translated filter>
  ORDER BY ts_rank_cd(content_tsv, query) DESC
  LIMIT $k * 4
)
SELECT c.content, c.metadata
FROM document_chunks c
JOIN (
  SELECT id, SUM(1.0 / (60 + rank)) AS score
  FROM (SELECT * FROM dense UNION ALL SELECT * FROM lexical) f
  GROUP BY id
) fused ON fused.id = c.id
ORDER BY fused.score DESC
LIMIT $k;
```

`$k * 4` is `PREFETCH_MULTIPLIER` from `@ragenai/rag-core`, reused so the two
backends over-fetch alike. The `lexical` CTE is omitted entirely when
`websearch_to_tsquery` yields an empty query, mirroring the existing dense-only
fallback for a question with no tokenizable content.

Per-statement settings, issued as `SET LOCAL` inside the same transaction:
`hnsw.ef_search = $k * 4` and `hnsw.iterative_scan = 'relaxed_order'`.

## Failure modes

- **`CREATE EXTENSION vector` is refused** (stock `postgres:16`, or a managed
  instance without the extension allow-listed). `ensureSchema()` must fail with
  the extension name, the image that has it and the `DEFAULT_VECTOR_STORE` value
  that led here — not with a bare `type "halfvec" does not exist`.
- **`VECTOR_SIZE` disagrees with the embedding model.** Inserts are rejected on
  a dimension mismatch, exactly as with Qdrant. The `inspect-environment` setup
  check already knows the dimensions of the models we ship; extend it to say
  that on pgvector the HNSW index also caps at 4000.
- **`VECTOR_SIZE` changed after the first document.** The existing HNSW index is
  typed to the old dimension and the cast fails. `ensureSchema()` must detect
  the mismatch and refuse with "re-index required", not create a second index.
- **A selective filter starves the HNSW scan.** Without `iterative_scan`, an
  org with few chunks in a large shared table gets fewer than `k` results and
  the answer silently degrades. Covered by an integration test that seeds two
  organizations and asserts full `k` for the smaller one.
- **A filter key the translator does not know.** Throws. A widened filter is
  worse than a failed request — this is the same reasoning as
  `assertOrgIdInFilter`.
- **The database is down.** Retrieval and chat fail together rather than
  separately; on Qdrant a Postgres outage and a Qdrant outage were two
  different incidents. Worth saying out loud in the docs: pgvector trades a
  service for a shared failure domain.
- **Two ingests race on `ensureSchema()`.** `CREATE INDEX CONCURRENTLY … IF NOT
EXISTS` plus the in-flight promise map, copied from `ensureCollection()`.
  Note that `CONCURRENTLY` cannot run inside a transaction.
- **An organization is deleted.** Qdrant leaves an orphan collection today.
  pgvector leaves orphan rows, which is worse because they count against the
  same table's index. A `DELETE … WHERE organization_id = $1` belongs in the
  same place, and does not exist for either backend today.
- **Backups get large.** Embeddings now live in the database that gets dumped.
  ~1.5 GB per 100k chunks at 3584 dims. Documented, not solved.

## Phases

### Phase A — the client, wired to nothing

- [ ] **A1.** Create `packages/vector-store` exporting `PgVectorStoreClient`
      implementing `VectorStoreClient`, on `pg.Pool`, with no Prisma
      dependency, built to CommonJS like `packages/rag-core`. Unit tests with a
      stubbed pool.
- [ ] **A2.** Filter translator: intermediate format to SQL predicates, throwing
      on unknown keys, with the `organization_id` predicate appended by the
      client and not derivable from input. Unit tests covering every filter
      shape emitted by `buildMetadataFilter`, `buildChatbotMetadataFilter` and
      the `metadataFilter` override path.
- [ ] **A3.** Prisma migration: extension, table, generated `tsvector` column,
      the dimension-independent indexes. `npm run verify` passes; nothing reads
      the table yet.
- [ ] **A4.** `ensureSchema()`: the dimension-typed column and HNSW index —
      `vector(n)` at n ≤ 2000, `halfvec(n)` above — memoised, concurrency-safe,
      and refusing a `VECTOR_SIZE` that contradicts what is already there.
- [ ] **A5.** Integration tests against a real Postgres with pgvector (compose
      service in CI): insert, hybrid search, filtered search, delete by file,
      permission update, and the two-organization starvation case.

### Phase B — the worker routes by the organization's setting

This phase lands with `SUPPORTED_VECTOR_STORES` still `['qdrant']`, so it
changes no behaviour. It is the precondition ADR-31 names.

- [ ] **B1.** `addDocumentsToVectorStore` and `deleteDocumentVectors` read the
      organization's backend and dispatch. Qdrant remains the only reachable
      branch; the pgvector branch is covered by tests, not by traffic.
- [ ] **B2.** Rename `apps/worker/src/activities/meilisearch/` to
      `vector-store/`. The directory has been misnamed since ADR-26 and this is
      the phase where ignoring that stops being free.

### Phase C — pgvector becomes selectable

- [ ] **C1.** Add `'pgvector'` to `KNOWN_VECTOR_STORES` and
      `SUPPORTED_VECTOR_STORES`, updating `vector-store-backends.test.ts` — the
      assertion is the guard, and changing it is the deliberate act ADR-31 asks
      for. Add `DocumentChunk` to `TENANT_SCOPED_MODELS`.
- [ ] **C2.** Route the read and delete paths that branch on the column today:
      `initializeBasicRag`, `initializePublicBasicRag`, `apps/api`'s
      `initialize-basic-rag.service`, and
      `delete-file-from-vector-store.service` + `TableService`.
- [ ] **C3.** Route permission sync — `sync-vector-permissions-command` and
      `vector-permissions.service` — which today logs "vector store update
      pending" for anything that is not Qdrant. On pgvector it is an `UPDATE`.
- [ ] **C4.** An architecture test asserting that every site branching on
      `vectorStore` handles every member of `SUPPORTED_VECTOR_STORES`. The
      failure ADR-31 describes was a switch that silently fell through, and a
      text-level guard is this repository's existing answer to that class.
- [ ] **C5.** `docker-compose.yml` to `pgvector/pgvector:pg16`; `setup`'s
      environment inspection reports the selected backend and what it needs.

### Phase D — the light embedding profile

Gated on Q3. Everything before this works at 3584 dimensions; this is what makes
the pgvector profile small enough to be worth calling light.

- [ ] **D1.** `packages/rag-core`: `truncateEmbedding()` — take the first `n`
      components and L2-renormalise — plus `MRL_CAPABLE_MODELS`, the explicit
      allow-list. A `VECTOR_SIZE` below a model's native width truncates only
      for a model on the list, and keeps throwing for every other. Unit tests
      for both branches, including the renormalisation.
- [ ] **D2.** Apply it at the two places embeddings are produced — the worker's
      `addDocuments` and the query path's `embedQuery` — so a truncated corpus
      and a truncated query cannot diverge. This is the same class of drift the
      vector contract exists to prevent, so the rule lives in `rag-core` and
      neither caller decides for itself.
- [ ] **D3.** Provision `qwen3-embedding-8b` as an embedding model in
      `infra/litellm/config.yaml` (it is there as a reranker; the entry is not
      reusable as-is), and document the profile:
      `EMBEDDINGS_MODEL=qwen3-embedding-8b`, `VECTOR_SIZE=1024`.

### Phase E — measure, then decide what we claim

- [ ] **E1.** Run the `rag-quality` eval dataset on the same corpus across three
      arms — Qdrant at 3584, pgvector at 3584, pgvector at 1024 — and publish
      `docs/rag-measurement-<date>-pgvector.md`, per ADR-20 and the
      `ragen-rag-change` skill.
- [ ] **E2.** Take the Q2 decision against those numbers and record it in
      ADR-45 (reserved — see _Relationship to the other 2026-09-14 specs_):
      pgvector is a supported backend with a measured retrieval profile,
      superseding the part of ADR-31 that says Qdrant is the only one.

### Phase F — the light install

Gated on Phase E, because until then there is no basis for recommending it.

- [ ] **F1.** `create-ragen-app` light profile: pgvector image, no Qdrant
      service, `DEFAULT_VECTOR_STORE=pgvector`, the 1024-dim embedding profile,
      and the manifest test updated.
- [ ] **F2.** `apps/docs/docs/self-hosting.md`, `quickstart.md`,
      `configuration-reference.md` and `docs/vector-store.md`: two profiles,
      what each costs, the shared failure domain, the reranker interaction from
      the light profile, and the "you cannot switch later without re-indexing"
      sentence.
- [ ] **F3.** Helm chart: make the Qdrant StatefulSet conditional.

## Testing

- **Unit** (`packages/vector-store`): filter translation, including a test that
  a filter without `organization_id` still produces an org-scoped statement, and
  that an unknown key throws. These are the tenant-isolation tests.
- **Integration** (`Packages / Test`, against a pgvector service container): the
  Phase A5 list. This is where the SQL is actually proven; a mocked pool proves
  string construction only.
- **Worker** (`npm run worker:test`): dispatch by organization setting, both
  branches, asserting the Qdrant path is unchanged for an org with no setting.
- **E2E**: one `p0-*` spec — upload a document, ask a question about it, assert
  a cited answer — running in a CI job with `DEFAULT_VECTOR_STORE=pgvector`.
  A `p1`–`p3` test would not gate the PR that breaks it, and the whole point of
  this backend is that its failure mode is an empty answer rather than an error.
- **Unit** (`packages/rag-core`): truncation renormalises, and truncation is
  refused for a model outside `MRL_CAPABLE_MODELS` — the second is the test that
  keeps a misconfiguration loud instead of silently halving retrieval quality.
- **Evals**: `rag-quality` across the three arms, per Phase E.

## Rollout and rollback

No feature flag. The gate is `SUPPORTED_VECTOR_STORES`, which is a code
constant with a test attached, and `DEFAULT_VECTOR_STORE`, which only affects
organizations created after it changes. That last clause is the whole rollout
story for an existing install: flipping the variable does not move anybody, and
per Q5 nothing moves them later either.

Migration order: the Prisma migration (Phase A3) is additive and safe on every
existing install — a table nothing writes to. The compose image change (C5) is
safe for an existing volume because the Postgres major version does not change;
`pgvector/pgvector:pg16` is `postgres:16` with the extension files added.

Rollback is asymmetric and that asymmetry is the risk worth stating plainly:

- **Before any organization has been created on pgvector**, reverting is
  reverting the PRs. The table is empty.
- **After**, those organizations' documents exist only in Postgres. Reverting
  the code strands them exactly the way ADR-31's organizations were stranded —
  a knowledge base that returns nothing, with no error. So the revert procedure
  is: set those organizations back to `qdrant` **and** re-index their documents,
  and that instruction ships with the feature, in `docs/vector-store.md`, before
  anyone can select it.
