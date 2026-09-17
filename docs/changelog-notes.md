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

### Thread: Ragen gets a command line

- `[major]` **`npm i -g ragen-cli` gives you a `ragen` command.** Today it
  scaffolds an installation and nothing else — `ragen create my-app` is
  `npx create-ragen-app@latest` with the same flags — and the commands that are not
  built (`login`, `doctor`, `kb`, `plugin`) are listed in `ragen help` under
  "Not built yet" and exit non-zero rather than quietly doing nothing. The
  package is `ragen-cli` and not `ragen` because npm refuses the plain name as
  too similar to `raven` and `hygen`, for every account, so it was never
  available to claim.
  ([#1237](https://github.com/webamigos/RagenAI/pull/1237))
### Thread: the API speaks OpenAI

- `[major]` **An OpenAI-compatible client can now be pointed at Ragen.**
  `POST /v1/chat/completions` required `assistant_id`, a field the OpenAI wire
  format has no slot for — so n8n, the OpenAI SDKs and anything else speaking
  that protocol got a 400 before the request reached anything. The assistant is
  chosen when the API key is created instead: a key reaches either one assistant
  or the whole knowledge base, the panel says which, and `assistant_id` becomes
  an optional field that has to agree with the key rather than a requirement.
  The same choice now applies to `/v1/chat`, `/v1/search`, `/v1/threads`,
  `/v1/assistants` and `/v1/files`, so a key handed to an outside integrator
  reaches one assistant and not the rest of the organization — which it could
  before.

- `[brief]` **`GET /v1/files` no longer answers for other organizations.** It
  filtered on the API key's assistant and nothing else, and no key has ever had
  one, so the filter evaluated to nothing. Nothing was exposed, because no key
  has been issued anywhere yet — and since a key had no way to carry an
  assistant before this release, the first one issued would have leaked.
  ([#1236](https://github.com/webamigos/RagenAI/pull/1236))

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

- `[brief]` **A worker on the BullMQ runtime now ingests twenty documents at a
  time instead of ten.** The old default was the conservative read of a
  measurement that did not exist yet; the one that does says ten cost a bulk
  upload about twice the latency of twenty — 24.9s per document against 12.5s —
  with the whole difference landing before a document started parsing rather
  than in the parsing and embedding themselves, which measured the same either
  way. Lower it with `WORKER_CONCURRENCY` if your model
  provider's rate limits bind before the worker does.
  ([#1221](https://github.com/webamigos/RagenAI/pull/1221))


- `[brief]` **A new self-hosted install now scaffolds onto BullMQ, and writes
  the address its runtime needs.** `npm create ragen-app` used to answer
  Temporal, which stopped being something the install runs when Temporal left
  the compose file — so the wizard now picks BullMQ on the Redis it already
  starts, writes `REDIS_URL` with it, and asks where the server is if you pick
  Temporal instead of writing `localhost:7233` on your behalf. The next-steps
  block also names `npm run worker:dev`: without a worker an upload is accepted
  and never parsed.
  ([#1225](https://github.com/webamigos/RagenAI/pull/1225))

- `[brief]` **The worker image is 180 MB smaller, because it now ships one job
  runtime instead of two.** BullMQ has been the default since ADR-44, but every
  image still carried the full Temporal SDK — 182 MB, most of it prebuilt
  native binaries the default runtime never loads. Nothing changes for an
  install on the default runtime, which is every install that has not selected
  otherwise: same behaviour, 1.01 GB instead of 1.19 GB.

  **`WORKER_RUNTIME=temporal` needs a rebuild.** The SDK is a build-time
  dependency now, so the published image no longer starts on Temporal — it
  stops at boot saying exactly that. Building the worker image with
  `apps/worker`'s devDependencies installed restores it, and the worker-runtime
  spec's Phase G replaces that with a supported package.
  ([#1229](https://github.com/webamigos/RagenAI/pull/1229))

- `[brief]` **The admin panel links to the queue dashboard.** The worker has
  served bull-board on its own port since the BullMQ runtime shipped, and
  nothing pointed at it — you had to know the port. Set `WORKER_ADMIN_URL` on
  the admin app and a "Queue Dashboard" item appears in its sidebar, opening
  the board in a new tab; leave it unset and there is no item, which is the
  right answer for an install that runs no dashboard. The board still has its
  own login for now — one sign-in instead of two is
  [#1232](https://github.com/webamigos/RagenAI/issues/1232).
  ([#1233](https://github.com/webamigos/RagenAI/pull/1233))

- `[brief]` **The installer asks about PII masking, and the answer is no by
  default.** Presidio is two containers and the analyzer alone is the heaviest
  thing in the stack — 959 MB idle, more than the document parser — so a trial
  install no longer pays for a feature most evaluations never reach. Say yes and
  the wizard writes both Presidio URLs *and* starts the stack with the compose
  profile those services sit behind; say nothing and masking is off by
  construction, because availability follows the URLs rather than a flag. The
  docs also stopped claiming Presidio starts by default: a plain
  `docker compose up` has never started it, which makes the idle stack about
  900 MB rather than the 1.9 GB the memory table adds up to.
  ([#1234](https://github.com/webamigos/RagenAI/pull/1234))
