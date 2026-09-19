# Demo corpus

Twelve documents about one fictional company, **in Polish and in English** —
four PDF, four XLSX, four DOCX in each language — for the showcase tenant
described in [`docs/specs/2026-09-06-demo-environment.md`](../../docs/specs/2026-09-06-demo-environment.md).

They are what a prospect is meant to be shown. `seed-demo-organization.ts`
used to carry three short markdown files inline; it reads this directory
instead, so replacing the corpus means adding files here rather than editing a
script that is neither typechecked nor runnable outside a full app
environment.

```
files/pl/   katalog-produktow-2026.pdf, cennik-2026.xlsx, …
files/en/   product-catalogue-2026.pdf, price-list-2026.xlsx, …
```

## Why these twelve, twice

- **They are the file types a prospect brings.** PDF, Excel and Word, not
  markdown. The formats also exercise three different ingest paths — Claude
  native PDF, SheetJS, mammoth (see
  [`docs/document-processing.md`](../../docs/document-processing.md)) — so a
  demo that works proves more than a demo over plain text.
- **They agree with each other.** The discount in the price list is the
  discount in the framework agreement; the marketing budget in the minutes is
  the total of the budget spreadsheet; the sales figures add up to the revenue
  the annual report quotes. Cross-document questions are the ones that land,
  and they only land if the documents do not contradict each other.
- **The two languages quote the same figures.** `PLN 1,480.00` against
  `1 480,00 zł` — same digits, each locale's own formatting. So the two sets
  can be uploaded into one knowledge base for a bilingual demo without ever
  answering the same question two ways, or into two tenants for a Polish and
  an English prospect. Both are supported on purpose; neither is a compromise.
