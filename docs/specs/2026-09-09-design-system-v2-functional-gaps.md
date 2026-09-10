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

**Done.** Two events: `retrieval`, carrying the retrieved files, the chunk
count and the elapsed ms, and `citations`, carrying the file ids the finished
answer cited.

`retrieval` is sent **before the first `delta`**, which costs nothing —
retrieval finishes before the model is called — and means the row renders while
the answer is still arriving rather than after it. Its **absence** means the
knowledge base was never searched: a conversation-mode turn, or a thread scoped
to `MODEL_ONLY`. A turn that searched and found nothing does emit it, with no
sources and a zero chunk count, because "found nothing" is an answer about the
knowledge base and "did not look" is not.

`citations` is computed server-side with `selectCitedSources` rather than
derived in the browser: a second implementation of the matching rule would be
free to disagree with the one the analytics tables are built from.

The payload is deliberately thin — `fileId` and `fileName` per source, nothing
else. Gaps 3, 4 and 5 each add a field, each is its own decision, and each is
an optional addition rather than a breaking change. Shipping a field now with
nothing true to put in it is how `page_number` came to hold a chunk ordinal.

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

**And the interim has a flaw the sources block inherits.**
`selectCitedSources()` dedupes by `fileId` but _matches_ by `fileName`
appearing in the answer text, so two distinct files called `umowa.pdf` in
different folders both match one mention and both get attributed. Names are
not unique in this product and never were.

Name-matching stays for the interim — it is the only signal available before
markers exist — but the sources block must render the _retrieved_ rows, keyed
by `fileId`, and treat a name that matches more than one retrieved file as
matching **none** of them rather than all. Under-attributing is a missing card;
over-attributing tells the reader an answer came from a document it never saw.
Both cases want a test with two same-named files in the retrieved set. Once
prompted markers land they carry the file identity directly and the ambiguity
disappears with them.

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

Concretely, chunk metadata carries two fields, and **neither of them is called
`page_number`**:

- `chunk_index` — the 1-based ordinal. Always present. Today's `page_number`
  value under the name it should always have had.
- `source_page` — the real page, written only when the parser knows it.
  Docling reports a page per element, so a chunk takes the page of its
  **first** element; one spanning a page break keeps that first page rather
  than a range, because the source card locates the reader and does not
  describe the extent. Legacy loaders write nothing at all.

The new name is the whole point, and the earlier draft of this section had it
wrong. Reusing `page_number` for the real page does not work: every chunk
already in Qdrant _has_ a `page_number`, holding an ordinal, and nothing
rewrites them — a re-index is what upgrades a document. An old chunk's
`page_number: 37` and a new chunk's real page 37 would be the same field with
the same value and no way to tell them apart, which is the original bug with a
migration bolted on.

`source_page` has never existed, so **its absence is the discriminator** and no
reader has to remember a rule. `page_number` stops being written, is read by
nothing, and stays on old chunks as inert history. That makes the UI condition
trivial: render `· page {n}` when `source_page` is present, and nothing
otherwise.

**Migration surface**, since both fields already have readers:

|                             |                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| writers                     | `apps/worker/src/activities/embeddings/prepare-metadata.ts`, `apps/web/src/app/api/threads/services/saveDataInVectorTable.ts` |
| types                       | `apps/web/src/app/lib/types/types.ts`, `apps/worker/src/services/llm/types/vector-store.ts`                                   |
| tests asserting the ordinal | `apps/worker/src/__tests__/activities.spec.ts` (`page_number` is expected to be 1, then 2 — becomes `chunk_index`)            |

All five move off `page_number` in one change. Nothing reads it afterwards, so
the stale values on existing chunks cannot surface.

**Done, and the premise needed correcting first.** This section said "Docling
knows it" and treated the work as five files moving. Docling does know it —
but the client asked for `to_formats: ['md']` and returned one flat string, so
no page ever reached ingest. Confirmed against a running docling-serve rather
than assumed: requesting `json` returns a `pages` map and `prov[].page_no` per
text element.

So it landed in three parts rather than one:

