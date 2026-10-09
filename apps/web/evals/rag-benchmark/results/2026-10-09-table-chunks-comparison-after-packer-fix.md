# Table chunks, re-measured after the packer fix (C3)

`FEATURE_FLAG_TABLE_CHUNKS` off against on, three runs each, on two corpora,
the same method as [the 2026-09-12 comparison](./2026-09-12-table-chunks-comparison.md).
Each arm re-ingested its corpus with the worker configured that way; nothing
else in the stack moved. Run on the night of 2026-10-08/09 against `8ea12ae5d`
(`main`), on a scratch database.

The 2026-09-12 numbers were taken at `d975ba4f8`, before review fixed two
packer defects that left table chunks at roughly half their budget (spec C3).
This run measures the packer as it is on `main`.

## The number

| Corpus | Flag off | Flag on | Median |
| --- | --- | --- | --- |
| `tabele-bilingual-v1` rev2 (tables longer than a chunk) | 15, 13 (+1 ungraded), 15 | 16, 15 (+1 ungraded), 17 | **15 → 16 of 18** |
| `kolej-bilingual-v1` rev3 (general) | 24, 23, 24 | 24, 23 (+1 ungraded), 23 | **24 → 23 of 24** |

The control arm (same model, no documents) scored **0/18** and **0/24**, so
both RAG columns are retrieval.

Runs: [tabele off](./2026-10-08-tabele-bilingual-v1-rev2-docling.md) ·
[2](./2026-10-08-tabele-bilingual-v1-rev2-docling-run2.md) ·
[3](./2026-10-08-tabele-bilingual-v1-rev2-docling-run3.md);
[tabele on](./2026-10-08-tabele-bilingual-v1-rev2-docling-table-chunks.md) ·
[2](./2026-10-08-tabele-bilingual-v1-rev2-docling-table-chunks-run2.md) ·
[3](./2026-10-08-tabele-bilingual-v1-rev2-docling-table-chunks-run3.md);
[kolej off](./2026-10-08-kolej-bilingual-v1-rev3-docling.md) ·
[2](./2026-10-08-kolej-bilingual-v1-rev3-docling-run2.md) ·
[3](./2026-10-08-kolej-bilingual-v1-rev3-docling-run3.md);
[kolej on](./2026-10-08-kolej-bilingual-v1-rev3-docling-table-chunks.md) ·
[2](./2026-10-08-kolej-bilingual-v1-rev3-docling-table-chunks-run2.md) ·
[3](./2026-10-08-kolej-bilingual-v1-rev3-docling-table-chunks-run3.md).
(The harness dates a file in UTC, hence `2026-10-08`.)

## Not comparable with 2026-09-12

Both corpora were revised since the first comparison, so the off column is
not the 10/18 and 20/24 baseline the spec quotes:

- `tabele` rev2 (#1459): the cap rubrics accept the unit either way. Most
  of what rev1 failed on its own wording now passes with the flag off.
- `kolej` rev3 (#1525): an answer that names the sibling document's figure
  as the sibling's is no longer failed. This is the grading artefact the
  first comparison described for `xl-en2pl-refund-pct`.

Same stack otherwise: `gemini-3-flash-preview`, judge `gemini-2.5-flash`,
reranking on (`scaleway` / `qwen3-embedding-8b`), Docling parser.

## The activation rate

| Arm | Ingests | Excised (`applied`) | No tables | Refused |
| --- | --- | --- | --- | --- |
| off | 39 | — | 39 (not attempted) | 0 |
| on | 39 | 21 (15 `tabele`, 6 `kolej`) | 18 | 0 |

Every document with a table had it excised in every run (5 of 5 in `tabele`,
2 of 8 in `kolej`). There were no refusals. This matches 2026-09-12.

## Which cases moved

`tabele`, off → on, per run:

| Case | Off | On |
| --- | --- | --- |
| `pl-ask-en-roughness` | `...` | `PPP` |
| `pl-roughness-and-callout` | `..P` | `PPP` |
| `pl-ask-en-microscope-cap` | `P.P` | `PPP` |
| `en-cap-extensometer` | `PPP` | `P.P` |
| `en-extensometer-cap-and-period` | `PP.` | `.PP` |

Two cases move consistently, and both are the failure the corpus was built
for: a value in a row far from its header. `pl-ask-en-roughness` fails in
all three runs without the flag and passes in all three with it. The other
three cases flicker in both directions, which is ordinary judge and reranker
noise.

`kolej`: two cases differ.

- `xl-en2pl-baggage-liability` went `P.P` → `PPP`. This is not retrieval.
  The flag-off run-2 answer was correct (`1,480 zł`). The judge failed it
  only because the rubric writes the figure as `1 480 zł`, and run 3
  accepted the same answer. The run files are left as the harness wrote
  them. Corrected for that one grading error, `kolej` flag off is
  24, 24, 24.
- `en-mono-baggage-weight` went `PPP` → `PP.`. Once, the answer gave a
  24 kg total allowance instead of 18 kg. That is a real wrong answer, but
  one in three, not a pattern.

So `kolej` is 24 → 23 of 24 on the median either way. Per the harness
README, a one-case delta is noise.

## Reading it

- **The mechanism still works.** Excision ran on every table, refused
  nothing, and the two cases that need a far-from-header row now pass
  reliably.
- **The margin is smaller than first recorded.** The median gain is +1 on
  `tabele`, not +3. That is below the harness's three-case noise rule. The
  ranges barely overlap (off 13–15, on 15–17), which is better than a bare
  median says but weaker than 2026-09-12's disjoint ranges. Most of the
  difference is the rev2 rubric, which raised the baseline. It is not the
  packer fix lowering the flag-on result: that result went from 13/18 to
  16/18.
- **No cost on ordinary documents**, within noise: 24 → 23 of 24 on
  `kolej`. One flag-on answer was wrong once, and the only other difference
  was a grading error on the flag-off side.
- **The spec's threshold no longer applies.** "≥13/18 on `tabele`" was set
  against the rev1 baseline. Under rev2 the flag-off arm already clears it.
  Read the result as on versus off from the same night.

## For C2

The recommendation is still **default on, with a re-index**, but on weaker
evidence than 2026-09-12. The benefit is concentrated in the cases tables
exist for, and the risk measured on ordinary documents is nil. A stricter
reading is that a +1 median does not justify a migration. The deciding
question is how much a reliable answer on far-from-header rows is worth,
not this number. C2 is the owner's call and is not made here.
