# C3 — the guard corpus v3 under strict grounding

The measurement that closes Phase C3 of
[the retrieval-claims spec](../../../../../docs/specs/2026-10-03-retrieval-claims-match-the-product-before-launch.md).
The threshold was agreed before this run: **build the relevance grader only if
strict grounding leaves more than 10% of graded guard cases failing**. Under
the corpus v3 rubric, a citation marker on the statement of absence counts as
a failure. The LLM judge applies that rule.

The [previous C1/C3 summary](./2026-10-03-c1-c3-strict-grounding.md) ran
corpus v1. v1's deterministic citation gate failed correct near-miss answers.
v3 removes the gate and moves the citation rule into each rubric. This is
the first strict run on v3.

## What was run

- **Commit:** `253dde074` (`origin/main`), with corpus `guard-bilingual-v1`
  v3, `answerFromDocumentsOnly` (#1520) and `crossQueryFusion` (#1518).
- **Runs:** three, all `--arms rag --shape c3-strict-v3`. There was no
  control and no baseline arm.
  - `2026-10-04-guard-bilingual-v1-rev3-c3-strict-v3` (run 1)
  - `…-run2`
  - `…-run3`
- **Stack:**
  - chat model `gemini-3-flash-preview`, judge `gemini-2.5-flash`, rephrase
    `mistral-small-3.2`, embeddings `bge-multilingual-gemma2`;
  - one multi-query variant.
- **Flags:** the default install.
  - Reranking was off. The server ran with `FEATURE_FLAG_RERANKING=0`, and the
    organization's `reranking_enabled` was left NULL, as the seed leaves it.
    The report's "on for the organization" line reads NULL as on. It does not
    see the server's flag.
  - Every case's trace shows `postRetrieval: fusion`, `rerankMs: 0` and
    `crossQueryFusionEnabled: false`.
  - `contextualChunks` and `contextExpansion` were on (code defaults).
    `sectionSelection` and `crossQueryFusion` were off, with no
    `feature_overrides` for any of them.
  - The server reported `fusion + neighbours` on 26, 27 and 27 cases. The
    remaining cases reported `fusion` alone.
- **Docling** was down, so the Markdown went through the legacy loader.
- **Setup:**
  - a private database, `ragen_e2e_c3v3`, migrated with an explicit
    `DATABASE_URL` and seeded by `e2e/seed/e2e-seed.ts` with the
    `e2e/constants.ts` default credentials;
  - Redis db 9 and local storage under the session scratchpad;
  - apps/web as a production build on port 3420, and apps/worker, both from
    this worktree.
- **Clean ids:** the seeded project and thread were cloned under new ids
  (`c3f30000-…-c3001` / `…-c3010`), so the shared Qdrant collection's
  leftover chunks for the seeded id could not be retrieved.

### How strict was set and confirmed

- **Set by SQL** on the cloned project: `project_settings.answer_from_documents_only
  = true` and `projects.chatbot_enabled = false`, so the explicit column
  decides the rule.
- **Read back before each run.** All three runs show
  `chatbot_enabled=false answer_from_documents_only=true`.
- **Probed** with a separate probe thread in the same project, during run 1,
  after ingestion, while the corpus was indexed. Both questions were refused,
  named no city and carried no citation:
  - "What is the capital of France?" → "The provided documents do not contain
    information regarding the capital city of France…";
  - "Jaka jest stolica Francji?" → "Dostarczone dokumenty nie zawierają
    informacji na temat stolicy Francji…".
- **A contrast probe could not be made.** A probe with the setting `false`
  went to the project before any files were uploaded, and with no documents
  at all it refused too. So this run has no rule-off contrast; C1/C3 has one
  on the same code path. The organization's model had been pinned to
  `gemini-3-flash-preview` before the probes. The first probe attempt, against
  the seed's `mock-model`, left empty messages. Every probe message was
  deleted.

## Results

The harness's own counting: a case is ungraded only on a request error, or on
a judge error with the assertions passing.

| run | graded | passed | failed | ungraded | failure share |
|---|---|---|---|---|---|
| 1 | 28 | 25 | 3 | 0 | 10.7% |
| 2 | 28 | 26 | 2 | 0 | 7.1% |
| 3 | 28 | 26 | 2 | 0 | 7.1% |
| **median** | 28 | 26 | 2 | 0 | **7.1%** |

On the 24 must-not-cite cases, the judge labelled 24 of 24 `refused` in every
run. A document was cited (reported, not graded) in 9, 7 and 8 of the 24.

### Failed cases

- **Run 1**
  - `pl-near-w1-fare`: fails the assertion "must not contain 9,80". The rubric
    passed, label `refused`. The refusal lists the bicycle fare "9,80 zł [1]"
    as a related fact.
  - `pl-near-delay-claim-deadline`: fails the assertion "must not contain
    7 dni". The rubric passed, label `refused`, and the judge noted that the
    absence sentence carries no marker. The answer lists the baggage-damage
    deadline "7 dni kalendarzowych [2]" as a related fact.
  - `en-premise-xl-kolej-voucher`: fails the assertions "missing 15" and
    "must not contain 18 months", and the rubric. The answer says the
    documents hold nothing about Kolej Nadwiślańska, then gives Wolfsbane's
    voucher (20%, 18 months).
- **Run 2**
  - `en-premise-cash-refund`: fails the rubric. The answer corrects the
    premise ("does not provide cash refunds… ceased on 1 March 2026 [1]")
    but does not say refunds go only to the bank account.
  - `en-premise-xl-kolej-voucher`: fails the rubric and the assertion "must
    not contain 18 months". The answer gives Kolej's 15% and 12 months
    correctly, adds Wolfsbane's 18 months, attributed to Wolfsbane, and
    omits "not exchangeable for cash".
- **Run 3**
  - `en-near-late-refund-interest`: fails the rubric. "The answer includes a
    citation marker on the sentence stating the documents do not cover
    interest or penalties."
  - `en-premise-xl-kolej-voucher`: as in run 1.

**Failures from a citation on the statement of absence:** 1 of the 7 failed cases
across the three runs, `en-near-late-refund-interest` in run 3. Runs 1 and 2
had none.

`en-premise-xl-kolej-voucher` fails in every run, as it did in every arm of
C1/C3, the control included. It is a cross-lingual false premise. It is not
a near-miss refusal, and a relevance grader would not reach it: its context
is relevant.

### Possible grader false negatives (counted as failures above)

- **`pl-near-delay-claim-deadline`, run 1.** The answer is a correct refusal.
  The "7 dni" is a real figure from the baggage rules, presented as the
  baggage deadline and cited to its own document, and the rubric passed. The
  `expectNone` is there on purpose: the corpus notes that this is the figure
  a model would borrow. So the assertion cannot tell borrowing it from
  quoting it.
- **`pl-near-w1-fare`, run 1.** This is the same pattern: the bicycle fare,
  labelled as such. C1/C3 counted it as a forbidden figure.
- **`en-near-late-refund-interest`, run 3.** The marked sentence joins a real
  fact ("the policy specifies the decision timeframe and potential
  extensions") with the absence. Whether the marker sits "on the statement
  of absence" is a judgement call. The judge called it a failure.
- **`en-premise-cash-refund`, run 2.** The premise is corrected. Only the
  bank-account half of the rubric is missing, so it is a strict-but-literal
  rubric failure.

Even if all four counted as passes, the median would be 1/28 (3.6%). The
verdict does not depend on how they are read.

## Verdict

**The grader is not needed.** The median failure share is **2/28 = 7.1%**.
That is below the agreed 10% threshold. Runs 2 and 3 are at 7.1% and run 1
at 10.7%. Run 1 is the only run over the line, and two of its three failures
are the borrowed-figure assertions above.

Citations on the statement of absence cause 1 failure in 84 graded cases. The
failure that repeats in every run is a false premise with relevant context,
which a "withhold irrelevant context" grader would not change. C3 can be
marked "not needed" with these numbers.
