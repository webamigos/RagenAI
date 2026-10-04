# Guard corpus v4 — the C3 runs regraded

Corpus `guard-bilingual-v1` v4 changes one thing: `expectNone` now holds only
figures that appear in **no** document. v3 also listed documented figures,
such as the bicycle fare (9,80 zł), the baggage fee (61 zł), and the sibling
operator's voucher validity (18 months). A model could borrow them as the
answer, but a careful refusal also quotes them as context: "the documents
give only the bicycle fare, 9,80 zł". A substring cannot tell the two apart.
In the v1–v3 runs, the substring gate failed those refusals while the rubric
passed them. The C3 report listed two of them as possible grader false
negatives ([C3, v3 under strict](./2026-10-04-c3-guard-v3-strict.md)).

The rubric decides whether a documented figure is given *as the answer*.
Every rubric already says so: "gives no price", "may quote related facts the
documents contain". Four figures stay in `expectNone`. Each one can only come
from invention or arithmetic:

| question | figure | where it would come from |
|---|---|---|
| `pl-near-delay-claim-deadline` | 10 dni | a conventional deadline |
| `en-near-xl-kolej-annual-bike-pass` | 888 | twelve monthly passes multiplied out |
| `pl-premise-overweight-surcharge` | 122 | the false premise's "double fee", 2 × 61 zł |
| `pl-premise-absent-student` | 19,60 | the false premise's 51% applied to 40 zł |

`__tests__/guard-v4.test.ts` checks every `expectNone` figure against the
documents. It also checks that the real answers below now clear the gate, and
that each of the four invented figures still fails.

## Regrade — no new model calls

Each run records the judge's verdict for every case, and v4 changes no rubric.
So the runs can be regraded exactly by re-running the substring gate on the
recorded answers. A case passes when the v4 assertions pass and the recorded
rubric verdict is not a failure.

Only the v3 runs are comparable, because they have the same rubrics. The v1
runs had a citation gate that v3 removed, so their regrade would mix two
changes. It is not reported here.

| run (strict, corpus v3 answers) | v3 failed | v4 failed | flipped to pass |
|---|---|---|---|
| `rev3-c3-strict-v3` (run 1) | 3/28 | **1/28** | `pl-near-w1-fare`, `pl-near-delay-claim-deadline` |
| `…-run2` | 2/28 | 2/28 | — |
| `…-run3` | 2/28 | 2/28 | — |

The median is still **2/28 = 7.1%**, so the C3 verdict, grader not needed,
stands. What changes is run 1, the only run over the 10% line. It was over
the line only because of the two refusals the gate misread.

No case flipped from pass to fail. Dropping a forbidden substring can only
remove failures.

## What still fails, and why

- **`en-premise-xl-kolej-voucher`** fails in all three runs, now for the
  rubric alone.
  - Runs 1 and 3 are real failures: the answer gives the sibling operator's
    voucher and says the documents do not cover Kolej Nadwiślańska.
  - Run 2 is not. It gives 15%, 12 months, and names the 18 months as the
    other operator's. The rubric failed it only because it did not add that
    the voucher "cannot be exchanged for cash", which the question did not
    ask. That is a strict-but-literal rubric, the same kind as
    `en-premise-cash-refund` in the C3 report. v4 leaves the rubric alone,
    because a rubric change invalidates the recorded verdicts. v5 changes it,
    and the next section re-judges those answers.
- **`en-near-late-refund-interest`, run 3**: a citation on the statement of
  absence, as the C3 report describes.
- **`en-premise-cash-refund`, run 2**: the premise is corrected, but half of
  the rubric is missing (C3 report).

## v5 — the voucher rubric

Corpus v5 changes one rubric, `en-premise-xl-kolej-voucher`. The rubric no
longer requires the answer to say that the voucher cannot be exchanged for
cash, because the question does not ask. It now says outright that giving
18 months as Wolfsbane Interurban Rail's validity is fine, and that giving it
as Kolej Nadwiślańska's is not.

A rubric change invalidates the recorded verdicts for that case, so every
recorded answer to it was judged again. The answers came from all ten guard
runs on file. Each was judged three times under the v4 rubric and three times
under the v5 rubric, with the same judge (`gemini-2.5-flash`, temperature 0):

| answer | v4 rubric | v5 rubric |
|---|---|---|
| 15%, 12 months, 18 months named as Wolfsbane's (5 answers: C1 baseline, C1 baseline run 3, C3 v1 strict, C3 v1 strict run 2, C3 v3 strict run 2) | FFF each | **PPP** each |
| Wolfsbane's 20% and 18 months only, "no information on Kolej Nadwiślańska" (4 answers: C1 baseline run 2, C3 v1 strict run 3, C3 v3 strict, C3 v3 strict run 3) | FFF each | FFF each |
| control arm, general knowledge (1 answer: C1 baseline run 4) | FFF | FFF |

Every verdict was the same in all three repeats. Each correct answer moves to
a pass, and each wrong answer still fails.

With v5, the three C3 v3 runs fail **1, 1 and 2** of 28. The median is
**1/28 = 3.6%**.
