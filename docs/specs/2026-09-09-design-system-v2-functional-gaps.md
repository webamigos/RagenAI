---
title: What design system v2 asks for that the product cannot yet do
status: draft
areas: [web, api, worker, rag, knowledge-base]
adrs: [20, 21, 41]
---

# What design system v2 asks for that the product cannot yet do

## TLDR

`apps/web/design_handoff_ragen_panel/` describes itself as "an evolution, not a
rewrite", and for six of its eight phases that is accurate — they change tokens,
density and layout over functionality that already exists. **Phases 6 and 7 are
not.** They ask the interface to show information the system does not currently
produce, persist or transmit, and no amount of Tailwind will conjure it.

This spec exists because the handoff's `IMPLEMENTATION_BRIEF.md` is a
presentation plan. It names the one gap it knows about — "if the current chat
response payload does not carry it, that is an API change and belongs in phase
6" — in a single sentence, and is silent on the rest. Each item below was
checked against the code rather than inferred from the brief.

## The gaps, in the order they will hurt

### 1. The chat stream carries no retrieval metadata at all

`assistant-stream.ts` emits twenty SSE event types (`delta`, `tool_call`,
`final_response`, …). **None of them carries a source, a chunk count, a latency
or a relevance score.** The retrieved set exists inside the request — #989 now
persists it as `document_retrievals` — and is never sent to the browser.

Phase 6 depends on this for all six of its parts: the retrieval row
(`Searched {n} documents · {m} chunks · {ms} ms`), the inline markers, the
sources block, the no-retrieval line, the sources rail and its relevance bars.

This is an API change to the streaming contract, not a component. It is the
long pole of the whole redesign and nothing in phase 6 can be started without
it.

### 2. Nothing produces `[n]` citation markers

The brief says markers are "produced by the markdown pipeline, not by
post-processing HTML" — correct as an instruction, but the pipeline has nothing
to render. The model is not prompted to emit `[1]`, and no post-hoc mapping
exists.

