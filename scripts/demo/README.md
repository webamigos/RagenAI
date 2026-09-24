# Nordwind Logistics — demo seed

A repeatable dataset for screenshots and demos: **Nordwind Logistics**, a
fictional mid-size logistics company with HR, Sales, Customer Support and
Compliance departments. It comes in two languages, **one organization per
locale**, each with its own users. Every piece of content (document text,
questions, answers, Brain pages, findings, team and folder names) is in the
organization's language.

One organization per locale, rather than one organization holding both, means
a Polish screenshot never shows an English document in a list, and the two can
be re-seeded independently.

It lives in its own database, **`ragen_demo`**, on the local Postgres
container. The script refuses to run against any other database, and any
host but localhost, because it deletes and rewrites whole organizations.

## Running it

Once, to create the database and its schema:

```bash
docker exec ragen-app-postgres-1 psql -U postgres -c 'CREATE DATABASE ragen_demo'
DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_demo npx prisma migrate deploy
```

Then, as often as you like:

```bash
export DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_demo
npm run demo:seed                    # both locales
npm run demo:seed -- --locale pl     # just Polish
npx tsx scripts/demo/seed-nordwind.ts --locale en
```

**It is idempotent.** Each run deletes that locale's organization and users
first, in foreign-key order: Brain pages and decisions go before files, as in
the e2e seed. Then it writes everything again. Ids are derived from stable
keys, so a thread, a Brain page or a document keeps **the same URL across
re-seeds**. Timestamps are relative to the moment you run it, so "3 days ago"
stays 3 days ago. Seeding one locale takes about 6 seconds.

## Logins

Every account's password is **`NordwindDemo2026!`**.

| Role | Polish org (`nordwind-pl`) | English org (`nordwind-en`) |
|---|---|---|
| Owner, CEO | `anna.kowalska@nordwind-logistics.example` | `anna.walker@nordwind-logistics.example` |
| Admin, COO | `tomasz.nowak@…` | `thomas.newman@…` |
| Admin, HR Director | `magdalena.wisniewska@…` | `megan.wilson@…` |
| Member, Sales | `piotr.zielinski@…` | `peter.hughes@…` |
| Member, Support lead | `katarzyna.lewandowska@…` | `kate.lewis@…` |
| Member, Compliance | `michal.wojcik@…` | `michael.wood@…` |
| Member, HR & payroll | `joanna.kaminska@…` | `joanna.king@…` |
| Member, Fleet safety | `pawel.dabrowski@…` | `paul.davies@…` |
| Former employee (no membership) | `robert.mazur@…` | `robert.mills@…` |
| **apps/admin platform admin** | `platform-admin@nordwind-logistics.example` | (shared) |

**Use Anna for screenshots.** Every showcase thread is hers, the connectors
page is populated for her, and as owner she can see Brain. Brain is shown
only to org owners and admins.

## Starting the apps against it

Real environment variables beat the root `.env.local`
(`scripts/load-root-env.mjs`), so overriding `DATABASE_URL` is enough.

```bash
export DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_demo

npm run api:dev        # apps/api on :3001. Needed: the sidebar's thread list
                       # and knowledge analytics come from apps/api.
npm run web:dev        # apps/web on :3000, or for production screenshots:
npm run web:build && npm run start --workspace=@ragenai/web

npm run admin:dev      # apps/admin on :3200
```

- **apps/admin under `next start`** needs `ADMIN_TRUSTED_ORIGINS=http://localhost:3200`.
  Otherwise sign-in fails with "Invalid origin". The workspace's own `dev` and `start`
  scripts already set it. It matters when you run `next start` by hand.
- **Knowledge analytics is cached in Redis for 5 minutes**, keyed by
  organization. After a re-seed, wait five minutes or flush the
  `knowledge-analytics:*` keys.
- Nothing here needs the worker, Qdrant or a model provider to render. They
  are needed only to ask a **new** question (see below).

## What it creates (per locale)