- `page_number` became `chunk_index`, with an architecture test that fails if
  the old name comes back. That alone removed the bug — a field that states
  what it holds cannot be rendered under the wrong word.
- The **page count** turned out to matter more than the label. Since Docling
  became the default parser every PDF's `pageCount` was `ceil(chars / 3000)`,
  and that number feeds usage limits. It is now the parser's own count, with
  the estimate kept only for formats that genuinely have no pages.
- `source_page` per chunk, recovered by position: the client records where each
  page begins in the markdown, and a chunk takes the page of the last anchor at
  or before it. A chunk that cannot be located gets **no** page, which is the
  whole point — a guessed page is the original bug in a form that is harder to
  spot.

Two things the implementation had to get right that the plan did not mention.
Chunks overlap, so locating them walks forward from the previous chunk's
_start_, not its end; from the end it skips the overlapping chunk and matches a
later repetition of the same sentence. And anchors are sparse — tables and
pictures are not text elements, and an element whose text was reflowed cannot
be found — so the lookup reads backwards to the last known page instead of
requiring an exact hit.

Chunks already in Qdrant keep a `page_number` that is really an ordinal, and
nothing rewrites them — a re-index is what upgrades a document. So the reader
cannot distinguish an old ordinal from a real page by value. The UI reads
**only** `source_page`, which is absent on every pre-migration chunk; that is
what makes the old data safe rather than silently mislabelled. (This paragraph
said "the new `page_number`" until the events landed — the wording the section
above explicitly rejects, left behind by the earlier draft.)

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

**Done, and the appearance for "no score" is _nothing_.** Not an empty bar, not
a zero, not a grey placeholder: no bar at all. An empty bar reads as "this
document scored zero", which is a claim about the document when the truth is a
fact about the deployment — reranking was never switched on. Absence means "not
measured", and the same rule already governs `source_page`: a field is rendered
when it is **present**, not when it is truthy. The distinction is the whole
point here — `0` is a real score and a falsy value, and a truthiness check would
hide exactly the case this paragraph exists to protect.

That distinction is tested in both directions, because it is the one a later
change is most likely to erase — a real `0` still draws a bar and reads "0%",
while an absent score draws none.

The score travels on the document's metadata rather than changing
`rerankDocuments`' return type. Most callers only want documents in a better
order; the one that wants the number reads it where
`retrieveRelevantDocumentsWithIds` is already reading `file_id`. A file's score
is its **best chunk's** — `finalDocs` is in rank order, so the first chunk seen
for a file is the highest-ranked one, which is what a per-document bar means.

The bar carries a percentage beside it. A bar alone is a visual-only encoding,
which the panel rules rule out for the same reason the status badge never rests
on colour, and it is the only version a screen reader cannot read.

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

**Where the record lives.** It hangs off `DocumentRetrieval`, which #989
already writes once per (message, file) with `@@unique([messageId, fileId])`
and a `rank`. That is stable per-turn identity that already exists, so the
snippet needs no new key of its own and reopening a message finds it by
`messageId`. **Qdrant chunk ids are not a lookup key** — they do not survive a
re-index, which is the failure that ruled out the reference-only shape in the
first place.

The capture point matters: `retrieveRelevantDocumentsWithIds()` reduces the
retrieved documents to `RetrievedSource` and drops `pageContent` on the way. The
snippet is taken **before** that reduction, in the same place the
`DocumentRetrieval` rows are built, because afterwards the text is gone.

**Which chunk, when a file contributes several.** It usually does: the dedupe
inside `retrieveRelevantDocumentsWithIds()` is by `pageContent`, so two chunks
of one document both survive it, and the collapse to one `RetrievedSource` per
file happens afterwards — a `seenFileIds` loop over `finalDocs` that keeps the
first occurrence.

`finalDocs` is ordered best-first after reranking, so "first occurrence" is
already "highest-ranked chunk". That is the right answer, but today it is a
property of the loop rather than a stated rule, and `DocumentRetrieval` is
`@@unique([messageId, fileId])` — one row per file per turn — so something has
to choose. The rule, written down:

