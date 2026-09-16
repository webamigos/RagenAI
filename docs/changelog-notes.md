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

## Unreleased

### Thread: the worker runtime becomes replaceable

- `[major]` **Re-indexing a document no longer leaves the old version in the
  index.** Every re-embed — a single file, a bulk re-embed, a folder policy
  change — added a fresh set of chunks without removing the previous ones,
  because the vector store's point ids are random and an upsert therefore
  cannot replace anything. The effect was retrieval quoting text that had been
  replaced, and quoting it twice: both copies competed for the same answer.
  Ingest now clears a file's existing chunks before writing new ones. Scraped
  pages are unaffected: re-scraping a URL creates a new entry rather than
  replacing one, so it never had the duplicate.
  ([#1209](https://github.com/webamigos/RagenAI/pull/1209))

- `[major]` **Cancelling a document ingest now takes effect immediately, and
  keeps working after the job has finished being tracked.** Cancellation used to
  be a message sent into a running workflow's memory: the file stayed
  "processing" in the interface until the pipeline next looked at the flag,
  cancelling a job the engine had already forgotten raised an error, and a
  worker restart lost the request entirely. It is a status on the file now — the
  interface updates on the click, the pipeline stops at its next checkpoint, and
  a restart changes nothing. Cancelling still lets an in-flight parse finish
  rather than killing it mid-file, which is deliberate: the alternative leaves
  half-written state behind.
  ([#1207](https://github.com/webamigos/RagenAI/pull/1207))

- `[brief]` **A cancelled file can be re-indexed again.** Cancelling writes a
  status that later writes cannot overwrite, with one exception for starting
  fresh — so "re-embed" on a cancelled document works instead of being silently
  refused.
  ([#1207](https://github.com/webamigos/RagenAI/pull/1207))

### Thread: the application calls model providers itself (continued)

- `[major]` **An Anthropic key now works on its own.** `anthropic` is a provider
  in the route table, so a deployment holding a plain Anthropic key uses it
  directly instead of needing Bedrock or Vertex access to reach the same
  models. Chat only — Anthropic publishes no embeddings endpoint, and a route
  pointing an embedding model there now says so by name rather than failing
  somewhere inside the SDK.

- `[brief]` **A scaffolded install calls providers directly, like everything
  else.** `create-ragen-app` writes a route table for the one key you gave it
  and sets `LLM_GATEWAY=native`. It still writes the proxy config, so switching
  to `litellm` is a rollback rather than a second setup.

### Thread: a misconfiguration that says so

- `[brief]` **A deployment whose encryption key does not work now says so at
  startup, instead of failing one message at a time.** Having the variables set
  was treated as having a working key, so credentials that could not use the key
  — a permission not granted, a key from another project, the wrong region —
  produced a generic "an unexpected error occurred" on every question, with the
  real refusal only in the container logs. Ragen now wraps and unwraps one
  throwaway key at boot: `apps/api` refuses to start, `apps/web` shows the
  screen that explains which variable to fix. A timeout or a 5xx is treated as
  the blip it usually is and does not block anything.


### Thread: the application calls model providers itself

- `[major]` **Ragen can call model providers directly, so LiteLLM stops being a
  required service.** It used to proxy every model call; now that is one of two
  paths, chosen by `LLM_GATEWAY`. For a self-hoster this is one fewer service to
  run and one fewer set of credentials to keep in step.
  **Now the default** (2026-09-15): demo has been running `native` and reports
  it on `/api/healthcheck`, and `DEFAULT_GATEWAY_MODE` followed. A deployment
  that never set `LLM_GATEWAY` moves to direct provider calls on its next
  deploy — worth saying plainly in the post, because it means provider
  credentials have to reach the web, api and worker processes rather than only
  a proxy container. `LLM_GATEWAY=litellm` puts the proxy back.

  Be precise about the scope when writing this up: it is **model calls** that
  stop going through the proxy. A deployment running `RERANK_PROVIDER=cohere`
  without `RERANK_COHERE_BASE_URL` still reaches for `LITELLM_PROXY_URL`, so
  the proxy has to stay up for it; that is why the variable is still required.
  Speech is not in that group — it has its own base URL and never read the
  proxy's. Nor does the default remove the LiteLLM compose services, which
  carry no profile and start regardless.
  ([#1175](https://github.com/webamigos/RagenAI/pull/1175), ADR-49)

- `[major]` **Any OpenAI-compatible gateway can be attached instead** — Portkey,
  vLLM, Ollama, or LiteLLM itself. The point is that the seam is not
  LiteLLM-shaped: it takes an endpoint, so the choice of gateway (or of none)
  belongs to whoever runs the deployment.
  ([`attaching-a-gateway.md`](attaching-a-gateway.md))

- `[brief]` **Speech was returning 404 in every environment and now works.** It
  was pointed at the proxy, which serves no audio route. Worth a line precisely
  because nobody reported it — it had never worked.
  ([#1175](https://github.com/webamigos/RagenAI/pull/1175))

- `[brief]` **Per-team rate limits are enforced by Ragen itself**, instead of by
  LiteLLM virtual keys. Same limits, no longer dependent on the proxy being in
  the path.
  ([#1175](https://github.com/webamigos/RagenAI/pull/1175))

- `[brief]` **`npm run gateway:preflight --probe`** makes one real call per
  configured model and says whether a deployment can actually serve what it is
  configured to use — before a cutover rather than after the first 5xx.
  ([#1175](https://github.com/webamigos/RagenAI/pull/1175))

- `[brief]` **A local install without `TEMPORAL_SERVER_ADDRESS` set now falls
  back to `localhost:7233` instead of connecting to the literal string
  `"undefined"`.** apps/web built the address as
  `` `${process.env.TEMPORAL_SERVER_ADDRESS}` || 'localhost:7233' ``, and a
  template literal is never empty, so the fallback could not run. The worker
  and apps/api always had this right; every producer now reads the same
  default.
  ([#1203](https://github.com/webamigos/RagenAI/pull/1203))

- `[brief]` **PDF fallback parsing and SRT uploads could not reach a model at
  all.** Three model ids the worker uses — `claude-haiku-4-5`, `gpt-5.4-mini`
  and `gpt-5.4-nano` — had no entry in the gateway's route table, so they
  resolved to nothing once the proxy that used to serve them was retired. Two
  of them are named by constants in worker source rather than by an environment
  variable, which is why the preflight that exists to catch this could not see
  them; it can now.
  ([#1204](https://github.com/webamigos/RagenAI/pull/1204))

- `[brief]` **An answer saying the documents contain nothing about a topic no
  longer carries a citation.** Retrieval always returns the closest passages it
  can find, so a question about something the corpus does not cover still had
  chunks in front of the model — and the citation rule distinguished only
  between sentences that use the context and sentences that do not. A statement
  of absence is neither, so the model cited anyway: *"the documents contain no
  information about X [1]"*, where `[1]` tells the reader that source discusses
  X. Seen on demo in Italian; measured at 5 refusals in 50 carrying a citation
  before the fix, 0 in 50 after, with the rest of the citation suite unchanged.
  ([#1218](https://github.com/webamigos/RagenAI/pull/1218))

