# ADR-31: Only Qdrant is a supported vector store

**Status:** Accepted
**Date:** 2026-09-01
**Related:** [ADR-08](08-meilisearch-vector-store.md), [ADR-11](11-qdrant-vector-store.md), [ADR-14](14-hybrid-search-dense-sparse.md), [ADR-26](26-absorb-ragen-worker-into-monorepo.md)

## Context

Three vector-store clients exist in the tree — Qdrant, Meilisearch and Supabase
— and all three were selectable through an organization's `vectorStore` column
and the `DEFAULT_VECTOR_STORE` environment variable. A review found that only
one of them works end to end, and that the other two fail in the worst way
available.

**Nothing writes to them.** ADR-26 moved ingest into `apps/worker`, whose
`addDocumentsToVectorStore` activity calls `qdrantService.addDocuments`
unconditionally. The organization's setting is never read on the write path.
Retrieval *does* honour it. So an organization set to `meilisearch` or
`supabase` reads from a store nothing has ever filled and gets zero results,
with no error anywhere — indistinguishable from a knowledge base that genuinely
has no answer. The in-app ingest path that used to honour the setting,
`apps/web/src/app/api/threads/services/saveDataInVectorTable.ts`, has no
remaining callers.

**The Supabase schema contradicted the embedder.** The migration declared
`vector(1536)` — "1536 works for OpenAI embeddings", from before ADR-11 — while
`DEFAULT_VECTOR_SIZE` is 3584 for `bge-multilingual-gemma2`. Every insert would
have been rejected on a dimension mismatch even if ingest had reached it.

**Neither alternative can do hybrid search.** ADR-14's dense + BM25 sparse
retrieval with server-side RRF is implemented against Qdrant's named vectors
and `modifier: 'idf'`. `SupabaseVectorStoreClient.similaritySearch` issues a
single dense `match_documents` RPC. An install on either alternative would get
materially different retrieval quality from what the ADRs describe, silently.

Deletion, by contrast, is genuinely implemented per backend in
`apps/api/src/documents/delete-file-from-vector-store.service.ts`, and the
organization-scoping filter in `createSupabaseVectorStore` is correctly
applied. The code is not junk. It is just not connected at the write end.

## Decision

Qdrant is the only supported backend. The clients stay; the pretence that they
are selectable does not.

`packages/rag-core/src/vector-store-backends.ts` holds the distinction
explicitly: `KNOWN_VECTOR_STORES` is the three clients that exist,
`SUPPORTED_VECTOR_STORES` is the one the worker writes to.
`resolveDefaultVectorStore()` **throws** on `DEFAULT_VECTOR_STORE=supabase`
rather than falling back to Qdrant, because a silent substitution leaves the
operator believing their configuration took effect. It is called from all three
places that stamp a backend onto a new organization.

Organizations created before this still carry the old value, and their rows are
not rewritten — that is a data migration with no obviously right answer, since
the operator may have an external store they intend to keep. Both retrieval
entry points now log a warning naming the organization when its backend is one
the worker never writes to.

The Supabase migration is corrected to 3584 and carries a header saying plainly
that the backend does not work as shipped.

## Consequences

**Good.** The failure is loud and early instead of silent and permanent. An
install misconfigured this way finds out at organization creation, naming the
variable, rather than through a support ticket about a knowledge base that
"stopped answering".

**Cost.** An install currently running `DEFAULT_VECTOR_STORE=supabase` will now
fail to create organizations. That install was already broken — its retrieval
returned nothing — but the breakage moves to a more visible place, which is the
point and is still a behaviour change.

**Not done.** Making the alternatives work would mean teaching the worker to
route by the same setting, deriving the Supabase schema width from
`VECTOR_SIZE`, and accepting dense-only retrieval as a documented trade-off.
That is worth doing if someone actually wants Supabase; it is not worth doing
speculatively. Widening `SUPPORTED_VECTOR_STORES` without the worker change
reintroduces exactly the failure this ADR removes — the test in
`packages/rag-core/src/__tests__/vector-store-backends.test.ts` says so.
