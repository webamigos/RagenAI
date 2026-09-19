# Demo corpus

Twelve documents — four PDF, four XLSX, four DOCX — for the showcase tenant
described in [`docs/specs/2026-09-06-demo-environment.md`](../../docs/specs/2026-09-06-demo-environment.md).
They are what a prospect is meant to be shown. `seed-demo-organization.ts`
used to carry three short markdown files inline; it reads this directory
instead, so replacing the corpus means adding files here rather than editing a
script that is neither typechecked nor runnable outside a full app
environment.

Upload them and the demo has something to answer questions about: a price list
with thresholds, a contract with penalties, an SLA with response times, minutes
with resolutions, and spreadsheets whose totals match the report that quotes
them.

## Why these twelve and not a folder of PDFs

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
  `verify.py` checks this.
- **Nothing here would embarrass us in a transcript.** The demo is one shared
  account, so visitor B reads visitor A's conversation until the nightly
  cleanup runs (the spec's "Consequences we are accepting"). Every name,
  number and company in this corpus is invented. Acme Industries sp. z o.o. is
  the same fictional company as in `scripts/test-env/sample-docs`, extended.

## The files

| File                            | Format         | What it holds                                                             |
| ------------------------------- | -------------- | ------------------------------------------------------------------------- |
| `katalog-produktow-2026.pdf`    | PDF, 4 pp.     | 11 products with technical parameters, prices, warranty and lead times    |
| `umowa-serwisowa-sla.pdf`       | PDF, 2 pp.     | P1/P2/P3 response times, penalties, service fee, periodic inspections     |
| `raport-roczny-2025.pdf`        | PDF, 2 pp.     | revenue, EBITDA, headcount, segments, export, 2026 outlook                |
| `employee-handbook-2026.pdf`    | PDF, 2 pp.     | **English** — working time, remote work, leave, benefits, expenses        |
| `cennik-2026.xlsx`              | XLSX, 4 sheets | prices by product line, discount thresholds, commercial terms             |
| `sprzedaz-2025.xlsx`            | XLSX, 4 sheets | 2025 sales by month, by region and quarter, largest customers             |
| `stany-magazynowe-2026-03.xlsx` | XLSX, 3 sheets | stock per warehouse, items below minimum, open purchase orders            |
| `budzet-marketingowy-2026.xlsx` | XLSX, 3 sheets | 2026 budget by channel and quarter, 2025 actuals, spending rules          |
| `umowa-ramowa-dostawy.docx`     | DOCX           | framework supply agreement — orders, prices, delivery, payment, penalties |
| `procedura-reklamacyjna.docx`   | DOCX           | complaints: deadlines, stages, what is not covered                        |
| `protokol-zarzadu-2026-02.docx` | DOCX           | board minutes — five resolutions, action items with owners and dates      |
| `faq-dzial-handlowy.docx`       | DOCX           | 12 sales questions answered, each naming its source document              |

Total under 400 KB. PDFs are deliberately short: the worker sends a PDF to a
model as base64 (`PDF_PROCESSOR`), so pages cost money on every re-ingest.

## Uploading them

**The demo tenant refuses uploads.** `manageDocuments: false` is one of its
feature overrides, `uploadFileCommand` asserts it on every path into the
knowledge base, and the gate exempts nobody — not the UI, not the API, not this
seed. That is the point of it.

**On a tenant that is not yet restricted** — the normal case, the first time —
just run the seed. It ingests the corpus first and applies the restrictions
last, in that order for exactly this reason:

```bash
cd apps/web
TARGET_ENV=demo DEMO_ORGANIZATION_SLUG=<slug> \
  npx tsx --env-file=../../.env.local src/scripts/seed-demo-organization.ts
```

It is idempotent — a document already present by file name is skipped — so
re-running it after adding a file here uploads only the new one.

**On a tenant that is already restricted**, the flag has to come off for the
length of the run, whichever route you take:

1. Admin panel → the organization → **Features** → `manageDocuments` → on.
2. Upload: `--corpus-only` re-runs the ingest half of the seed alone, or use
   the documents page by drag and drop.
3. Put the flag back. The worker's nightly `cleanupDemoThreads` re-applies the
   overrides at 03:00 Europe/Warsaw anyway, so one left on is corrected within
   a night — but that is a backstop, not the procedure.

Setting the flag through the admin panel rather than in the database is worth
the extra clicks: `saveOrgFeatureOverridesAction` writes an audit entry and a
`ADMIN_SETTINGS_CHANGED` security event, so "who opened the demo tenant, and
when" has an answer.

Through the public API instead — note `apps/api` holds its own ported copy of
the gate (ADR-21), reading the same override, so the flag has to be off for
this too:

```bash
export RAGEN_API_KEY=sk-...
for f in scripts/demo-corpus/files/*; do
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
document, so a wrong answer is visible rather than arguable.

**One document, one fact**

1. Jaki jest czas reakcji na zgłoszenie krytyczne P1? _(4 godziny, 24/7 — SLA)_
2. Ile wynosi kara za przekroczenie czasu reakcji P1? _(200 zł za każdą rozpoczętą godzinę, max 10% rocznej opłaty — SLA)_
3. Ile dni ma klient na zgłoszenie wady ukrytej? _(14 dni od wykrycia, w okresie gwarancji — procedura reklamacyjna)_
4. Jaka jest nośność półki regału Magnus 350? _(3 500 kg — katalog)_
5. Ile wyniósł przychód w 2025 roku i o ile wzrósł? _(48,6 mln zł, +15,4% — raport roczny)_

**Two documents, one answer**

6. Klient zamawia 60 regałów RGM-200 — jaki rabat i jaka cena końcowa? _(12% od 1 480 zł — cennik + umowa ramowa)_
7. Czy możemy obiecać dostawę wózka WZE-20 w dwa tygodnie? _(nie: 35 dni, stan poniżej minimum — cennik + stany magazynowe + protokół zarządu)_
8. Ile wynosi budżet marketingowy na 2026 i kto go zatwierdził? _(1 240 000 zł, uchwała 1/2026 — protokół + arkusz budżetu)_
9. Kiedy rusza magazyn w Gdańsku i ile osób trzeba do niego zrekrutować? _(1 czerwca 2026, 12 osób — protokół zarządu)_
10. Co się stanie z gwarancją, jeśli klient nie zrobi przeglądu regałów? _(utrata gwarancji — umowa ramowa + SLA + procedura reklamacyjna)_

**Tables and arithmetic**

11. Który region miał najwyższą sprzedaż w 2025 roku? _(Północ — sprzedaż 2025)_
12. Które produkty są poniżej stanu minimalnego i kiedy przyjdzie uzupełnienie? _(WZE-20 i AKS-025 — stany magazynowe)_
13. O ile budżet marketingowy na 2026 jest wyższy od wykonania 2025? _(1 240 000 wobec 965 100 zł — arkusz budżetu)_
14. Ile wynosi udział segmentu Serwis w przychodzie? _(2,4 mln zł z 48,6 mln — raport roczny + sprzedaż 2025)_

**Across languages**

15. Ile dni pracy zdalnej miesięcznie przysługuje pracownikowi? _(12 — pytanie po polsku, odpowiedź z angielskiego handbooka)_
16. Jaki jest roczny budżet szkoleniowy na pracownika? _(4 000 zł — handbook, potwierdzone uchwałą 5/2026 w protokole)_

**What it should refuse to answer**

17. Ile wynosi marża na regale RGM-200? _(nie ma tego w żadnym dokumencie — dobra odpowiedź to przyznanie, że nie wiadomo)_
18. Kto jest właścicielem spółki? _(również nie ma — ten sam test)_

Questions 17 and 18 are worth asking in front of a prospect on purpose: a RAG
demo that never says "I don't know" has not shown the thing that makes it
trustworthy.

## Regenerating

The files are committed so that running a demo needs no Python. Editing them
means editing the generator, not the binaries:

```bash
pip install openpyxl python-docx reportlab pdfminer.six
python3 scripts/demo-corpus/generate.py   # rebuild files/
python3 scripts/demo-corpus/verify.py     # extract text, assert the facts agree
```

| Module                                           | Holds                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- |
| `data.py`                                        | every fact — company, products, prices, SLA levels, resolutions |
| `build_numbers.py`                               | the arithmetic, with totals forced to match the report          |
| `docx_kit.py`, `pdf_kit.py`                      | the same drawing calls for Word and for PDF                     |
| `build_docx.py`, `build_xlsx.py`, `build_pdf.py` | the documents themselves                                        |
| `verify.py`                                      | text extracts, diacritics survive, documents do not contradict  |

Two constraints the generators are written around, both learned the hard way:

- **No formulas in the spreadsheets.** The worker reads XLSX through SheetJS,
  which returns a formula cell's _cached_ value, and openpyxl writes no cache.
  A `=SUM(...)` would reach the index as an empty cell and every question about
  a total would be unanswerable. Totals are computed in Python and written as
  numbers.
- **The PDFs embed Liberation Sans.** reportlab's built-in Helvetica is
  WinAnsi-encoded and silently drops every Polish diacritic. `verify.py` checks
  the extracted text, because a corpus that indexes as `regaów` instead of
  `regałów` fails quietly — the answers just get worse.

`scripts/test-env/sample-docs` is a different thing and should stay separate:
five markdown files sized for the offline test environment, whose stub
embeddings are lexical, not semantic. The English handbook here deliberately
states the same HR rules those Polish files do — remote days, the allowance,
leave, travel limits — so uploading both gives a working cross-language demo
rather than a contradiction. `verify.py` checks that too.
