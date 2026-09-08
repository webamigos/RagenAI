---
title: 'A citation recorded at retrieval time counts what the model saw, not what it used'
modules: ['web', 'api']
areas: ['integration', 'testing']
topics: ['rag', 'citations', 'knowledge-analytics', 'metrics', 'retrieval']
---

# A citation recorded at retrieval time counts what the model saw, not what it used

**Context**: The Knowledge Analytics screen has a "Top 10 Cited Documents"
table fed by `DocumentCitation` rows. On the demo tenant — three seeded
markdown files — one question, `how quickly ticket is answered?`, produced an
answer that named exactly one file and a table that showed three citations,
one per document.

**Problem**: The rows were written from `ChainStreamResult.sourceFileIds`, the
unique `file_id`s of the chunks that survived dedupe and rerank — i.e. the
files the model was _shown_. With `maxDocumentsToRetrieve` chunks drawn from a
three-file corpus, that is every file, every turn, so every answer "cited"
the whole knowledge base. The table was a retrieval-frequency table wearing a
citation label, and the "unused documents" section could never list a file
that retrieval kept surfacing, however irrelevant. Nothing failed: the rows
were valid, the counts added up, and the only tell was a number that did not
match the answer next to it.

The trap is that at the moment the retrieval result exists, it is the only
thing that looks like a source list, and the answer does not exist yet. The
prompt asks the model to cite by writing `According to 'file.pdf', …`, so the
citation lives in the answer text and nowhere else.

**Rule**: A metric named "cited" must be computed _after_ the answer, as the
intersection of the retrieved set with the names the answer contains — and the
retrieved set is the candidate list, so a name the model was never shown can
never match. Keep the two sets apart in the types (`retrievedSources` is not
`citedSources`) and in the docs. When an analytics number is written at the
moment the data is convenient rather than the moment the fact is true, check
what it will count in the degenerate case (a corpus small enough to fit in one
retrieval) before shipping it. If the retrieved set is also wanted — for a
"retrieved but never cited" rate — store it under its own name, not as a
citation.

**Applies to**: `apps/web/src/app/api/threads/services/assistant-stream.ts`
(the write), `features/documents/utils/cited-sources.ts` (the intersection),
`apps/api/src/documents/knowledge-analytics.service.ts` (every reader), and
any future counter that records "what the model used" from something that was
available before the model ran.
