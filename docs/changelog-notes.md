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

- Brain’s Documents tab counts each knowledge page once per source file, even when it cites several quotes from that file. Publication status updates after indexing without a reload, empty extractions remain actionable, and ambiguous spreadsheet languages stay undetected.

### MCP sign-in

- `[brief]` **Connect an AI client with your Ragen account.** OAuth sign-in,
  workspace consent and **Connected apps** are implemented behind deployment
  and organization flags that default off. Once enabled after interoperability
  checks, users can connect without copying an API key and disconnect from
  account settings; current membership and document permissions govern calls.

### Self-hosting

- `[brief]` **The knowledge base from a terminal.** `ragen kb upload docs/*.pdf
  --wait` uploads files with an API key and waits until each is indexed,
  exiting non-zero if one fails; `ragen kb ls`, `status` and `rm` cover the
  rest, and `ragen search "…"` prints the passages chat would answer from.
  The per-minute upload limit is waited out rather than failing the
  eleventh file. Needs `ragen-cli` 0.3.0.

- `[brief]` **`ragen login` and `ragen doctor`.** `ragen login --url …`
  checks an API key against the installation and saves it, so later commands
  need no exported variables; `ragen doctor` says which address and key are in
  use and where each came from, whether the API answers, whether it accepts
  the key, which models it offers, and whether the CLI is out of date.
  Needs `ragen-cli` 0.3.0.

- `[brief]` **Ask from a terminal.** `ragen ask "…"` streams an answer from
  the knowledge base, with the same retrieval and guardrails as chat, and
  exits non-zero if the answer is cut off; `ragen assistants ls` lists the
  ids `--assistant` takes. Needs `ragen-cli` 0.3.0.

- `[brief]` **A smoke test for the MCP server.** `npm run smoke
  --workspace=@ragenai/mcp -- <url>` checks a running server one layer at a
  time — connection, tools, the API key, retrieval, optionally a model
  answer — and names the service and variable to look at when one fails.
  The server's health check passes while the API behind it has no token
  vault or vector store; this is what catches that.

- [brief] A fresh `npx create-ragen-app` install on an OpenAI or Anthropic key
  now parses its first upload. The worker refused to boot without Scaleway
  credentials it never used, and summaries, scoring and live ingest progress
  pointed at models and an address the install did not have. The README's
  quickstart also names all three processes rather than only the web app.

- `[brief]` **Ragen's MCP server also runs over stdio.** Set
  `RAGEN_MCP_TRANSPORT=stdio` and `RAGEN_API_KEY`, and an MCP client that
  launches servers as child processes can start it directly instead of
  connecting to a deployed `/mcp` URL. It is also what lets the Glama MCP
  directory inspect and score the server.

### Knowledge base

Brain ma tryb przeglądu z twierdzeniami obok cytatów, przypisaniem właściciela wszystkim kandydatom dokumentu i decyzjami z klawiatury. Ostrzeżenia o brakujących liczbach lub negacji są opcjonalne; oceny pojedynczych twierdzeń pozostają tylko w widoku.

- Brain ma nowy przegląd: pokazuje drogę od dokumentów do publikacji, strony wymagające uwagi i dokumenty z największą liczbą kandydatów. Liczniki prowadzą do dopasowanych list.

- `[brief]` **The file list's toolbar stays on one row on a laptop.** With the
  app sidebar open on a 14" screen, the last filter (PII policy) dropped to a
  second line. The search field now narrows to make room before any filter
  wraps, and widens back when there is space.

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

- `[major]` **Taking a document away from someone now takes it out of their
  answers, not only out of their knowledge base.** Revoking a share, moving a
  file or folder, or changing a folder's team updated the document list at once
  and left the search index as it was at upload, so a person who had lost
  access could still get that document's content back in chat until it was
  re-indexed. The index is now rewritten after each of those changes, and an
  upload re-checks who may read it once its chunks are written, in case access
  changed while it was being indexed. Documents revoked before this release are
  corrected the next time anyone touches their sharing, or when they are
  re-indexed; there is no sweep over old ones yet. ([#1245](https://github.com/webamigos/RagenAI/issues/1245))

### Navigation

- `[brief]` **Settings get the same sidebar menu, and only your own pages.**
  Inside Settings the sidebar lists General, Account, Connectors, Shared
  threads and Memory in place of the main menu, with "Main menu" back to where
  you were, and the page gets the width the second column took. The settings
  menu used to mix in the organization's pages too; Knowledge analytics, PII
  policy and the rest are now only in the Organization menu, and their old
  settings links still redirect there.
- `[brief]` **The organization pages have one menu, in the sidebar, not two
  columns.** Inside Organization the sidebar lists that section's pages
  (Users, Teams, API keys, RAG pipeline, and the rest) in place of the main menu
  and the thread history, and the page gets the width the second column took.
  "Main menu" at the top returns to the page you came from, however many
  organization pages you opened in between; a bookmarked organization URL goes
  to a new chat. The organization switcher and the user menu stay where they
  were. ([#1399](https://github.com/webamigos/RagenAI/issues/1399))

### Email

- `[major]` **Ragen's emails speak the reader's language.** Invitations,
  password resets, address verification, the welcome message and security
  alerts were Polish – subject and body – whatever language the person
  spoke. They are now written in any of the 17 languages the panel ships. The
  language is the one the request came in: an administrator's language for the
  invitations they send, the browser's for someone signing up or resetting a
  password; English when there is nothing to go on. Security alerts go to the
  people who run the installation, so they use the new optional
  `SECURITY_ALERT_LOCALE` (default English) and never the language of the
  request that raised them.

### Usage and limits

- `[brief]` **The public API's rate limits are the documented ones.** Every
  route was held to the strictest tier, 10 requests a minute per address,
  because the rate limiter applied all three of its tiers to every route.
  Listing and reading files, threads and assistants, `/v1/search` and
  `/v1/chat` now allow the documented 20 a minute; uploads and chat
  completions stay at 10.

- `[brief]` **Reranking counts toward the monthly cost limit.** The default
  Scaleway reranker recorded its usage under a provider the price table did
  not list, so every reranking call was stored at a cost of zero and the
  cost ceiling never saw it. It is priced now (EUR 0.10 per million input
  tokens). Rows recorded before this change keep their zero.
  ([#1481](https://github.com/webamigos/RagenAI/pull/1481))

### Settings

- `[brief]` **The API keys page says when a key cannot be created, and why.**
  An organization whose plan has no API access was offered the "New key"
  form anyway, and every submit failed with "Failed to load keys" — a
  message about loading, shown for any failure to create. The button now
  gives way to a notice naming the plan (or demo mode), and a failed create
  says the key was not created.

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
  through the API. The organization's embedded website widget is always
  strict: it has no assistant to carry the switch, and it is the most
  public surface.

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

- 2026-10-06: The Ragen MCP server advertises its packaged Ragen logo and serves a public favicon for connector clients.
- 2026-10-06: The published shared demo account can no longer create new organizations, including through the authentication API. Separate accounts retain that capability.

- 2026-10-06: Patch proxy-addr to 2.0.8 to prevent IP spoofing with incorrectly configured IPv4-mapped IPv6 trust subnets (GHSA-jqcg-44mw-7w3h).
