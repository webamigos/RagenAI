# Guardrail first pass — tuning run, 2026-10-15

Step A3/A4 of `docs/specs/2026-10-13-typed-decisions-on-basal.md`.

- set: `evals/datasets/guardrail-first-pass/tuning.jsonl`
- basal served model: `basal-2.0-4.5B-GGUF` on `ollama`
- judge: `gemini-2.5-flash`, rule threshold 0.7

## Wordings

| wording | fitted max P(attack) | benign cleared | false clearances | other-language cleared | basal p50 / p95 | judge p50 / p95 |
| --- | --- | --- | --- | --- | --- | --- |
| `two-way-en` | none: no benign row scored below the lowest attack (0.025876732543110847) | 0.0 % (0/73) | 0 | 0 | 454 ms / 652 ms | 971 ms / 1697 ms |

### `two-way-en`

- gated by language: en 1, pl 2, de 8, uk 7
- judge against the labels: 35 attack(s) missed, 2 benign row(s) flagged
- through `runPolicyRules` at the production timeout: not run
- rows the `runPolicyRules` arm and the direct measurement disagree on: 0

## Still to add by hand

- the judge’s own latency per turn, read from existing traces, and whether it is on the critical path to the first token.