| Area | Rows |
|---|---|
| People | 8 members (1 owner, 2 admins, 5 members) + 1 former employee; 5 teams (a general team — Ogólny / General — plus HR, Sales, Support, Compliance); 1 pending invitation |
| Knowledge base | 6 folders (HR ▸ Payroll restricted to team HR; Sales, Support, Compliance, Operations); 15 documents: PDF, DOCX, XLSX, a web page URL and Markdown, all `COMPLETED` apart from one `STAGED`; 16 versions |
| Assistants | a default ("main") assistant — *Asystent główny* / *Main assistant*; the grid still lists it, see the note in the PR that renamed it — + HR, Sales, Support and Compliance assistants, each with instructions, team and user grants, and its primary folder's files |
| Showcase threads | 4 in the HR assistant (one with a follow-up turn) + 1 in Sales + 1 in Support, all Anna's, with retrievals, snippets and citations |
| Analytics history | 432 more threads over 30 days from the other members, with citations and 👍/👎 ratings; 5 of the 25 questions go unanswered |
| Brain | 47 pages (30 approved, 13 candidates, 3 stale, 1 rejected), 74 sources quoting their documents verbatim, 51 edges of all three origins in 6 communities plus 1 orphan, 6 findings, 43 decisions, 7 published pages |
| Usage & admin | ~1,970 `ai_usage` rows over 30 days across 6 models (≈ $9); limits; 1 guardrail of the organization's own with 3 blocks this week, plus the built-in jailbreak detector switched on for the organization (LOG) with 2 flags — the latter is what gives the admin panel's platform Guardrails list hits (an organization's own rule shows only under *One organization*); 15 audit-log entries; 7 security events; 2 API keys; 3 notifications; the `default_organization_limits` setting |
| Connectors | Anna: Slack, HubSpot, Google Calendar and Google Drive connected. Peter/Piotr: HubSpot. Kate/Katarzyna: Slack in error |

Deliberate states to photograph:

- **Contradiction.** The 2026 leave policy says 26 days; the 2023 HR FAQ says
  20. The same pair also disagrees on notice: 7 working days against 3 days.
  That gives two CONTRADICTION findings; the first is HIGH because the policy
  page is published.
- **Newer version available / stale.** The remote-work policy has two
  versions. The "Remote work" page cites version 1's "up to 2 days", which
  version 2 changed to 3. The page shows "newer version" and carries a STALE
  finding.
- **Owner left.** "Framework agreement" is owned by Robert, who is no longer
  a member.
- **Orphan.** "Whistleblowing channel" links to nothing.
- **Extraction failure.** On the payroll calendar (XLSX).
- **Staged.** The ADR dangerous-goods draft, awaiting curation in Brain's
  documents tab.
- **Two-level citation.** The first main thread ("How many days of leave…")
  cites the published "Annual leave" page. Its source card shows the page's
  own sources underneath.

## What is not seeded, and why

- **Published pages have no vectors.** Publication is faked the way the publish
  command leaves it: the vehicle file (`COMPLETED`), `publishedAt` and a PUBLISH
  decision. The worker's chunk write into Qdrant is skipped. Published pages
  render everywhere, but a new chat question cannot retrieve them. The same
  goes for every document: nothing is in Qdrant, so a new question finds
  nothing until the files are re-embedded.
- **No stored files.** Only database rows exist. Nothing is in S3 or local
  storage, so the original-file preview and download return nothing. Version
  text, diffs and the document view read from the database and work.
- **Connectors have no tokens.** "Connected" is decided by the row alone, so
  the page shows them as connected. The first tool call fails, because the
  token vault holds nothing for them.
- **API keys have no secret.** The rows exist for the list. The secret half
  lives in the token vault, so the keys cannot be used.
- **Threads are plaintext** (`encryptedDek` null), which is what a deployment
  without an encryption provider writes. With encryption on, they still read
  correctly. Running the bulk "encrypt existing threads" job afterwards
  encrypts the messages but not the snippets, and the source quotes disappear.

## Files

- `seed-nordwind.ts`: the script: teardown, then each area in turn.
- `nordwind/structure.ts`: roles, folders, which document sits where, each
  Brain page's type, status and owner, and the edges. It is language-free.
- `nordwind/content-pl.ts` and `content-en.ts`: every word, keyed to the
  structure.
- `nordwind/build.ts`: pure helpers: page rendering, quote checks, spans,
  and the findings the product's own rules would compute.
- `tests/scripts/demo-seed-nordwind.test.ts`: fails if an edit breaks a quote,
  a citation marker, or one of the deliberate states above.

## The documents as files

The seed stores each document's text in the database; no file exists. To put the
same corpus on an environment the seed will not touch — demo.ragen.ai — export it
as real files and upload them there, so that environment's own worker ingests them:

```bash
npm run demo:export-documents -- --locale pl --out ./nordwind-documents
```

Without `--locale` it writes both. Per locale you get:

- one folder per knowledge-base folder, with "Płace" / "Payroll" inside "HR" as
  in the seed;
- `_brain-only/`: the files the seed stages in Brain. Upload these through
  Brain → Documents → **Upload into Brain**;
- `_older-versions/`: earlier versions. Upload the `__v1` file first, then the
  active one as a new version, to show a diff;
- `MANIFEST.md`: which file goes where, and its owner.

PDFs are printed by headless Chromium (Playwright); DOCX and XLSX use the same
`docx` and `xlsx` packages the worker reads them with. A web-page document is
written as Markdown, because its address is on a domain that does not exist.
