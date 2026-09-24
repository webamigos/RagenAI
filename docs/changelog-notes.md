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

### Notifications in your language

- `[brief]` **Notifications speak your language.** A shared document,
  assistant or thread, or a finished Google Drive import, used to arrive in
  Polish whatever language you use Ragen in. The notifications page now
  writes each one in yours, names who shared it, and counts files properly
  ("1 file", "3 files"). Notifications sent before this change keep their
  original wording.

### Thread: sources you can read

- `[major]` **Clicking a source takes you to the passage.** The document
  opens at the cited place with the passage marked in yellow — word for word
  in a PDF (and at the right page even for older answers that never stored
  one), and in Word, Markdown, text, CSV and spreadsheet files too, where it
  used to open at the top. A spreadsheet opens on the sheet the rows came
  from. When the exact passage can't be found — the file was replaced since —
  the document still opens, with a short note saying so. A cited web page now
  shows its passage and a link to the page instead of "Preview unavailable".
- `[brief]` **A source's quote reads as text.** The passage under each source
  used to show the parser's formatting: "### How long…" for a heading,
  "| Refund | 14 days |" for a table row. It now shows the words, with table
  cells separated by " · ".
- `[brief]` **A tidier chat frame.** The conversation bar and the sources
  panel's header now sit on one line; the sources panel reaches the bottom
  of the frame; the frame keeps its rounded corner under the bar; and the
  line across the top of the message box is gone.

### Thread: the assistants grid tells the truth

- `[brief]` **The assistants grid counts threads the way the assistant's page
  does.** An admin saw "0 threads" on an assistant whose page listed dozens:
  the card counted only their own threads, while the page shows admins all
  of them. Also, in Brain's graph the sixth group of pages no longer shares
  the first one's colour.

### Thread: Ragen Brain for a showcase

- `[brief]` **A readable neighbourhood in Brain's graph.** Opening a page's
  neighbourhood no longer cuts off the names of pages at the right edge, or
  lets one page's name run into the next page: small views spread out and
  leave room for their labels.
- `[brief]` **The graph's legend shows its lines.** Each entry now draws the
  line it describes — the thick confirmed one, the amber uncertain one, the
  faint inferred one — so the words only have to say what it means.
- `[brief]` **Ragen Brain can be shown read-only.** Two new per-organization
  switches in the admin panel's Features page:
  - **Ragen Brain: curate** (on by default): turn it off to freeze Brain
    for everyone, so no extraction, review, publishing or upload into Brain;
  - **Ragen Brain: members may browse** (off by default): lets every member
    look around Brain, read-only.

  Brain then shows a "read-only preview" notice and hides every control. The
  server refuses the changes too; hiding the buttons is not what keeps people
  out. Meant for a demo organization: a member who browses Brain sees every
  page, including text drawn from documents they could not open themselves.

### Thread: the panel speaks your language

