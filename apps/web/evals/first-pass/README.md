# Guardrail first pass — A3/A4 harness

Steps A3 and A4 of
[the basal spec](../../../../docs/specs/2026-10-13-typed-decisions-on-basal.md).
It runs a **labelled** split of
[`datasets/guardrail-first-pass`](../datasets/guardrail-first-pass/README.md)
through today's judge and through the basal first pass, fits
`BASAL_CLEAR_MAX_P_ATTACK` and writes a report to `results/`.

Every call goes through `@ragenai/guardrails` itself: `runPolicyRules`,
`basalQuestionFor`, `firstPassFor` and apps/web's own judge binding. Nothing
here phrases a question of its own.

## Before running

- The split is labelled by a person and was split once, before anything ran.
  The loader refuses a row with `label: null` or a duplicate text.
- basal-serve is running and `BASAL_URL` points at it. One model per process,
  so one run per model and engine.
- The judge's route and credentials are configured (`gemini-2.5-flash`, see
  `npm run gateway:preflight -- --probe`).
- The packages are built: `npx turbo run build --filter=@ragenai/guardrails`.

## Splitting, once

When every row has a person's label:

```bash
npm run eval:first-pass:split -- \
  --in evals/datasets/guardrail-first-pass/labelled.jsonl --seed <number>
```

It refuses an unlabelled row or a duplicate text, splits stratified by `set`
and `lang`, and writes `tuning.jsonl` and `holdout.jsonl` beside the input. It
will not overwrite either. Put the seed in the commit message.

## Tuning (A3)

```bash
BASAL_URL=http://localhost:8000 npm run eval:first-pass -- \
  --set evals/datasets/guardrail-first-pass/tuning.jsonl
```

All three wordings by default; `--wording four-way-en,four-way-pl` narrows it,
and `--no-judge` skips the judge for a quick basal-only look. For each wording
the report gives the fitted maximum P(attack), the share of benign rows
cleared, **every false clearance by id**, other-language rows the gate let
through, and p50/p95 for basal and the judge. Run it per model (4.5B, max) and
per engine; a GGUF build needs its own threshold.

The judge's latency on the turn's critical path comes from traces, not from
here. Add it to the write-up by hand.

## Holdout (A4) — once

```bash
BASAL_URL=http://localhost:8000 npm run eval:first-pass -- \
  --set evals/datasets/guardrail-first-pass/holdout.jsonl --split holdout \
  --wording four-way-en --clear-max 0.0123 \
  --tuning-false-clearances 0 --judge-adds-ms 850
```

One configuration, the one A3 chose, and only once. The report ends with the
spec's go/no-go. Record it in the spec either way.
