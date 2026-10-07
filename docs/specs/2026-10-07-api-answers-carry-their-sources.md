---
title: API chat answers carry their sources
status: approved
areas: [api, rag, brain]
adrs: [13, 21, 36]
---

# API chat answers carry their sources

## TLDR

A chat turn in `apps/web` shows which documents it drew on, and for a Brain
page, which documents the page was built from (Brain spec E8). A turn through
`apps/api` shows neither: the streaming and non-streaming responses of `/chat`
carry text, reasoning and the guardrail marker only. So E8's second level
cannot be extended to the API until the API says *what it cited at all*. The
non-obvious part is that **E8 is not the gap, sources are**: Brain citations
are a refinement of a list the API does not return today.

## Open Questions

<!--
Hard gate (docs/specs/README.md): no code until these are answered.
-->

- **Q1. Does the API return sources at all?** Callers of the public API (and
  `apps/mcp`, ADR-36) get an answer with no way to check it. Proposal: **yes,
  an opt-in `sources` field**, so existing clients see no change.
  **Answer (2026-10-07): yes, an opt-in `sources` field.**
- **Q2. What may a source expose?** The web shows file name, page, quoted
  snippet. An API key is an opaque credential with no org context (ADR-13), so
  the answer must be filtered by the same `fileAccessWhere` the retrieval used.
  Proposal: **file id, file name, rank, and for a Brain page the page title and
  the names of source documents the caller may read**; no snippet text in v1.
  **Answer (2026-10-07): file id, file name, rank; for a Brain page the page title and the source document names the caller may read. No snippet text in v1.**
- **Q3. Streaming shape.** Sources are known when retrieval finishes, before
  the first token. Options: (a) a leading `data: {"sources": [...]}` event,
  (b) a trailing one before `[DONE]`. Proposal: **(b)**, because a trailing
  event can reflect what the answer actually cited, and a client that ignores
  unknown events is unaffected.
  **Answer (2026-10-07): (b) a trailing event before `[DONE]`.**
- **Q4. Does the API record retrieval?** The web path writes `DocumentRetrieval`
  rows so a reopened thread can show its sources. The API does not. Recording
  them also unblocks "answers remember what they cited" for API threads.
  Proposal: **yes, same function, same encryption**, in the same change.
  **Answer (2026-10-07): yes: same function, same encryption, in the same change.**
- **Q5. Is this one change or two?** (A) return sources, (B) return the Brain
  second level (E8). Proposal: **two phases, A first**.
  **Answer (2026-10-07): two phases, A first.**

## Problem

`apps/api/src/chat/chat.service.ts` writes `{text}`, `{reasoning}` and the
`replace` marker to the SSE stream, and returns text (plus guardrail marker) in
JSON mode. Nothing from retrieval reaches the caller, and no
`DocumentRetrieval` row exists for an API turn, so the thread an API caller
later opens in the panel has no sources either.

## Out of scope

- Snippet text in the API response (Q2).
- Brain page revisions and edit-and-republish (Brain phase E, spec
  `2026-10-05-answers-remember-what-they-cited`).
- Changing what retrieval returns.

## Proposed solution (sketch)

- A `sources` request flag (default off). When set, the response carries
  `sources: [{ fileId, fileName, rank, brain?: { pageTitle, sources[] } }]`.
- Retrieval hands the chain's result to one shared function that both web and
  API call to record `DocumentRetrieval`, so the two cannot diverge (the same
  rule as ADR-42's single encryption function).
- Brain second level reuses `getBrainCitationsQuery`, moved so `apps/api` can
  call it without importing from `apps/web`.

## Core surfaces touched

| Surface | Why |
|---|---|
| `apps/api/src/chat/chat.service.ts` | response shape, SSE trailing event |
| `apps/api/src/chat-completions/` | OpenAI-compatible shape needs a place for sources (extension field) |
| `packages/rag-core` | home for the shared retrieval-recording function |
| `src/features/brain/services/queries/get-brain-citations-query.ts` | second level, access filter |
| `apps/mcp` | consumes the API; should pass the flag through |

## Data model

No new tables. `DocumentRetrieval` gains writers, not columns.

## Failure modes

- **Caller may read the page but not its sources.** Told so, names never shown
  (same rule as the web).
- **Key scope narrower than the user's.** Filter by the key's scope, not the
  user's.
- **Retrieval recording fails.** The answer is still returned; the failure is
  logged. A missing source list is better than a lost answer.
- **OpenAI-compatible endpoint.** Extra fields must not break strict clients,
  so they go in a documented extension key, off unless requested.

## Phases

### Phase A — sources on `/chat`

- [ ] **A1.** Shared recording function in `rag-core`; web switches to it.
- [ ] **A2.** `/chat` records retrieval for API turns.
- [ ] **A3.** Opt-in `sources` in JSON and as a trailing SSE event.

### Phase B — Brain second level in the API (closes E8)

- [ ] **B1.** Move the citation query out of `apps/web`; access test: reader of
      the page but not its sources gets the page and no source list.
- [ ] **B2.** Include `brain` in `sources[]`.

## Testing

Unit tests on the recording function; controller tests for the flag off (shape
unchanged) and on; the access test above; an architecture test that the web and
API record through one function.

## Rollout and rollback

Flag-off by default per request; no feature key needed for A. B behind the
existing `brain` key. Rollback is not sending the flag.