- `[brief]` **Fewer English words on Polish pages, and the reverse.** Several
  labels were hard-coded in one language:
  - the assistant selector in a chat (it said "Asystent:" on English pages);
  - the knowledge base's pagination and share dialog;
  - Brain's verification interval, which printed "P6M" and now says
    "6 months" / "6 miesięcy";
  - an extraction failure, which showed the worker's raw English error. It now
    reads as a sentence in your language, with the technical detail folded away.

  Also: the sidebar calls an organization's owner "Owner" rather than
  "Org admin". ([#1345](https://github.com/webamigos/RagenAI/pull/1345))
- `[brief]` **The knowledge base lists each document once.** A document imported
  into an assistant appeared twice, once for the original and once for the
  assistant's copy, and was counted twice in every total. Inside a folder, the
  line under the title now counts that folder rather than the whole
  organization. Web pages get a "URL" tag instead of a scrap of their address.
- `[brief]` **Tidier on small screens and wide tables.** On a phone, the chat
  header no longer pushes the assistant selector off the edge. Brain's tables
  fit their page instead of hiding the last column.
- `[brief]` **The notifications page uses the whole panel.** It was a narrow
  centred column that cut off the type filters and scrolled sideways on a
  phone. Now every filter is visible (shared assistants got one), unread items
  say "New" instead of relying on a red dot, "Mark all as read" is a real
  button that appears only when something is unread, and an empty or failed
  list says which it is. Dates use the panel's configured time zone, and the
  sidebar's unread count stays right after you mark things read.

### Thread: seeing what you uploaded

- `[brief]` **Spreadsheets have a preview.** An `.xlsx` or legacy `.xls` file
  opens in the knowledge base's preview as a readable sheet, with a tab for
  each sheet in the workbook, instead of "Preview unavailable". The same
  preview opens when a chat answer cites a spreadsheet. A very long sheet shows
  its first 1,000 rows and says so; the download link has the rest.
  ([#1268](https://github.com/webamigos/RagenAI/issues/1268))

### Thread: self-hosting without a cloud account

- `[brief]` **Object storage you run yourself.** `create-ragen-app` now offers
  RustFS as a third answer to "where should documents be stored?", next to the
  local disk and an S3 account: it generates the keys, starts RustFS with the
  rest of the stack (`docker compose --profile s3`) and creates the bucket. CI
  runs Ragen's storage against a real RustFS on every change. Also fixed on the
  way: with the apps running in containers (`ragen:up:everything`), S3 storage
  could not work at all — the containers were never given the S3 settings.

### Thread: what a regression pass turned up

- `[brief]` **Chat answers no longer show `<PL_PHONE_1>` instead of a phone
  number.** With nothing personal in the question, an answer could still say
  "call <PL_PHONE_1>" while the source beneath it showed the real number: the
  model was told about masking placeholders on every turn and sometimes
  invented one. The instruction is sent only when something was actually
  masked now, and a placeholder that cannot be restored is shown as "[redacted
  phone number]" rather than as a raw token. Organizations without their own
  prompt also get the default answer instructions again, which that
  instruction had been displacing.

- `[brief]` **Word, Excel and PowerPoint files are read, not indexed as
  bytes.** Uploaded while Docling was unavailable, a `.docx`, `.xlsx` or
  `.pptx` (and an `.epub` even with Docling up) was mistaken for plain text by
  its name, and its raw compressed bytes were chunked and indexed — the chat
  then quoted lines of `�` as a source. They are now detected from their
  content and parsed by their own loader, or the upload fails with a clear
  reason; nothing unreadable reaches the index, and a quote from a chunk
  indexed before the fix is no longer shown. **Files already affected need
  re-processing.**

- `[major]` **An assistant's instruction is saved now.** Typing an instruction
  into an assistant, pressing save and getting the confirmation toast did not
  store it: the box is empty while the current value is still loading, and when
  that load answered it reset the field under you, so the save that followed
  sent an empty string. The endpoint reported success on it, which is why the
  toast was honest and the setting was gone. Reopening the dialog was the only
  way to find out.

- `[brief]` **The composer's icon buttons have names.** Send, voice input and
  attachment are icons, and the icons are hidden from assistive technology on
  purpose, so a screen reader announced the product's primary action as
  "button". All three read from the translations now, in all fifteen
  languages — the attachment label was missing from every one of them, which
  the browser console had been saying on every render.

- `[brief]` **The admin panel signs in on a fresh checkout.** It trusted only
  the origin in `BETTER_AUTH_URL`, which the shared root `.env.local` points at
  the main app, so the panel refused its own sign-in form with "Invalid origin"
  — on the one surface that has no other way in.

- `[brief]` **You can get into the admin panel on your own machine.** Signing
  in worked under `admin:dev` and not under the built panel, with the same
  "Invalid origin" and no hint that the mode was the difference — both scripts
  name their own origin now. Separately, there was no way to *become* an
  administrator twice: the first-run screen promotes one account once and then
  refuses for ever, so a development database a week old had no account anyone
  could sign in as. `npm run local:admin -- --email you@example.com` grants the
  role and sets a password, and refuses outright unless the database is on your
  own machine.

- `[major]` **The MCP catalogue opens.** The screen a platform administrator
  adds a connector from rendered nothing but "This page couldn't load", in
  every build. Its form imported the URL validator for two constants, and the
  validator reaches the address policy, which imports `node:net` — a module a
  browser has no version of. The page server-rendered, hydrated, threw and
  replaced itself with the error boundary, and because the document itself was
  a perfectly good 200 the failure was invisible to anything that checked
  status codes.

- `[major]` **Adding a connector no longer ends on an error page.** Every
  mutation on the catalogue — add, edit, enable, disable, delete — wrote its
  row and then failed, because recording the action needs either an
  organization or a security event and the catalogue belongs to no
  organization. The administrator saw a server error over a change that had in
  fact been made, and the list still showed the old state until they reloaded.
  All five are recorded as platform configuration changes now, and appear in
  the incidents view.

- `[brief]` **A connector that carries a credential is held to https when you
  save it.** The rule already applied when the connection was opened, so an
  entry typed as `http://` saved, switched itself on, and then failed every
  connection with nothing having said why. The form refuses it at the point of
  saving instead. A server-side connector sends no credential of its own and
  may still use plain http, which is the case an MCP server on your own network
  is for.

- `[brief]` **A platform-wide feature default now applies to the public API
  too.** A default a platform administrator set in the admin panel — say,
  freezing uploads with *Add and remove documents* off — was honoured in the
  app and ignored by `/v1`, which read only the organization override and the
  plan. The API resolves all four layers now, the same way the app does. And
  the panel's "which layer decided this" view picks the same subscription the
  app gates on; with a Trial beside a paid plan it could show the Trial's
  features. (#1310, and the PR stacked on it)

### Thread: connectors are added from the panel, not from a release

- `[major]` **A platform administrator can add an MCP connector without a
  deploy.** Which services Ragen could connect to used to be a Postgres enum
  with eleven members, so adding a twelfth meant a migration, two manifests,
  two icons, a handful of environment variables and a coordinated release of
  three services. It is a row now, edited at **MCP Catalogue** in the admin
  panel: paste the server URL, pick how it authenticates, press **Test
  connection** to see the tools it exposes, and grant it to the organizations
  that should have it. A self-hosted installation whose team lives in Notion no
  longer waits for an upstream release, and a company's own internal MCP server
  can be connected at all — which it previously could not, at any price,
  without forking.

- `[minor]` **An internal MCP server can be reached, and cloud metadata still
  cannot.** A catalogue URL is checked against the same address policy that
  protects the shop-URL connectors — at save time, at connect time and on every
  tool call. An entry may tick *allow a private address* for a server on the
  operator's own network; that admits 10.x, 172.16–31.x and 192.168.x and
  nothing else, so `169.254.169.254` stays refused with the box ticked. The
  check also reached `apps/web` for the first time: it had been opening
  connector sessions with no address check at all.

- `[minor]` **Disabling a connector for the whole installation is now a
  switch.** A built-in can be switched off from the same page, which hides it
  from every organization's gallery and stops new connections while the
  connectors people already have keep working.

- `[minor]` **An MCP server on `http://` now works, instead of passing the test
  and then failing quietly.** The form accepted a plain-`http` address and
  **Test connection** confirmed it, tool names and all — and then every tool
  call refused it, because the outbound guard allowed https only. That is the
  test button's whole purpose inverted. An entry now dials the scheme it was
  saved with, so an internal server without a certificate works; an `https`
  entry is still held to https, so a redirect cannot quietly downgrade it.

- `[brief]` **Writing the MCP server itself is one command.**
  `npx create-ragen-connector` scaffolds a server Ragen can connect to — the
  two listeners, the Dockerfile, the tests, and the three places Ragen's client
  departs from the MCP specification, which nobody could previously learn
  without reading Ragen's source. It prints the catalogue row to paste into the
  admin panel. Lives in
  [`ragen-connectors`](https://github.com/webamigos/ragen-connectors/pull/45).

### Thread: guardrails, authored in the panel

- `[major]` **A guardrail written in the admin panel now applies to the chat.**
  Until this week the panel could author rules and nothing read them; content
  moderation was decided by `MODERATION_ENABLED`, an environment variable only
  a self-hoster could reach and nobody could see from inside the product. A
  platform administrator can now write a rule — a pattern, or the built-in
  moderation detector — switch it on, and have it take effect on every
  organization's next turn, inside the one-minute cache. Three actions:
  **block** the message with a localized refusal, **mask** the match before the
  model is shown it, or **log** it and let the turn through. Every rule is
  created switched off, in log mode, because a rule that starts by blocking is
  a rule whose false-positive rate nobody has measured. For anyone
  self-hosting: `MODERATION_ENABLED` stops being read, so the equivalent of
  your current setting is the `content-moderation` rule in the panel — run
  `npm run guardrails:preflight` before upgrading and it will tell you whether
  the two disagree, and refuse if turning it on would otherwise be forgotten.
  `GUARDRAILS_DISABLED=1` remains as break-glass on a service.

- `[brief]` **A blocked message no longer reaches a model at all.** The
  refusal always worked, but the chain evaluated the rules *beside* the query
  rephraser rather than before it, to save a round-trip — so a message a
  block rule refused had already been sent to the rephrasing model, which on
  most installations is an external provider. Nobody saw an answer, and the
  text left the building anyway. The stage runs first now, on both the app and
  the public API, and the guarantee reads the way people assume it does:
  refused means it never went anywhere. Costs one round-trip of latency on
  turns with rules enabled. The same change fixes a rarer wrong answer — when
  the rephraser failed for its own reasons, whichever failure landed first won
  the race, so a refused message could report "an unexpected error" instead of
  the refusal.

- `[brief]` **The platform-guardrails page in the admin panel works.** It
  shipped this week and never rendered for anyone: the page loaded, then
  replaced itself with "This page couldn't load", in the dev server and in a
  production build alike. A client component reached a module that imports
  `node:worker_threads`, which cannot exist in a browser bundle. A platform
  administrator can now actually do what the page was built for — list the
  built-in detectors, write a pattern rule, switch one on, and set a
  per-organization override that says which layer decided each value.

  Ordering matters if both of these are written up together: this fix landed
  while the authoring surface still enforced nothing, and the entry above is
  what made the rules apply. A post that presents them the other way round
  would describe a week in which guardrails blocked messages through a page
  that did not render.


### Thread: the version number says something again

- `[major]` **Ragen is on 2.0.0.** Nothing in the product broke — the jump is
  the point. The line reached 1.217.0 by counting 217 minor bumps of ordinary
  feature work, one per merge, so the number had stopped telling anyone what
  had changed between two of them. 2.0.0 restarts it alongside a rule that
  makes releases rarer: work that ships behind a disabled feature key is a
  `chore` and cuts no release, and only turning the key on is a `feat`. One
  feature, one version. For anyone self-hosting, the practical effect is that
  `latest` and the published images move when something actually reaches them
  (ADR-50 in [#1264](https://github.com/webamigos/RagenAI/pull/1264); the
  version reset itself is
  [#1266](https://github.com/webamigos/RagenAI/pull/1266))

- `[major]` **...and back on 2.x, after briefly reaching 5.0.0.** The rule
  above fixed how often a release happens and left open what it is numbered.
  Over the two days that followed, three internal changes retired an
  environment variable — `MODERATION_ENABLED`, `JAILBREAK_DETECTION_ENABLED`,
  the Temporal adapter — and each said so in its commit footer, which is the
  honest thing to write for anyone whose `.env` still sets one. It was also,
  under the default rules, a major release each time: 3.0.0, 4.0.0, 5.0.0 in
  thirty-six hours, announcing breakage to consumers none of them had. Those
  six releases have been withdrawn and the line resumes at 2.1.0. From now on
  a breaking note is a minor, and the first number moves only when somebody
  decides it should — so if you pin Ragen, a major means a deliberate
  statement about your upgrade rather than an environment variable you never
  set. Images already published as 3.x, 4.x and 5.0.0 stay in the registry;
  `latest` follows the 2.x line again (ADR-51)

### Thread: a field that does not lie about what it holds

- `[brief]` **A project instruction stays in the box after you save it.** The
  form reset to its empty default on success, so the operator saw the success
  toast and watched their instruction vanish at the same moment — the save had
  worked, the field was wrong about it. A second, narrower version of the same
  bug goes with it: the instruction the page loads when it opens could arrive
  *after* a save and overwrite it with the value from before.
  ([#1265](https://github.com/webamigos/RagenAI/pull/1265))

  One line rather than a section: nothing was ever lost, but the only feedback
  the screen gave said otherwise, which is the kind of thing people stop
  trusting a panel over.


### Thread: one name for every workspace

- `[brief]` **Every workspace in the monorepo is `@ragenai/*` now.** The five
  apps and the repository root were `@webamigos/ragen-*` while all ten packages
  were already `@ragenai/*` — two layers of history rather than a convention.
  If you script against this repo, a command naming a workspace needs its new
  name: `npm run test:e2e --workspace=@ragenai/web`, not
  `@webamigos/ragen-web`. Nothing you install moves: the SDK stays
  `@webamigos/ragen-sdk-ts`, `create-ragen-app` and `ragen-cli` are unchanged,
  and the published images are still `ghcr.io/webamigos/ragen-<app>` because
  those names never came from a package name.
  ([#1253](https://github.com/webamigos/RagenAI/pull/1253))


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

- `[brief]` **The MCP server works with a knowledge-base key again.** Both
  tools declared `assistant_id` as required, so a key scoped to the knowledge
  base — the default — could not call them: whatever the model filled in came
  back a 403. The field is optional now and omitted when nobody names one, which
  is what the key expects.

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

- `[brief]` **The API lists the models it serves.** `GET /v1/models` answers
  with the models this deployment can actually reach and the organization is
  allowed to use, so an OpenAI-compatible client fills its model picker instead
  of showing an error there. Read-only, and narrower than it sounds: it is the
  intersection of the catalogue, the route table and the per-org allowlist, so
  a model it lists is one that will answer.

- `[brief]` **`GET /v1/files` no longer answers for other organizations.** It
  filtered on the API key's assistant and nothing else, and no key has ever had
  one, so the filter evaluated to nothing. Nothing was exposed, because no key
  has been issued anywhere yet — and since a key had no way to carry an
  assistant before this release, the first one issued would have leaked.
  ([#1236](https://github.com/webamigos/RagenAI/pull/1236))

### Thread: the first run works on a machine that is not empty

- `[major]` **Two Ragen installs on one machine no longer share a database.**
  `docker-compose.yml` pinned its container, volume and network names
  (`ragen-postgres`, `ragen-postgres-data`, `ragen-network`) instead of letting
  Compose prefix them per project. Those names are global to the Docker daemon,
  so a second install collided on every container name and — the part nobody
  saw — attached to the *first* install's Postgres and Qdrant volumes. Names are
  Compose's now, so two checkouts coexist with no configuration. Published ports
  are not prefixed by anything and still collide; the installer probes them
  before it starts the stack and tells you which one is taken and what to set.

  **If you already run a stack, read this before upgrading.** Your data is in
  volumes named `ragen-postgres-data` and `ragen-qdrant-data`; a `docker compose
  up` after this change creates new, empty ones named for your project directory
  (`ragen-app_postgres_data`). Nothing is deleted — the old volumes are still
  there — but the stack comes up blank. To keep the data, copy it across once,
  with the stack stopped:

  ```bash
  docker run --rm -v ragen-postgres-data:/from -v ragen-app_postgres_data:/to \
    alpine sh -c 'cd /from && cp -a . /to'
  ```

  (substitute your own project name — `docker compose config --format json | jq
  -r .name` prints it — and repeat for `qdrant`.) Or start fresh and re-ingest.
  `RAGEN_STACK_NAME` is gone; `COMPOSE_PROJECT_NAME` does that job now, and the
  installer writes it into the new install's `.env` for you — which matters,
  because Compose names a project after its *directory*, so two installs both
  called `ragen` would still have shared everything.

- `[brief]` **Ragen states which Nodes it runs on, and the installer refuses the
  rest in the first second.** `jsdom` — a transitive dependency, arriving with
  no version bump of ours — requires `^22.22.2 || ^24.15.0 || >=26.0.0`, and the
  repository sets `engine-strict=true`, so npm stops rather than warns.
  `engines.node` said `>=24`, so `create-ragen-app` cleared Node 24.13, cloned,
  wrote `.env.local`, started Docker, and only then hit `EBADENGINE`. It is
  `^24.15.0 || >=26.0.0` everywhere now — a range, not a minimum, because that
  range skips the whole Node 25 line and no `>=` can say so. The refusal names
  the reason, which is what someone who already has "Node 24" (or a *newer*
  Node 25) needs to hear.
  ([86bc1vbqz](https://app.clickup.com/t/86bc1vbqz))


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

- `[brief]` **Adding a model points at the file that adds a model.** The docs
  and code comments a contributor reads first — the environment reference, the
  RAG pipeline page, the evals README, the PDF processing notes — still named
  the retired LiteLLM proxy config as the model catalogue, a week after it was
  deleted. They name `infra/llm-gateway/routes.yaml` now, and a guard fails the
  build if any of them starts naming a file that is not there. `infra/temporal/`
  gets a header explaining why it is still in the tree when nothing reads it
  ([#1297](https://github.com/webamigos/RagenAI/issues/1297)).

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

- `[brief]` **A package that was retired is actually gone.** Retiring the
  LiteLLM path deleted `packages/litellm-client`'s source but left its compiled
  output tracked, its dependency line in three apps and its entry in
  `package-lock.json`. Every install since has been putting a broken symlink
  into `node_modules` — installed, unimportable, and silent about it, because
  nothing happened to import it. Gone now, with a guard that fails the build if
  a manifest or the lockfile names a workspace that is not in the tree.

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

- `[brief]` **A document uploaded through the public API is answerable as soon
  as it finishes processing.** It was not: the chat endpoints retrieved as if
  the caller were an ordinary member, and the permission field that check reads
  was never written at ingest — only when someone later changed a share. So the
  API would report a file `processed`, `/v1/search` would return it, and the
  assistant would say it did not know. Ingest writes the field now, and the two
  chat endpoints resolve the caller's real scope the way search already did.
  Two access bugs fell out of the same place: deleting a user used to publish
  every private file they owned to the whole organization, and a file
  deliberately shared with the organization reached nobody but its owner.
  Documents indexed before this still need
  `apps/web/src/scripts/backfill-accessible-by.ts` once.

- `[brief]` **A bad model name no longer takes the API down.** Asking
  `/v1/chat/completions` for a model this installation does not serve killed
  the whole process — for every caller, from one request — because the failure
  surfaced from inside a stream where nothing was watching. It is now a 400
  that names the model and lists the ones that do work. The same crash was
  reachable without anyone trying: an organization's configured default model
  losing its row in `routes.yaml` was enough, and the embedding model had the
  same problem by a different route. The API also stays up now when a promise
  fails that nothing was waiting for — it logs the fault instead of exiting.

- `[brief]` **Chat no longer demands an OpenAI key it was not going to use.**
  Content moderation is off unless you turn it on, but the client for it was
  built on every request and threw without OpenAI credentials — so a
  self-hosted install running, say, Scaleway answered 500 to every chat, over a
  feature it had switched off. Also: running several apps from the one
  `.env.local` no longer needs care about `PORT`. Use `RAGEN_API_PORT` and
  `RAGEN_MCP_PORT`; a bare `PORT` used to follow every app at once and put the
  MCP server on the API's port.

- `[brief]` **Durable execution is a published image away, and the default
  install no longer carries it at all.** Running the worker on Temporal used to
  mean compiling the whole thing. There is now a Dockerfile in
  [`webamigos/ragen-enterprise`](https://github.com/webamigos/ragen-enterprise)
  that layers the Temporal adapter and the SDK onto
  `ghcr.io/webamigos/ragen-worker`, so a self-hoster who wants replay builds one
  small image on top of ours. Everyone else gets a worker with no Temporal
  adapter and no `@temporalio/*` in it whatsoever — the package moved out of
  Ragen entirely, so it is gone from the image rather than merely unused. The
  nightly parity job moved with it, and still runs Ragen's own job-runtime suite
  against a real Temporal server, so "Temporal is supported" stays a thing that
  is tested rather than a package name.

  **If you run Temporal today, read this before upgrading.** The published `web`
  and `api` images are now BullMQ producers: they enqueue, and they no longer
  contain the Temporal adapter. Keeping a Temporal deployment means building
  those two from source with the adapter added — a dependency and two lines each,
  documented in `ragen-enterprise`. The worker itself is the ready-made image.
  The schedule scripts have to run from that image too.

- `[brief]` **The published images run natively on Apple silicon and Graviton.**
  `ghcr.io/webamigos/ragen-{web,api,worker,admin,mcp}` were `linux/amd64` only,
  which nothing refused and nothing reported: an arm64 host pulled the amd64
  image and ran it under emulation, and the only sign was a badge in Docker
  Desktop — plus whatever a native module did when it hit something the
  emulator handled badly, which looked like a bug in Ragen. Every tag is a
  two-architecture manifest now, with each architecture built on a runner that
  provides it, so `docker pull` gets the right one and nothing emulates
  anything. Nothing to change on your side; pull the new tag. Self-hosting on a
  Mac or on Graviton/Ampere stops meaning "build it yourself".

- `[brief]` **The guardrails page now says what each rule actually did.** Rules
  were authorable and enforceable, and nothing on the screen reported their
  cost — so "switch it on in observation mode and see" ended at "see" with
  nowhere to look. Every platform rule now carries its hits for the last seven
  days, split into what it blocked and what it merely flagged, across every
  organization and both the panel and the public API. A rule that is switched
  on and has matched nothing says `0`; a rule that is off everywhere says `—`,
  because a rule nothing evaluated has not been measured, and `0` would read as
  "measured, nothing to worry about". On the incidents
  page, the event-type filter is a real list instead of a box you had to type
  an enum member into, with "any guardrail hit" at the top — and a filter it
  does not recognise now shows everything rather than an error page, which is
  what a typo used to produce there and in the CSV export.

- `[brief]` **A guardrail rule can now be a policy written in plain language,
  and you can see what judging it cost.** Until now a rule had to be a pattern
  or one of the two built-in detectors, which covers "never let this string
  through" and not "this assistant answers only about our product catalogue".
  A policy rule carries the sentence you would say to a colleague, and a model
  scores each message against it from 0 to 1; at or above the rule's threshold
  the rule has fired, and — like every other rule — it starts in observation
  mode, recording what it would have done. Policies on a turn are judged at
  the same time rather than one after another, so three rules cost one wait
  and not three, and no more than three run at once: each one is a model call
  on every turn, and that is a bill rather than a delay. Judging shows on the
  AI-usage page under its own **Guardrail** step, so "what are the guardrails
  costing us" is a number you can read instead of a line on a provider's
  invoice. A judge that times out or fails lets the turn through and says so
  in the log — a check that can take chat down is worse than the thing it
  catches. Writing a policy from the panel arrives in the next change; this one
  is the engine underneath it.

- `[brief]` **Reranking now shows up on the AI-usage page.** It has been
  written to the usage table since reranking shipped, and the page had no
  label, no colour and no filter option for it — so the cost was counted in
  your totals and could not be separated out. Reranking is opt-in, which makes
  that the one question somebody who enabled it wants answered. Fixed, along
  with a check that every kind of AI call the product records has somewhere to
  appear: the same gap had already happened twice and would have kept
  happening, because nothing breaks when it does.

- `[brief]` **Jailbreak detection is a rule you can see and switch on, and it
  now covers the public API.** It used to be an environment variable and a
  classifier that ran beside the answer: it scored each message, wrote an
  audit event when the score was high, and could not stop anything — it was
  telemetry by construction. It is a guardrail rule now, alongside content
  moderation and anything you write yourself. That means you turn it on per
  organization from the admin panel rather than at deploy time, you set its
  threshold there, and you choose whether a hit blocks the turn or is only
  recorded. It also runs on the **public API and the embedded chat widget**,
  which the old classifier did not — the API had no jailbreak detection at
  all, while the panel happily listed the rule. Hits from the widget say so,
  so you can filter incidents down to what the public widget is being sent.
  `JAILBREAK_DETECTION_ENABLED` and `JAILBREAK_DETECTION_THRESHOLD` are read
  by nothing now, and neither is `MODERATION_ENABLED`; run
  `npm run guardrails:preflight` once before upgrading — it compares what you
  were enforcing against what the panel holds and refuses a deploy that would
  quietly stop enforcing it — then delete all three from your environment. One
  thing is smaller than before: a burst of jailbreak hits no longer escalates
  to critical and emails you. A rule that can refuse the message is the
  replacement, and you can set any rule's severity to critical if you want the
  email on the first hit.

- **You can now write a guardrail in plain English, and try it before you turn
  it on.** The admin panel's rule form takes a policy — "never discuss a
  competitor's pricing", "refuse anything asking for legal advice" — and a
  judge model scores every incoming message against it. Below the field is a
  **test box**: paste a message and it comes back with the score, the threshold
  that would have been applied, and whether the rule would have fired. That
  matters more than it sounds, because a policy is the one kind of rule whose
  behaviour you cannot read off the form: a pattern either matches or it does
  not, but whether a sentence you wrote fires on a given message is a question
  only the model can answer. Without the box, the way to find out was to switch
  the rule on and watch real traffic — which for a blocking rule means finding
  out from a customer. The test runs the same model, the same prompt and the
  same threshold a real turn would, and saves nothing. If your installation
  masks personal data, it shows you the masked text the judge actually read,
  so a policy about phone numbers cannot quietly be tested against a number the
  judge will never see. Leave the threshold empty to use the default of 0.7;
  lower it to fire on weaker evidence. Each organization may run three policy
  rules at once on a stage, and the form says so where you meet it — a policy
  rule is a model call per message, for ever, so the limit is about the bill
  rather than about speed.

- **The jailbreak detector's sensitivity is now yours to set.** It is judged by
  a model and scored 0 to 1, and the score at which it fires has always been
  stored on the rule and read on every turn — but no page could change it, so
  it ran at whatever the install shipped with. The rule form now offers it, the
  same field a policy rule has. Lower it to catch more and accept more false
  positives; raise it to fire only on the obvious. The question the detector
  asks stays fixed in code — only how sure it has to be is yours, and the form
  says so. Content moderation has no such field on purpose: it asks a
  provider's endpoint that answers yes or no rather than with a score, so a
  threshold there would be a number nothing reads.

- **An organization can now be given its own answer to "what happens when this
  fires", not just "does it run".** Overriding a platform rule for one customer
  used to be a single switch: on, off, or inherit. It now also takes the action
  — so you can keep a blocking rule in place for everyone and have it merely
  log for one tenant while they work through the false positives — and, on a
  rule judged by a model, the score it fires at. Both were already honoured
  everywhere the rules run; there was simply no control that could set them.
  Two guardrails around the edges: a threshold is offered only on a rule whose
  verdict is actually a score, and an action is refused when the rule cannot
  carry it out, so you find out at the point of saving rather than from a rule
  that quietly keeps doing what it did before.

- **Guardrails now read the assistant's answer, not just the question.** Until
  now a rule could only be checked against what the customer typed. A rule can
  now run on the answer as well — or on both sides — and catch something the
  model itself produced: a phrase nobody is supposed to put in writing, a
  format that should never leave the building, a policy the answer breaks.
  Three things are worth knowing before turning one on. A blocking rule stores
  the notice instead of the text that was stopped, so the thing the rule exists
  to withhold does not end up sitting in the conversation history — and in the
  panel and the chat widget it also takes back what was already on screen. A
  caller of the OpenAI-compatible API is a different matter: that format has no
  way to unsend what it has already streamed, so the answer ends with
  `finish_reason: "content_filter"` and a client that ignores it keeps what it
  received. If the text must never reach a caller at all, the rule belongs on
  the question rather than on the answer. A
  rule judged by a model delays the whole answer, which then appears at once
  rather than word by word, because a judge has to read the finished answer
  before any of it can be shown; the form says so where you choose the stage.
  And a pattern on the answer cannot be anchored to the start or the end of it
  — answers arrive in pieces, so those would mean "the end of whatever the
  model happened to send" — which the form refuses at the point of saving
  rather than leaving you with a rule that quietly never fires.
