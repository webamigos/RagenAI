---
title: 'A field added later is safe only if its absence means something — never default it'
modules: ['web', 'worker']
areas: ['architecture', 'rag']
topics: ['metadata', 'migrations', 'vector-store', 'backfill', 'ui-contracts']
---

# A field added later is safe only if its absence means something — never default it

**Context**: three fields were added to the retrieved-source contract in one
sequence — a real page (`source_page`), a reranker relevance score, and a
persisted snippet. In each case most existing data has no value and never will:
chunks already in Qdrant predate the page, reranking is opt-in so most
deployments compute no score, and retrieval rows written before the feature have
no snippet. A re-index is what upgrades a document; there is no backfill.

**Problem**: the tempting move is a default — page 1, score 0, empty string —
because it makes the rendering code simpler. Every one of those is a lie with a
different shape. `0` on a relevance bar reads as "this document scored zero",
which is a claim about the document when the truth is a fact about the
deployment. An empty snippet renders an empty quote. A defaulted page is the
original `page_number` bug with a migration bolted on.

The mirror-image mistake is a truthiness check. The spec for the relevance
score said a field renders "only when it holds something true" — which would
hide a real `0`, the exact case the surrounding paragraph existed to protect.
The implementation used `typeof x === 'number'`; the prose describing it did
not, and prose is what the next implementer reads.

**Rule**: make absence the discriminator, and test both directions. The field
is optional, nothing defaults it, and the UI renders it when **present** —
never when truthy. A real zero and an absent value must be distinguishable in a
test, because that distinction is the first thing a later refactor erases.

This also removes the need for a data migration: old rows are correct by
construction rather than by backfill, because "no value" is a meaning the
reader already handles.

**Applies to**: any optional field added to chunk metadata, a streaming
contract, or a table with existing rows — especially one the UI labels.
