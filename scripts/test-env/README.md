# Offline test environment

Brings up the whole chain — Postgres, Redis, Qdrant, ragen-token-vault,
apps/api, apps/worker, apps/mcp — on a machine with **no egress to any model
provider**, ingests a small corpus, and then checks that apps/api, apps/mcp and
`@webamigos/ragen-sdk-ts` all answer from it.

It exists because the usual way of proving these three work — point them at
real Azure/Bedrock/Vertex/Scaleway credentials and ask a question — is not
available everywhere, and "we could not reach a provider" is not the same as
"it works".

## What is real and what is not

Real: the database and its migrations, Redis and the BullMQ queues, Qdrant with
hybrid dense+sparse vectors, opaque API keys validated against the token vault,
the ingest pipeline, the retrieval filters, the chat chain, the MCP transport
and the published SDK's own code.

Not real: **the model**. `stub-llm-server.mjs` serves an OpenAI-compatible
`/v1/embeddings`, `/v1/chat/completions` and `/v1/moderations` on port 4599, and
`routes.local-stub.yaml` points every model id at it.

- Embeddings are a hashed bag of words, L2-normalised, 384 dims. Lexical, not
  semantic: a query and a chunk that share rare words score high. Enough to
  exercise chunking, the Qdrant round-trip, hybrid search and reranking order.
- Chat answers **only** from the `<chunk>` elements the application put in the
  prompt, by picking the sentences that overlap the question. So an answer can
  carry a fact only if retrieval actually supplied it — which is what the
  assertions check.

This says nothing about answer quality. Measuring that needs a real model and
the harnesses in `apps/web/evals` (ADR-20).

Because the embeddings are lexical, the Polish test questions are written with
diacritics, matching the corpus. A real embedding model would not care.

## Bringing it up

```bash
docker compose up -d postgres redis qdrant

# Root .env.local — DATABASE_URL, REDIS_URL, QDRANT_URL, the secrets, plus:
#   LLM_ROUTES_PATH=<repo>/infra/llm-gateway/routes.local-stub.yaml
#   EMBEDDINGS_MODEL=stub-embed
#   VECTOR_SIZE=384
#   LLM_SCALEWAY_BASE_URL=http://127.0.0.1:4599/v1   (and SCW_API_BASE, which
#                                                     apps/worker validates)
#   OPENAI_API_KEY=stub-key, OPENAI_BASE_URL=http://127.0.0.1:4599/v1
# Do NOT put PORT in the root file — see the test report.

npx prisma migrate deploy
npm run db:seed

node scripts/test-env/stub-llm-server.mjs &
npx tsx --env-file=.env.local scripts/test-env/setup-tenant.ts   # prints the API key
npm run api:dev &
npm run worker:dev &
npm run dev --workspace=@webamigos/ragen-mcp &
```

ragen-token-vault is a separate repository; clone it, give it its own database
and `RAGEN_TOKEN_VAULT_SERVICE_SECRET` matching the root `.env.local`, and run
it on 3100 with `HOST=127.0.0.1` (it binds `::` otherwise, which fails where
IPv6 is unavailable).

## Running the checks

```bash
export RAGEN_API_KEY=sk-...          # from setup-tenant.ts

# upload the corpus
for f in scripts/test-env/sample-docs/*.md; do
  curl -sS -X POST http://127.0.0.1:3001/v1/files \
    -H "Authorization: Bearer $RAGEN_API_KEY" \
    -F "file=@$f;type=text/markdown" -o /dev/null
done

# then, once every file reports `processed`:
(cd apps/web && npx tsx src/scripts/backfill-accessible-by.ts)

node scripts/test-env/test-api.mjs
node scripts/test-env/test-mcp.mjs
SDK_DIR=<ragen-sdk-ts checkout> node scripts/test-env/test-sdk.mjs
```

The backfill step is **not** housekeeping — it works around a defect. Ingest
never writes `metadata.accessible_by`, and the chat path retrieves at `member`
scope, so without it a freshly ingested document is invisible to chat while
`/v1/search` can still see it. The report has the detail.
