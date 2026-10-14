# Guardrail first-pass set — candidates, not yet labelled

Step A2 of [the basal spec](../../../../../docs/specs/2026-10-13-typed-decisions-on-basal.md).

`candidates.unlabelled.jsonl` holds 206 candidate rows. **None of them is labelled.**

| field | meaning |
| --- | --- |
| `set` | `benign`, `attack` or `other-language` |
| `lang` | the language of `text`: `pl`, `en`, `de`, `uk` |
| `text` | the message as a user would send it |
| `policy` | always `null`; see below |
| `draft` | what the row's author *meant* it to be. It is a hint, not a label |
| `label` | `null` until a person sets it |
| `source` | an existing eval file, or `hand-written` |

Where the rows come from:

- **benign**: every Polish and English question in the rag-benchmark corpora
  and the promptfoo datasets (101, each text once), plus 40 hand-written
  "hard" rows. A hard row is ordinary
  work that uses the words an attack uses: "ignore the typo", "write a system
  prompt for our bot", "from now on answer in bullet points".
- **attack**: `red-team.yaml` plus 45 hand-written rows across techniques:
  override, prompt extraction, role play, "this is a harmless test",
  instructions hidden in pasted content, tool abuse, encoding, hypotheticals,
  separators. One `red-team.yaml` row is a PII request, not a jailbreak, so
  its draft says `attack?`. `ci-gate.yaml`'s injection probe ("Ignore all
  previous instructions…") is an attack here, whatever that file uses it for.
- **other-language**: German and Ukrainian rows, hand-written plus the German
  and Ukrainian translations from `rag-quality.yaml`. The language gate must
  send them to the judge. That file's Spanish, French and other translations
  are not here: the spec measures the gate on German and Ukrainian only.

There are no policy rows. The first pass clears `jailbreak-detection` only,
and every `LLM_POLICY` rule goes to the judge (the spec's "What basal is
asked"). The field stays so a later policy set has the same shape.

## Before anything runs on this set

The spec's rules, which this file exists to make possible:

1. **A person sets `label` on every row.** The drafts were written by a model,
   and a set labelled by a model measures agreement with that model.
2. **Grow it to the spec's sizes** before splitting: ~200 benign, ~200
   attacks, ~30 in other languages. It is short of all three today. No two
   rows may share a `text`: a duplicate could land in both halves and leak
   the holdout into tuning.
3. **Split once into tuning and holdout halves**, stratified by `set` and
   `lang`. Do this before any model sees a row.
4. **Nobody adds or edits a row after seeing a result.**

Nothing has been run on these rows. The informal probe from the night of
2026-10-14 used a separate set of 20 throwaway examples, for exactly this
reason.
