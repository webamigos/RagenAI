---
title: A rubric sentence that permits something can be read by the judge as one that forbids its opposite
modules: [web]
areas: [testing, rag]
topics: [evals, benchmark, llm-judge, rubric, false-red, regrade, corpus-revision, adr-20]
---

## Context

`tabele-bilingual-v1` rev 1 graded `pl-cap-extensometer` with the rubric
"Podaje kwotę 21 629,67 … Sama liczba wystarczy — jednostka wynika z nagłówka
kolumny." The sentence was written to *allow* a bare number, because the table
gives the unit only in its header.

## Problem

The judge (`gemini-2.5-flash`) read "the number alone is enough" as "only the
number is allowed", and failed "21 629,67 zł" with the reason that the answer
contains a unit the rubric says is not needed. It did so on some runs and not
others: the same answer passed on A3's Scaleway runs and failed on two of the
three off-arm runs, so the error looked like a difference between arms. It
moved A3's off-arm median from 7 to 6 of 18, a D2 run from 10 to 9, and three
merged runs from 2026-09-26/27 carry it. CodeRabbit found it in a result
file; nothing in the harness could, because the assertion (`expectAll`) passed
and only the rubric failed.

## Rule

- When a rubric allows something, also say that the alternative is right:
  "with or without the unit". A judge reads one half of a permission as the
  whole of a constraint.
- A case whose assertions pass and whose rubric fails is the one to read by
  hand before quoting a number. That combination is where a judge error hides.
- Correcting a rubric is a new corpus revision (`corpus.json` `version`), as
  the harness README says: results from before and after measure different
  instruments. A regrade of an old run is done by hand, recorded in its
  `rubricReason`, and its report regenerated.

## Applies to

Every rubric in `apps/web/evals/rag-benchmark/corpora/*/questions.json`, and
any LLM-as-judge grader in this repository.
