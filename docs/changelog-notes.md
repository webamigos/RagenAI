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

- `[brief]` **Deleting a file through the API deletes the file.** A document
  deleted through the public API (`DELETE /v1/files/{id}`) lost its row, its
  thumbnail and its search index entries, but its original upload stayed in
  storage: the cleanup asked the session which organization it was in, and an
  API call has no session. Deleting a folder had the same gap. Both delete the
  stored original now. Files deleted through the API before this can still
  have their originals in storage.
