---
title: A prompt rule the model follows most of the time is not a rule, and two repeats cannot tell you which it is
modules: [brain-core, worker]
areas: [rag, testing]
topics: [llm, prompt, structured-output, evals, adr-20, variance, tables, brain]
---

## Context

Ragen Brain's extraction (spec B) turns a document into candidate knowledge
pages. On a price list the model made **every table row its own entity** —
39 candidates, one claim each, joined by guessed edges. B's fix was a prompt
rule, "a TABLE is one entity and its rows are claims", measured on the 13
text fixtures × 2 repeats: the split was gone, and the spec recorded the gap
as closed.

## Problem

It was not closed. C4's eval, same fixtures × 2, saw the Polish price list
split again on one run of two. A dedicated probe, 4 runs each of the three
table documents, then found the Polish one clean 4/4 and the **English** one
split 2/4 — a document B's measurement had recorded as fine. The rule was
followed most of the time, on whichever document, and two repeats per
document are too few to tell "fixed" from "not failing this time".

The split also hid a second loss: a run that makes a page of every row
**stops part-way** — 39 claims where the good runs had 54 — so fifteen rows
of the price list never reached curation at all. No per-page metric showed
it; the page count looked like the whole problem.

## Solution

Enforce the rule after the answer, deterministically, where the text can
check it — the same move B made for short quotes:

- `consolidateTableRows` (`packages/brain-core/src/extraction/tables.ts`):
  an entity whose every verified claim sits inside one markdown table is a
  row, and two or more rows of one table fold into one page — the entity the
  heading names if the model made one, else a page titled by the heading and
  described by the prose sentence above the table, verbatim. An entity with
  a claim outside the table is the prompt's own exception and stays.
- A folded table's rows that no claim cites are added from the table: the
  row verbatim as the quote, its cells under the table's own column names
  as the statement.
- The eval counts `table rows cited / table rows`, which is the metric that
  would have shown the second loss.

On the probe's twelve saved answers, both split runs went from 39 pages and
39 claims to 4 pages and 54 — the good runs' shape — and the ten good runs
did not change.

## Takeaway

- **A prompt instruction is a probability, not a guarantee.** When the rule
  can be checked against the source — a quote occurs, a claim sits in a
  table — check it in code after the answer, and keep the prompt as the
  cheap first line.
- **Measure an intermittent failure on the document it fails on, with
  enough repeats.** Two repeats over a corpus average a 50 % failure on one
  document into noise. Re-run the specific case four or more times before
  writing "closed" (see also the citation-on-a-refusal case: 5/50 → 0/50).
- **Count what should be there, not only what came back.** A page count
  says nothing about rows that were never returned; coverage of the source
  does.
