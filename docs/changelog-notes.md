# Changelog notes

Raw material for the Friday blog post
([EN](https://ragen.ai/en/blog), [PL](https://ragen.ai/pl/blog)), collected while
the work is fresh instead of reconstructed from `git log` on Friday morning.

The post itself opens by explaining why this file has to exist: *"Ragen gets a
new version on every merge to main, so the number on its own says very little."*
A commit list is not a changelog. The translation from "what we merged" to "what
someone notices" is easy in the hour you merged it and expensive a week later —
that translation is the only thing this file is for.

## What belongs here

One test: **would a user, an admin or a self-hoster notice?** If the answer is
no, it does not go here, however hard the work was.

Write the **effect**, not the change. The difference, from a real example:

> ✗ B2a — the seam that chooses a path, plus embeddings
> ✓ Ragen can call model providers directly now, so LiteLLM becomes optional
>   rather than required.

The first is true and useless; it names an internal step by its plan letter. The
second is the same commit described to the person running it.

Keep it to a sentence or two. This is a note to your Friday self, not a draft —
the post gets written from these, not out of them.

## What does not belong here

There are four other places, and an item in the wrong one is lost:

| | |
| --- | --- |
| [`adrs/`](adrs/) | **why** a decision was made, and what it rules out |
| [`lessons.md`](lessons.md) | what went **wrong**, so nobody re-discovers it |
| [`specs/`](specs/) | what we intend to build, before building it |
| [the `/changelog` page](https://docs.ragen.ai/changelog) | release notes, generated from GitHub Releases — no hand-editing |

Overlap is fine and expected: the gateway work below is an ADR, a lesson *and* a
changelog note, because "why we chose this", "what bit us" and "what you get"
are three different sentences for three different readers. Write all three.

## Conventions

- **English.** Both posts exist and the Polish one is the translation; the repo
  is English throughout. A Polish phrase that already reads well can sit in
  brackets rather than be lost.
- **Tag each entry `[major]` or `[brief]`.** The post gives major items their own
  section with a heading and two or three paragraphs, and sweeps the rest into
  *In brief* / *Krócej*. Deciding this at merge time is most of Friday's work.
- **Name the thread** where one is obvious. The posts group a fortnight into two
  or three threads ("September had two clear threads: an answer that shows where
  it came from, and a new interface") — that grouping is much easier to see from
  inside the week than from the commit list.
- **Link the PR**, so the detail is one click away and the note can stay short.
- **Be accurate about what actually shipped.** A note written from intent rather
  than from the merge is how a post claims a thing that is still behind a flag.

## After publishing

Replace the week's section with a single line linking the published post, and
start a fresh `## Unreleased`. The value here is the un-published backlog; the
archive is the blog.

---

## Published

- 2026-10-02 – [Ragen: what we shipped from late September into October](https://ragen.ai/en/blog/ragen-changelog-late-september-2026)
  ([PL](https://ragen.ai/pl/blog/ragen-changelog-18-wrzesnia-2-pazdziernika-2026))
- 2026-09-18 – [Ragen: what we shipped in the second half of September](https://ragen.ai/en/blog/ragen-changelog-mid-september-2026)
  ([PL](https://ragen.ai/pl/blog/ragen-changelog-11-18-wrzesnia-2026))
- 2026-09-11 – [Ragen: what we shipped in the first half of September](https://ragen.ai/en/blog/ragen-changelog-early-september-2026)
  ([PL](https://ragen.ai/pl/blog/ragen-changelog-4-11-wrzesnia-2026))

## Unreleased

### Knowledge base

- `[brief]` **Switching document summaries off for an organization takes
  effect.** The per-organization "Document summaries" setting was shown on
  the RAG settings page and editable in the admin panel, and ingest never
  read it: every organization got summaries whatever it said. New uploads
  and re-indexes now honour it (the installation-wide
  `FEATURE_FLAG_DOC_SUMMARIES` still switches them off for everyone);
  documents already summarized keep their summaries.

- `[brief]` **A document deleted while it is still being indexed stays
  deleted.** Deleting a file during its upload's embedding step removed the
  file, and the worker then wrote its chunks into the index anyway: the
  document was gone from the knowledge base and still came back in answers,
  cited. The worker now checks once more after writing and takes the chunks
  out if the file is gone or its upload was cancelled. Files deleted this way
  before the fix can still have chunks in the index.
### Usage and limits

- `[brief]` **Reranking counts toward the monthly cost limit.** The default
  Scaleway reranker recorded its usage under a provider the price table did
  not list, so every reranking call was stored at a cost of zero and the
  cost ceiling never saw it. It is priced now (EUR 0.10 per million input
  tokens). Rows recorded before this change keep their zero.
  ([#1481](https://github.com/webamigos/RagenAI/pull/1481))

### Settings

- `[brief]` **The RAG settings page shows what runs, not what was
  switched on.** Reranking showed "on" on every default install, where no
  reranker is configured; it now shows off and says why. Content moderation
  showed a column nothing reads and "always enabled in SaaS mode"; it now
  shows the organization's active guardrail rules, or that there are none.
  Document summaries say when the installation has them switched off, and
  that the setting applies to documents indexed from now on. The reranking
  description no longer claims a cross-encoder.

- `[brief]` **The RAG pipeline page shows context expansion and section
  selection.** Both stages ran — expansion on by default — but the page that
  lists an organization's retrieval stages had no row for either. It now
  shows each as on or off, and says when section selection has taken the
  reranker's place.

### Chat

- `[major]` **An assistant can be told to answer only from its documents,
  and every assistant with the public chatbot on is, from this release.**
  Asked something its documents do not cover, such an assistant now says
  so instead of answering from the model's general knowledge — an answer
  that, on a customer's website, read as the company's own. **This flips
  every existing chatbot-enabled assistant to strict on deploy**; every
  other assistant keeps today's behaviour. One switch on the assistant
  page, "Answer only from documents", turns it either way per assistant.
  The same rule applies in the panel, on the public assistant page and
  through the API. The organization-level embedded widget is not covered
  yet.

- `[major]` **Ragen can remember a user across conversations — behind a
  switch, off by default.** With the `personalMemory` feature key on, a
  chat turn can keep three kinds of fact about the person asking: how they
  like answers (length, format, language), their role, and work in progress
  with its date. Facts about the organization, other people and one-off
  requests are not kept (100% of the organization-fact cases dropped in the
  eval). Each answer that changed memory says "Remembered · Undo"; a member
  sees, edits, switches off or wipes their memory in their settings, and an
  org admin can delete every member's. A message cannot talk it into
  deleting memories or into remembering an "administrator" claim. On for
  the demo organization; a self-hoster turns it on per organization in the
  admin panel and registers the nightly purge once
  (`ensure-memory-purge-schedule`).
  ([spec](https://github.com/webamigos/RagenAI/blob/main/docs/specs/2026-09-27-personal-memory-across-threads.md),
  [#1474](https://github.com/webamigos/RagenAI/pull/1474)–[#1492](https://github.com/webamigos/RagenAI/pull/1492),
  [#1510](https://github.com/webamigos/RagenAI/pull/1510),
  [#1513](https://github.com/webamigos/RagenAI/pull/1513))

- `[brief]` **A thread someone shared with you opens.** It was listed under
  "Shared with me", but opening it showed an empty chat with a message box:
  only the thread's owner and organization admins could load its messages.
  A member it was shared with now reads it, read-only, and can export it.
  ([#1493](https://github.com/webamigos/RagenAI/pull/1493))
