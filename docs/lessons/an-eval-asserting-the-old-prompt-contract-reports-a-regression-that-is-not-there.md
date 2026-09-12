---
title: 'An eval asserting the old prompt contract reports a regression that is not there — check the metadata before believing the failure'
modules: ['web']
areas: ['testing', 'rag']
topics: ['evals', 'promptfoo', 'citations', 'prompt-contracts', 'false-red']
---

# An eval asserting the old prompt contract reports a regression that is not there — check the metadata before believing the failure

**Context**: the first run of all six promptfoo suites against the current stack
(2026-09-12, the ADR-20 measurement that had never been done) came back with
`citations` at **1/4**. Three of four cases failed. On a suite whose own
documentation says "a failure here is a wrong number on the Knowledge Analytics
screen", that reads as a shipped bug in citation attribution.

**Problem**: attribution was correct in all four cases. The suite was scoring a
prompt contract the product no longer has.

The cases asserted `icontains: 'Sample FAQ — support and availability'` — the
answer had to name the file in prose, because the answer prompt used to ask for
`According to 'file.md', …` and that sentence was the only record a citation
existed. The product then moved to numeric markers: the prompt asks the model to
cite by number, and `cited-sources.ts` parses `[n]` first, falling back to file
names only for answers that carry no markers. So the answers under test read
`…within one business day [1].` — correct, and containing no file name.

The evidence was already in the results file. `rag-chain.provider.ts` records
`metadata.retrievedFiles` and `metadata.citedFiles`, and `citedFiles` held
exactly one correct file for each of the three "failures" and an empty list for
the case where nothing should be cited. The failing assertion and the passing
metadata sat in the same JSON row.

Two things made this expensive rather than obvious. The suite had not been run
in months, so the failure arrived with no "it passed last week" to bound when it
broke. And the dataset's own comment explained the old contract convincingly
enough to read as current.

**Rule**: when an eval fails on a *surface* (prose, formatting, a phrase the
prompt asks for) rather than on a *fact*, check what the product persists before
believing the failure. Assert on the value that reaches the database —
`metadata.citedFiles` is what `assistant-stream.ts` writes as `DocumentCitation`
rows, so asserting on it is asserting on the number the dashboard shows;
asserting on the sentence the model happened to write is asserting on a prompt
that is free to change. An eval that fails when the prompt changes but the
behaviour does not will be ignored, and then it protects nothing.

Corollary: a suite that has not been run since the code it covers changed is not
a baseline. Re-run it before reading its output as a regression, and date the
run.

**Applies to**: `apps/web/evals/` — the promptfoo datasets in particular, and
any assertion written against text the answer prompt produces. The same shape
applies to `e2e-rag`'s `expectAll` strings and to `rag-benchmark`'s, which is
why both prefer invented figures (facts the product must retrieve) over phrasing
the prompt happens to request.