- **Nothing here would embarrass us in a transcript.** The demo is one shared
  account, so visitor B reads visitor A's conversation until the nightly
  cleanup runs (the spec's "Consequences we are accepting"). Every name,
  number and company in this corpus is invented. Acme Industries sp. z o.o. is
  the same fictional company as in `scripts/test-env/sample-docs`, extended.

[`tests/architecture/demo-corpus-agrees-with-itself.test.ts`](../../tests/architecture/demo-corpus-agrees-with-itself.test.ts)
checks all of it in CI, and reads the spreadsheets the way the ingest reads
them rather than as raw cell values — see "Two constraints" below for why that
distinction caught a real defect.

## The files

| Polish                           | English                           | Format | What it holds                                                          |
| -------------------------------- | --------------------------------- | ------ | ---------------------------------------------------------------------- |
| `katalog-produktow-2026.pdf`     | `product-catalogue-2026.pdf`      | PDF    | 11 products with technical parameters, prices, warranty and lead times |
| `umowa-serwisowa-sla.pdf`        | `service-agreement-sla.pdf`       | PDF    | P1/P2/P3 response times, penalties, service fee, periodic inspections  |
| `raport-roczny-2025.pdf`         | `annual-report-2025.pdf`          | PDF    | revenue, EBITDA, headcount, segments, export, 2026 outlook             |
| `regulamin-pracowniczy-2026.pdf` | `employee-handbook-2026.pdf`      | PDF    | working time, remote work, leave, benefits, expenses, conduct          |
| `cennik-2026.xlsx`               | `price-list-2026.xlsx`            | XLSX   | prices by product line, discount bands, commercial terms               |
| `sprzedaz-2025.xlsx`             | `sales-2025.xlsx`                 | XLSX   | 2025 sales by month, by region and quarter, largest customers          |
| `stany-magazynowe-2026-03.xlsx`  | `stock-report-2026-03.xlsx`       | XLSX   | stock per warehouse, items below minimum, open purchase orders         |
| `budzet-marketingowy-2026.xlsx`  | `marketing-budget-2026.xlsx`      | XLSX   | 2026 budget by channel and quarter, 2025 actuals, spending rules       |
| `umowa-ramowa-dostawy.docx`      | `framework-supply-agreement.docx` | DOCX   | orders, prices, delivery, payment, penalties, warranty                 |
| `procedura-reklamacyjna.docx`    | `complaints-procedure.docx`       | DOCX   | complaints: deadlines, stages, what is not covered                     |
| `protokol-zarzadu-2026-02.docx`  | `board-minutes-2026-02.docx`      | DOCX   | five resolutions, action items with owners and dates                   |
| `faq-dzial-handlowy.docx`        | `sales-faq.docx`                  | DOCX   | 12 sales questions answered, each naming its source document           |

Roughly 350 KB per language. PDFs are deliberately short: the worker sends a
PDF to a model as base64 (`PDF_PROCESSOR`), so pages cost money on every
re-ingest.

## Uploading them

**The demo tenant refuses uploads.** `manageDocuments: false` is one of its
feature overrides, `uploadFileCommand` asserts it on every path into the
knowledge base, and the gate exempts nobody — not the UI, not the API, not this
seed. That is the point of it.

**On a tenant that is not yet restricted** — the normal case, the first time —
just run the seed. It ingests the corpus first and applies the restrictions
last, in that order for exactly this reason:

```bash
TARGET_ENV=demo DEMO_ORGANIZATION_SLUG=<slug> npm run web:seed:demo

# the English set instead, or as well:
DEMO_CORPUS_DIR=scripts/demo-corpus/files/en \
  TARGET_ENV=demo DEMO_ORGANIZATION_SLUG=<slug> npm run web:seed:demo -- --corpus-only
```

Run it through the npm script, not `npx tsx` directly. The script's import
chain reaches `feature-guards.ts`, which is marked `server-only` — a package
whose default entry point throws on purpose, and which only Next's bundler
resolves to the empty module. `--conditions=react-server`, which the npm script
passes, is what makes plain Node resolve it the same way.

It is idempotent — a document already present by file name is skipped — so
re-running it after adding a file here uploads only the new one. That is also
what makes uploading both languages safe: the second run adds the English
documents and leaves the Polish ones alone.

**On a tenant that is already restricted**, the flag has to come off for the
length of the run, whichever route you take:

1. Admin panel → the organization → **Features** → the row **"Add and remove
   documents"** (`manageDocuments`) → **Force on** → **Save overrides**.
2. Upload: `npm run web:seed:demo -- --corpus-only`, or the documents page by
   drag and drop.
3. Put it back: the same row → **Force off**. The worker's nightly
   `cleanupDemoThreads` re-applies the overrides at 03:00 Europe/Warsaw anyway,
   so one left on is corrected within a night — but that is a backstop, not the
   procedure.

Setting the flag through the admin panel rather than in the database is worth
the extra clicks: `saveOrgFeatureOverridesAction` writes an audit entry and an
`ADMIN_SETTINGS_CHANGED` security event, so "who opened the demo tenant, and
when" has an answer. The form is seeded from the overrides already stored, so
saving it does not disturb the other five.

Through the public API instead — note `apps/api` holds its own ported copy of
the gate (ADR-21), reading the same override, so the flag has to be off for
this too:

```bash
export RAGEN_API_KEY=sk-...
for f in scripts/demo-corpus/files/pl/*.{pdf,xlsx,docx}; do
  case "$f" in
    *.pdf)  type=application/pdf ;;
    *.xlsx) type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet ;;
    *.docx) type=application/vnd.openxmlformats-officedocument.wordprocessingml.document ;;
  esac
  curl -sS -X POST "$API_BASE/v1/files" \
    -H "Authorization: Bearer $RAGEN_API_KEY" \
    -F "file=@$f;type=$type" -o /dev/null
  echo "uploaded $(basename "$f")"
done
```

Ingest is asynchronous. Check the documents page before demoing — a PDF that
is still parsing answers nothing, and that is a bad first impression to make
in front of a prospect.

## Demo questions that work

Grouped by what they prove. Each one has a specific answer in a named
document, so a wrong answer is visible rather than arguable. Ask them in
either language: the figures are the same, so the Polish and English questions
have the same answers.

**One document, one fact**

| Polish                                             | English                                                  | Answer, and where from                                             |
| -------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| Jaki jest czas reakcji na zgłoszenie krytyczne P1? | What is the response time for a P1 ticket?               | 4 hours, 24/7 — SLA                                                |
| Ile wynosi kara za przekroczenie czasu reakcji P1? | What are the damages for missing the P1 response time?   | PLN 200 per hour started, capped at 10% of the annual fee — SLA    |
| Ile dni ma klient na zgłoszenie wady ukrytej?      | How long does a customer have to report a latent defect? | 14 days from discovery, within the warranty — complaints procedure |
| Jaka jest nośność półki regału Magnus 350?         | What is the shelf load capacity of the Magnus 350?       | 3 500 kg — catalogue                                               |
| Ile wyniósł przychód w 2025 roku i o ile wzrósł?   | What was 2025 revenue, and by how much did it grow?      | PLN 48.6 m, +15.4% — annual report                                 |

**Two documents, one answer**

| Polish                                                               | English                                                            | Answer, and where from                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Klient zamawia 60 regałów RGM-200 — jaki rabat i jaka cena końcowa?  | A customer orders 60 RGM-200 — what discount and what price?       | 12% off PLN 1,480 — price list + framework agreement                                  |
| Czy możemy obiecać dostawę wózka WZE-20 w dwa tygodnie?              | Can we promise a WZE-20 in two weeks?                              | No: 35 working days, and stock is below minimum — price list + stock report + minutes |
| Ile wynosi budżet marketingowy na 2026 i kto go zatwierdził?         | What is the 2026 marketing budget, and who approved it?            | PLN 1,240,000, resolution 1/2026 — minutes + budget sheet                             |
| Co się stanie z gwarancją, jeśli klient nie zrobi przeglądu regałów? | What happens to the warranty if the racking inspection is skipped? | It is void — framework agreement + SLA + complaints procedure                         |

**Tables and arithmetic**

| Polish                                                                      | English                                                    | Answer                                       |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Który region miał najwyższą sprzedaż w 2025?                                | Which region sold the most in 2025?                        | North — sales 2025                           |
| Które produkty są poniżej stanu minimalnego i kiedy przyjdzie uzupełnienie? | Which products are below minimum, and when do they arrive? | WZE-20 and AKS-025 — stock report            |
| O ile budżet na 2026 jest wyższy od wykonania 2025?                         | How much higher is the 2026 budget than the 2025 actuals?  | PLN 1,240,000 against 965,100 — budget sheet |

**Across languages** (upload both sets into one knowledge base)

- Ask in Polish about a fact that only the English handbook states, and the
  other way round. Both answer, and both cite a document in the other
  language.
- `Ile dni pracy zdalnej miesięcznie przysługuje pracownikowi?` /
  `How many remote days a month does an employee get?` → 12, in either corpus.

**What it should refuse to answer**

- `Ile wynosi marża na regale RGM-200?` / `What is the margin on the RGM-200?`
- `Kto jest właścicielem spółki?` / `Who owns the company?`

Neither is in any document. Ask them in front of a prospect on purpose: a RAG
demo that never says "I don't know" has not shown the thing that makes it
trustworthy.

## Regenerating

The files are committed so that running a demo needs no build step. Editing
them means editing the generator, not the binaries:

```bash
npm run demo:corpus                              # both languages
node scripts/demo-corpus/generate.mjs --locale=en # one of them
npx vitest run tests/architecture/demo-corpus-agrees-with-itself.test.ts
```

Every dependency is one this monorepo already has: `docx` and `xlsx` from
`apps/worker`, and the Chromium that Playwright installs for the e2e suite
(`npx playwright install chromium`, or point `CHROMIUM_EXECUTABLE_PATH` at a
browser you already have).

| Module                                        | Holds                                                           |
| --------------------------------------------- | --------------------------------------------------------------- |
| `data.mjs`                                    | every fact, with both languages' labels on the same line        |
| `numbers.mjs`                                 | the arithmetic, with totals forced to match the report          |
| `format.mjs`                                  | locale formatting, built so both languages emit the same digits |
| `kit/pdf.mjs`, `kit/docx.mjs`, `kit/xlsx.mjs` | the same drawing calls per format                               |
| `documents/*.mjs`                             | one module per document, both languages side by side            |
| `generate.mjs`                                | the entry point, and the document list                          |

Two constraints the generators are written around, both learned the hard way:

- **No formulas in the spreadsheets.** The worker reads XLSX through SheetJS,
  which returns a formula cell's _cached_ value, and a writer that does not
  compute the formula writes no cache. A `=SUM(...)` would reach the index as
  an empty cell and every question about a total would be unanswerable. Totals
  are computed in `numbers.mjs` and written as numbers.
- **The group separator in a number format is `,`, always.** It is a
  placeholder Excel renders with the reader's own locale separator, so a Polish
  Excel still shows `27 300 000 zł`. Writing `# ##0` instead — which looks like
  the Polish convention, and is what the first version of this corpus used —
  makes SheetJS render seven-digit figures as `27300 000 zł`. Since SheetJS is
  what the ingest reads with, that mangled string is what lands in the index:
  invisible in Excel, wrong in every answer. The corpus test asserts the
  grouping through SheetJS for exactly this reason.

`scripts/test-env/sample-docs` is a different thing and should stay separate:
five markdown files sized for the offline test environment, whose stub
embeddings are lexical, not semantic. The handbook here deliberately states the
same HR rules those Polish files do — remote days, the allowance, leave, travel
limits — so uploading both gives a working cross-language demo rather than a
contradiction. The corpus test checks that too.
