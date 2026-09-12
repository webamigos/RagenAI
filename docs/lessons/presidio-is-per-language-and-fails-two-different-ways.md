---
title: 'Presidio is per-language, and a wrong language corrupts text rather than erroring'
modules: ['worker']
areas: ['architecture']
topics: ['presidio', 'pii', 'ingest', 'language-detection', 'silent-corruption']
---

# Presidio is per-language, and a wrong language corrupts text rather than erroring

**Context**: `maskPii` sends document text to the Presidio analyzer and
replaces whatever it reports. `apps/worker/src/activities/documents/mask-pii.ts`
hardcoded `language: 'pl'` on every call, with no language detection, even
though `detectDocumentLanguage` already existed and ran later in the same
workflow.

**Problem**: the Polish NER model scores ordinary English words as `PERSON` at
**0.85**, far above the analyzer's `0.35` threshold, and the anonymizer then
replaces them. Eight documents containing no personal data at all came out of
ingest with 23 masked spans:

```
source : Flammable materials, gas cylinders over 4 litres, … are excluded from carriage.
stored : <PERSON> materials, gas cylinders over 4 litres, … are excluded <PERSON>.
```

Masking runs *before* embedding, so the damage lands in the vector store and
only a re-index undoes it. Nothing errors, nothing warns — the analyzer is
doing exactly what it was asked.

**Two different "unsupported" behaviours**, which is what makes this easy to
get wrong in the fix as well:

- an **entity** the requested language has no recognizer for is **silently
  ignored** — `/analyze` with `language=en` and a list containing `PL_PESEL`
  returns HTTP 200 and simply no `PL_*` matches, so the entity list needs no
  per-language branching;
- a **language** the analyzer has no model for is **HTTP 500** (`No matching
  recognizers were found to serve the request.`), which Temporal retries and
  then fails the ingest on — so a detected language must be checked against
  the configured set before being sent.

The configured set lives in `infra/presidio/analyzer/conf/analyzer.yaml`
(`en`, `pl`), and `tests/architecture/presidio-languages-match-the-analyzer-config.test.ts`
keeps the worker's copy of it honest.

**Rule**: any per-language service gets the document's detected language, never
a constant. Where the language is unknown or unsupported, fall back to
something that degrades rather than corrupts — and write down what the fallback
costs. Here, `PL_PESEL`, `PL_NIP`, `PL_REGON`, `PL_ID_CARD`, `PL_IBAN` and
`PL_PHONE` are registered **only** under `pl`, so falling back to `en` leaves
Polish identifiers unmasked. That is a visible gap; defaulting to `pl` silently
rewrites every non-Polish document. Prefer the gap, and log it per document.

**Applies to**: `mask-pii.ts` and the Presidio sidecars; more generally any
ingest step that transforms content in place before embedding. A mock cannot
catch this class of bug — it takes the real model to produce the false
positives, which is why the regression test lives in
`apps/worker/test/presidio-integration/`.