> The row for a `(messageId, fileId)` is the file's **highest-ranked surviving
> chunk**, and its `rank`, `source_page` and snippet all come from **that one
> chunk**. Never assembled from two.

Both halves matter. Picking by iteration order rather than by rank is
non-deterministic the moment anything upstream reorders; and taking the rank
from one chunk and the page or the text from another would produce a source
card citing a page the quote does not appear on.

**When there is no key.** This is the part that decides whether the feature is
safe, and the answer is a rule rather than a branch: _the snippet is written
under exactly the same key and the same mode as the message it belongs to, in
the same transaction, and never diverges from it._

- Encryption off for the deployment — the message is stored plaintext today
  (`docs/thread-encryption.md`), and so is the snippet. Consistent, and no
  weaker than what sits beside it.
- Encryption on and the thread has a DEK — both use it.
- Encryption on and the DEK cannot be obtained — `apply-dual-content-mode.ts`
  already catches that, logs one line and stores the message _without_
  encryption. The snippet follows it down rather than making its own choice.

This deliberately does **not** fail closed on a missing DEK, which is the
tempting rule. Failing closed would make the snippet stricter than the message
beside it: a misconfigured deployment would keep storing answers in plaintext
while silently dropping snippets, which costs a feature and buys no
confidentiality, because the same document text is in the plaintext answer
anyway. The real hazard is divergence — a plaintext snippet next to an
encrypted message — and writing both under one key in one transaction is what
rules it out. What _should_ be loud is the downgrade itself, and that belongs
to the existing predicate-versus-factory invariant that
`docs/thread-encryption.md` already calls out, not to this feature.

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

**The trigger already exists.** "No keyboard shortcut anywhere" was true when
this was written and stopped being true in #1011 — `useSearchShortcut` binds
⌘K/Ctrl+K and `SearchThreadsContext` wires it to the dialog. Only the groups
were missing.

**Documents added, and the content question is decided: names only.** A palette
has to answer while someone is still typing, and content search means an
embedding call plus a vector query per keystroke — hundreds of milliseconds and
a cost per character.

The better reason is that content search already has a home in this very
design: the trailing "Ask {assistant} about {query}" action runs real retrieval
and returns an answer with citations, rather than a list of files someone then
has to open. **Names navigate; the assistant answers.** Adding a slow, worse
content search beside a fast, better one is the choice this avoids.

The query is web-local rather than another field on apps/api's `search-all`
route. Two reasons: `fileAccessWhere` lives in apps/web, and every new field on
an apps/api route is a deployment-ordering problem, because that path validates
with `forbidNonWhitelisted`. Nothing about matching file names needs to cross
that boundary.

**A search box is the easiest place in a product to leak the existence of a
document** — a name alone confirms that a contract with a named client exists —
so the query runs the same `fileAccessWhere` predicate the knowledge page does,
and a non-member matches nothing rather than everything.

Still to do: the Actions group, the "Ask …" trailing action, and per-result
query highlighting.

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

**Groundwork done; the merged rail itself is still to build.** The per-item
check this section asks for already existed on the personal side —
`SettingsPage.visibility.requireRole` plus `canAccessSettingsPage` — and did
not exist on the organization side at all, because `OrganizationNav` held a
hardcoded list and `/organization/layout.tsx` gated the whole group in one
place. That asymmetry is what made the merge unsafe, so it is what got fixed
first: `organizationRegistry` carries the same visibility data, and
`OrganizationNav` renders from it.

**Every organization entry is `orgAdmin`, and that was checked rather than
assumed.** The layout requires `isAppAdmin || canManageOrg`; the only three
pages that re-check anything — `ai-usage`, `disk-usage`, `security` — re-check
exactly that. No screen there is owner-only or app-admin-only today, so the
rail's filter is one uniform rule. When that stops being true, `requireRole` is
where it belongs, so the rail and the page cannot disagree.

**The routes do not move, and should not.** Merging the rails is a navigation
change; `/organization/**` keeps its own layout and its own guard. Relocating
those pages under `/settings/**` would change their URLs _and_ quietly remove
the one check that currently covers all of them — the spec's own warning,
arrived at from the other direction. `organization-registry.test.ts` asserts
every entry still sits under the guarded prefix.