`selectCitedSources()` (added in #972) decides which documents an answer used by
intersecting the retrieved set with the **file names appearing in the answer
text**. That yields a set, not positions, so it cannot tell you which sentence
cites which document.

Two ways out, and they are different products:

- **Prompt the model to cite.** Real inline positions, at the cost of prompt
  changes, a validation pass for markers pointing at documents that were not
  retrieved, and an eval to catch the model dropping them. `evals/` exists for
  exactly this.
- **Keep name-matching and put markers only in the sources block.** No inline
  chips, so screenshot `02-conversation-sources.png` is not reproduced. Cheap
  and honest.

### 3. "page {n}" has no page behind it

The design labels sources `{file} · page {n}`. The field exists —
`page_number` in the chunk metadata — but both writers set it to
`index + 1`:

- `apps/worker/src/activities/embeddings/prepare-metadata.ts:62`
- `apps/web/src/app/api/threads/services/saveDataInVectorTable.ts:304`

It is the **chunk ordinal**, not a page. A twelve-page PDF split into forty
chunks yields "page 37". Rendering it as a page number would be a confident
lie, and the kind a reader can only catch by opening the document.

Either extract a real page number at ingest (Docling knows it; the legacy
loaders mostly do not) or label the field what it is. Do not ship the current
value under the word "page".

### 4. Relevance scores never leave the reranker

The sources rail wants a relevance bar per document. The rerankers compute
exactly that — `relevance_score` in both
`bedrock-cohere-reranker.ts` and `scaleway-reranker.ts` — and
`rerankDocuments()` returns documents **sorted by** score with the score itself
discarded. `basic-rag/operations.ts` never sees it.

Also worth deciding before it is plumbed through: reranking is opt-in
(`FEATURE_FLAG_RERANKING`), so on a default installation there is no score to
show at all. The rail needs a defined appearance for that case, not an empty
bar.

### 5. Source snippets are not persisted

Each source card shows a quoted snippet. The chunk text exists at answer time
inside `retrieveRelevantDocumentsWithIds()` and is dropped — only file ids
survive. Qdrant still holds the chunks, but a chunk has no stable id across a
re-index, so a thread reopened after re-embedding would have nothing to quote.

This is the same requirement as the separately requested "fragment behind a
citation in a drawer", and the two should be designed once. The three shapes
are: persist the snippet per turn (survives re-index, duplicates document text
into an unencrypted table while message content is KMS-encrypted), persist a
reference and re-read Qdrant on open (cheap, blank after re-index), or return
snippets in the stream and keep them client-side only (free, lost on reload).

### 6. `Processing` has no percentage

`StatusBadge` takes "an optional determinate percentage as the label" and phase
7 says "`Processing` shows a percentage as its label when progress is known".
The ingest workflow reports no progress: `parse-and-embed.ts` has no progress
signal, and `EmbeddingStatus` is a four-value enum with no numeric field.

Either add progress reporting to the workflow — it already runs through
discrete activities, so "3 of 7" is available — or drop the percentage from
the badge's contract.

### 7. `⌘K` is not a palette and does not cover documents

`SearchThreads.tsx` is a cmdk dialog opened by a sidebar button. There is **no
keyboard shortcut anywhere** (no `metaKey` handler in the sidebar), and it
searches threads and projects — not documents, and not actions.

Phase 8 wants a global palette over `Documents` / `Threads` / `Actions` with
the query highlighted per result and a trailing "Ask {assistant} about {query}"
action. The dialog is reusable; the trigger, the document search and the action
group are new. Note that document search means a text query over file names at
minimum — decide whether it also searches content, because that is a retrieval
call, not a `LIKE`.

### 8. Settings is two route groups, not one

Phase 8 merges user and organization settings into a single rail. They are
currently two route groups, `/settings/**` and `/organization/**`, with
different layouts and different guards — `/organization/**` enforces the
org-admin check once in its layout, which is why Knowledge analytics and PII
policy were moved there.

Merging the surfaces must not merge the authorization. A single rail rendering
both groups needs per-item capability checks (`canManageOrg()` and friends from
`@ragenai/platform-contracts`), or a member sees admin routes and gets a
redirect on click.

### 9. Sidebar counts, and what they cost

The sidebar shows a right-aligned tabular count beside Threads, Assistants and
Knowledge, plus an unread count on Notifications. None is fetched today. Four
counts on every panel navigation is four queries in the layout unless they are
batched and cached; the knowledge count in particular is org-wide and wants the
same treatment the usage panel already gets.

## Not gaps

Checked and present, so the phases can treat them as restyling:

- Model picker (`Assistant/ModelSelector/`), attachments, thumbs up/down,
  notifications with an unread state, folders, PII policy per file, CSV export,
  bulk selection, the `sonner` toast layer, `components/ui/command.tsx`.
- `StatusBadge` has no component but every state it needs is already in
  `EmbeddingStatus` and `ParsingStatus`.

## Sequencing this against the brief

The brief's phase order stands for 1–5, 7 and 8. Phase 6 should be split:

1. **6a — the wire.** Retrieval metadata into the stream: sources, chunk
   counts, latency. No UI. Everything else in 6 waits on it, and like
   `document_retrievals` it is worth landing early.
2. **6b — the decisions.** Markers (prompted or not), page numbers (real or
   relabelled), snippets (which of the three shapes), relevance when reranking
   is off. Each changes what 6a has to carry, so they are due before it, not
   after.
3. **6c — the UI.** Retrieval row, markers, sources block, rail.

## Open questions

<!-- While this block is here the spec is not ready to implement. -->

- **Q1. Do we prompt the model to cite inline?** Gap 2. Decides whether
  screenshot 02 is reproducible and whether `evals/` needs a citation case.
- **Q2. Real page numbers, or rename the field?** Gap 3. Real numbers are an
  ingest change and only Docling can supply them.
- **Q3. Which snippet shape?** Gap 5, shared with the citation-drawer request.
  The encryption asymmetry is the deciding factor: message content is encrypted
  per thread and a stored chunk would not be.
- **Q4. Progress percentage, or drop it from the badge?** Gap 6.
