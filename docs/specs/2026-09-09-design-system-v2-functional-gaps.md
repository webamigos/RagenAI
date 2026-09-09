---
title: What design system v2 asks for that the product cannot yet do
status: approved
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

**Decided (Q1): both, staged.** The sources block ships first on the existing
name-matching, then prompted inline markers follow as their own change. Two
things make the staging worth the extra step rather than shipping one prompt
and hoping. A marker is a claim the answer makes about a document, so it needs
a validation pass — a `[3]` pointing at something that was never retrieved is
worse than no marker at all, and only the retrieved set can catch it. And
prompting for citations changes what the model emits, which ADR-20 says is
measured rather than eyeballed; `evals/` gets a citation case. Staging keeps
the sources block from being held hostage to either.

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

**Decided (Q2): extract the real page from Docling, and show the label only
when there is one.** Docling is already the default parser
(`DOCUMENT_PARSER=docling`), so most documents can carry a true page; the
legacy loaders cannot, and a source card from one of those simply omits the
`· page {n}` half rather than inventing it. The ordinal keeps its own name so
the two can never be confused again — a field called `page_number` holding a
chunk index is how this got shipped in the first place.

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

**Decided (Q3): persist per turn, encrypted with the thread DEK.** It is the
only shape that still works after a re-index, which the other two both fail —
and a source card that goes blank because someone re-embedded a document is a
feature that breaks without anyone touching it.

The encryption asymmetry the spec called the deciding factor is not a reason to
choose a weaker shape; it is a requirement on this one. A snippet is a verbatim
extract of a document that may be private, sitting beside message content that
is KMS-encrypted per thread. It is encrypted with **the same thread DEK**, so
the two are protected alike and no new key management appears.
`packages/crypto` already exposes `encryptContent`/`decryptMessageContents` and
the thread's `encryptedDek`, so this is composition rather than new crypto —
and per `tests/architecture/encryption-lives-in-one-package.test.ts`, it had
better be.

### 6. `Processing` has no percentage

`StatusBadge` takes "an optional determinate percentage as the label" and phase
7 says "`Processing` shows a percentage as its label when progress is known".
The ingest workflow reports no progress: `parse-and-embed.ts` has no progress
signal, and `EmbeddingStatus` is a four-value enum with no numeric field.

Either add progress reporting to the workflow — it already runs through
discrete activities, so "3 of 7" is available — or drop the percentage from
the badge's contract.

**Decided (Q4): drop the percentage.** "3 of 7" is available but it is not a
percentage of anything a person cares about: the seven activities differ by
orders of magnitude in duration, and embedding dominates, so a bar sitting at
43% would mean "nearly all the work is still ahead". That is the same failure
as gap 3 — a number that is not the thing it looks like — and a progress bar
that stalls at the same place every time teaches people to distrust it.

`Processing` stays a word. The badge contract loses its optional percentage,
which also removes the only part of phase 3's `StatusBadge` that had no data
behind it, so phase 3 no longer waits on anything.

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

The brief's phase order stands for 1–5, 7 and 8. Phase 6 splits, and **6b is
now closed** — the decisions above are what it was waiting for:

1. ~~**6b — the decisions.**~~ Answered: Q1–Q4 above. They were due before 6a
   because each one changes what the wire has to carry, and three of them did:
   the stream needs a snippet per source, a page number that may be absent, and
   no progress field at all.
2. **6a — the wire.** Retrieval metadata into the stream: sources, chunk
   counts, latency, and — from Q3 — the snippet, decrypted per turn like the
   message beside it. No UI. Everything else in 6 waits on it, and like
   `document_retrievals` it is worth landing early.
3. **6c — the UI.** Retrieval row, sources block with markers, rail. Inline
   markers follow separately per Q1, with their validation pass and eval.

Two things moved out of the critical path. **Phase 3 no longer waits on
anything** — Q4 removed the percentage, which was the only part of
`StatusBadge` with no data behind it. And **Q2 is an ingest change**, so it can
land in parallel with 6a rather than behind it; the source card just omits the
page until it arrives.

## Decisions

All four open questions were answered on 2026-09-09, and the reasoning sits
with the gap each one settles rather than here.

| | Question | Answer |
|---|---|---|
| **Q1** | Prompt the model to cite inline? | Yes, **staged** — sources block first, then prompted markers with a validation pass and an evals case. Gap 2. |
| **Q2** | Real page numbers, or rename the field? | **Real pages from Docling**, label omitted when a loader cannot supply one. Gap 3. |
| **Q3** | Which snippet shape? | **Persist per turn, encrypted with the thread DEK.** Gap 5. |
| **Q4** | Progress percentage? | **Dropped** from the badge contract. Gap 6. |

Two of them turn on the same principle, which is worth stating once: **do not
render a number that is not the thing it appears to be.** `page_number` holding
a chunk ordinal and a progress bar weighted by activity count are the same
mistake, and both are the kind a reader can only catch by checking the source.

Gap 4 (relevance scores) needs no decision to start — the score exists and is
discarded — but it still needs an answer for the default installation, where
reranking is off and there is no score at all. The rail needs a defined
appearance for that case; it is a design question for phase 6c, not a blocker
on 6a.