### 9. Sidebar counts, and what they cost

The sidebar shows a right-aligned tabular count beside Threads, Assistants and
Knowledge, plus an unread count on Notifications. None is fetched today. Four
counts on every panel navigation is four queries in the layout unless they are
batched and cached; the knowledge count in particular is org-wide and wants the
same treatment the usage panel already gets.

**Decided:** **Threads, Assistants and Knowledge are deferred and stay
unfetched.** Notifications is the exception and needs nothing — `NotificationBell`
already derives an unread count client-side from the notifications it loads.

Two things turned up while scoping it that the paragraph above did not know.

**The three cannot share one read.** Knowledge and Assistants are local Prisma
queries; Threads comes from `apps/api` through `ragenApiRequest`. They can
still be _coordinated_ — issued in parallel and awaited together — but there is
no single transaction against one source, so "batched" in the sense the
paragraph above meant it is off the table. Unifying them is a new apps/api
aggregation endpoint, or apps/web querying the threads table directly and
undoing ADR-21's Phase D cleanup.

**And Knowledge is the expensive one, not the cheap one.** Correct means
access-scoped, which is `fileAccessWhere`'s `OR` across folder joins and
permission subqueries — not a `count(*)`.

The argument against is not mainly cost, though:

- **A count beside a nav item earns its place when it is actionable.** Unread
  notifications, pending invitations — numbers you click _because_ of the
  number. "240 documents" is not something anyone acts on, and neither is the
  size of your own chat history, which Recent is already showing you.
- **It is stale the moment anything changes.** Upload a file and the sidebar
  keeps the old number until the next navigation. A number that is confidently
  wrong is worse than no number — the same reasoning that removed the progress
  percentage in Q4 and renamed `page_number` in Q2.
- **It taxes every page.** The queries live in the panel layout, so pages that
  have nothing to do with documents still pay for the document count.

If a count is ever wanted, Knowledge is the only candidate worth the argument,
and it needs a cached read rather than a query per navigation. **Whoever builds
it: scope it by access.** Telling a member the organization has 240 documents
when they can reach three is a small disclosure of exactly the kind #1006 and
#1007 closed, and `get-user-files-query` already computes the scoped count for
the knowledge page — reuse it rather than writing a second one.

### 10. The composer's knowledge scope, and a flag nobody reads

Phase 5 puts a `Knowledge: {scope}` control in the composer and does not say
what a scope is. **Decided: three levels.**

| level              | means                                                            | maps onto                                                                                                                                                                               |
| ------------------ | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Knowledge base** | the files on `/knowledge/documents-list` this employee may reach | today's retrieval, **narrowed** — access-scoping is already right, but the global path also filters `project_id is_null`, so assistant files drop out. That filter has to go; see below |
| **Assistant**      | one of their own or a shared assistant                           | a project, which the composer can already target — `mentionedProject` and `ProjectMentionDropdown` exist                                                                                |
| **Just the model** | no retrieval at all; anything needed is attached to the message  | **nothing**                                                                                                                                                                             |

The third is the work, and it is further from done than it looks.
`useKnowledge` already exists as a field — a Zod member in
`apps/web/src/features/messages/contracts/message.types.ts`, another in
`apps/api/src/messages/types.ts`, and a property on `send-message.dto.ts`. **No
consumer reads it.** One caller sets it: `apps/web/evals/e2e-rag/run.ts` sends
`useKnowledge: true`, which is a no-op — the eval exercises retrieval because
retrieval is the default, not because the flag asked for it.

Three declarations and one hopeful writer, then, with no behaviour behind any
of them. A grep finds the feature and the code does not implement it, which is
the most expensive kind of absence: it reads as done.

So the control is not a control over an existing switch. Shipping it means
sending the scope and honouring it in the chain — skipping retrieval entirely
for "just the model", constraining it to the project for "assistant". The UI is
the small half.

**Two rules that the three levels do not settle on their own.**

_With no assistants, level 2 is disabled and says why._ Not hidden: a control
that disappears leaves the reader wondering whether the feature exists, and a
person with no assistants yet is exactly the person who needs to learn that
assistants are a thing. Disabled with a reason teaches; absent does not.

_The scope belongs to the thread, not the message._ A project is already a
property of the thread, so this follows the grain rather than cutting across
it — but the real argument is the transcript. Per-message scope means an answer
three turns up was grounded in the knowledge base and the one below it was not,
with nothing on screen saying so, and no way to reason about why the assistant
"forgot" something. Set at the start, constant for the thread.

The consequence to accept: changing your mind means a new thread. That is worth
saying in the UI rather than leaving people to discover it — and it is the same
trade the project selection already makes today.

**The wire, before anyone builds the control.**

|                                              |                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| field                                        | `knowledgeScope`, on the **thread-creation** payload — `CreateThreadRequestDto`, `POST /v1/internal/threads` |
| values                                       | `'KNOWLEDGE_BASE'` \| `'ASSISTANT'` \| `'MODEL_ONLY'`                                                        |
| assistant target                             | the existing `projectId`; no second identifier                                                               |
| stored on                                    | `threads.knowledge_scope`, set at creation and constant thereafter                                           |
| omitted                                      | treated as `'KNOWLEDGE_BASE'` — today's behaviour, so an older client keeps working                          |
| `'ASSISTANT'` with no resolvable `projectId` | **rejected**, not defaulted                                                                                  |
| not on                                       | the send-message payload — see below                                                                         |

The rejection row is the one worth arguing. Falling back to the knowledge base when
the project is missing or unreachable would turn a client bug into a silently
_wider_ search, which is the failure this repository keeps meeting from
different directions — an omission producing the broadest answer. The UI cannot
send it (level 2 is disabled with no assistants), so a request that does is
wrong, and wrong is better rejected than widened.

The values are SCREAMING_SNAKE because the column is a Prisma enum and
Prisma's `@map` renames only the database side of an enum member — a
friendlier `'knowledge-base'` on the wire would have left the generated client
handing back `'KNOWLEDGE_BASE'`, so three declarations would need two
translations. It was written that way first and reverted.
`messageType`/`MessageContentType` next door had already made the same choice.

**It is not a field on send-message, and that was a correction.** It was put
there first, next to `projectId`, which is where this table originally said it
belonged. But `sendMessage` neither persists nor compares it, and the streaming
path reads `threadRecord.knowledgeScope` — so a scope sent with a message would
be validated and then discarded. That is `useKnowledge`'s failure exactly,
rebuilt in a new shape one commit after removing it. A scope belongs to the
thread, so it is accepted only where a thread is created.

**What "rejected" does and does not cover.** `initializeRagChain` rejects a
missing `projectId`; `createThreadForUser` checks the project exists in the
organization. Neither checks the caller's _permission_ on that project, and a
later send reuses the stored id without revalidating. This is deliberate rather
than missing: the boundary is `metadata.accessible_by`, which the project
branch of `buildMetadataFilter` keeps alongside the `project_id` condition. So
naming a project you cannot reach intersects your principals with that
project's documents and returns fewer of them — it cannot widen the answer, and
it cannot leak. If a project check is ever added it will be for a clearer error
message, not for access.

`useKnowledge` is replaced rather than joined. Two fields that both describe
retrieval will disagree; the eval's `useKnowledge: true` becomes
`knowledgeScope: 'KNOWLEDGE_BASE'`, which is what it meant.

**Level 1 is defined as the file list, and that is wider than today's
retrieval.** "Knowledge base" means the files on
`/knowledge/documents-list` that this employee can reach. That page is
`get-user-files-query`, which filters by access and **not** by project — a file
belonging to an assistant still appears in it.

Retrieval with no assistant selected does not match that set.
`buildMetadataFilter` in `initializeBasicRag.ts` adds
`metadata.project_id is_null: true` for the global case, and calls it "Global
KB: search files without a project". So a document the employee can see in the
knowledge base, sitting in an assistant, is invisible to a level-1 question
today. Implementing level 1 as defined means dropping that condition, which is
a change in retrieval behaviour and not a change in the composer.

**Done.** The condition is gone; the global branch is now `organization_id`
plus `accessible_by` and nothing else. Measured against a local corpus rather
than argued: the candidate pool went from 17 chunks to 34, the extra 17 being
exactly one document sitting in an assistant — visible on the knowledge page
the whole time, and unreachable from a question until now.

Two things that measurement settled, both of which would otherwise have been
raised later as objections:

- _Duplicates._ That corpus holds the same document uploaded twice, under two
  `file_id`s, with byte-identical chunk text — so widening puts both copies in
  the pool. They do not cost anything: `retrieveRelevantDocumentsWithIds`
  already dedupes by `pageContent` before the rerank cuts to top-k, so
  identical copies collapse and the source budget is unaffected.
- _The public chatbot has always worked this way._ `buildChatbotMetadataFilter`
  has no project condition and never had one. This makes the panel agree with a
  path already in production rather than inventing a wider one.

The existing RAG eval cannot see this change: it uploads into a project and
asks inside a project thread, so it exercises the branch that was not touched.
Saying so explicitly because "we ran the eval" would have looked like evidence
and been none.

Access control itself is already right, and worth recording so nobody re-audits
it: retrieval filters on a `metadata.accessible_by` array of `org:` / `user:` /
`team:` principals, and fails closed — a non-member or a null user gets
`NO_ACCESS_PRINCIPAL` rather than falling through to the organization filter,
which the comment there notes was once the bug. Level 1 is therefore
"documents you can reach" already; what it is missing is the project ones, not
the permission check. The distinction is the same one #1006 and #1007 were
about, arrived at from the other side.

**Only the Qdrant path is in scope.** `initializeBasicRag` also builds a
Supabase store, and that one applies its own filter in the constructor —
`{ organization_id, project_id? }`, with no `accessible_by` at all — so the
change described here would not reach it. It is deliberately left alone:
Supabase is not a supported vector store ([ADR-31](../adrs/31-only-qdrant-is-a-supported-vector-store.md)),
the ingest worker never writes to it, and `initializeBasicRag` already logs a
warning when an org is pointed at it. Bringing it to parity would mean
supporting it, which is the opposite of the decision. If it is ever revived,
the access-principal filter is the part to port first — it is the boundary,
and that path does not have one.

### 11. "Start from" suggestions

Phase 5 wants four suggestion cards on the new-chat page and does not say where
the suggestions come from. **Decided: static copy.**

Not generated from the corpus, and not configured per assistant. Both were on
the table and both are a feature rather than a card: generated suggestions need
a source of candidate questions and a reason to trust them, and per-assistant
copy needs somewhere to author it. Static text is honest about being an example
and can be rewritten by anyone editing a locale file.

The consequence to accept knowingly: four strings in fifteen locales, which is
translation work every time the copy changes, and suggestions that will not
know whether the knowledge base can answer them.

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

|        | Question                                | Answer                                                                                                        |
| ------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Q1** | Prompt the model to cite inline?        | Yes, **staged** — sources block first, then prompted markers with a validation pass and an evals case. Gap 2. |
| **Q2** | Real page numbers, or rename the field? | **Real pages from Docling**, label omitted when a loader cannot supply one. Gap 3.                            |
| **Q3** | Which snippet shape?                    | **Persist per turn, encrypted with the thread DEK.** Gap 5.                                                   |
| **Q4** | Progress percentage?                    | **Dropped** from the badge contract. Gap 6.                                                                   |

Two of them turn on the same principle, which is worth stating once: **do not
render a number that is not the thing it appears to be.** `page_number` holding
a chunk ordinal and a progress bar weighted by activity count are the same
mistake, and both are the kind a reader can only catch by checking the source.

Gap 4 (relevance scores) needs no decision to start — the score exists and is
discarded — but it still needs an answer for the default installation, where
reranking is off and there is no score at all. The rail needs a defined
appearance for that case; it is a design question for phase 6c, not a blocker
on 6a.
