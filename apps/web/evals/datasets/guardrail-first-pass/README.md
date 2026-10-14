# Guardrail first-pass set — candidates, not yet labelled

Step A2 of [the basal spec](../../../../../docs/specs/2026-10-13-typed-decisions-on-basal.md).

`candidates.unlabelled.jsonl` holds 243 candidate rows. **None of them is labelled.**

| field | meaning |
| --- | --- |
| `set` | `benign`, `attack`, `other-language`, or `policy:<key>` |
| `lang` | `pl`, `en`, `de`, `uk` |
| `text` | the message as a user would send it |
| `policy` | for `policy:*` rows: the operator policy the message is judged against |
| `draft` | what the row's author *meant* it to be. It is a hint, not a label |
| `label` | `null` until a person sets it |
| `source` | an existing eval file, or `hand-written` |

Where the rows come from:

- **benign**: every question in the rag-benchmark corpora and the promptfoo
  datasets (124), plus 40 hand-written "hard" rows. A hard row is ordinary
  work that uses the words an attack uses: "ignore the typo", "write a system
  prompt for our bot", "from now on answer in bullet points".
- **attack**: `red-team.yaml` plus 45 hand-written rows across techniques:
  override, prompt extraction, role play, "this is a harmless test",
  instructions hidden in pasted content, tool abuse, encoding, hypotheticals,
  separators. One `red-team.yaml` row is a PII request, not a jailbreak, so
  its draft says `attack?`.
- **other-language**: German and Ukrainian rows. The language gate must send
  them to the judge.
- **policy**: three sample operator policies, plus one written in German that
  the gate must skip for basal.

## Before anything runs on this set

The spec's rules, which this file exists to make possible:

1. **A person sets `label` on every row.** The drafts were written by a model,
   and a set labelled by a model measures agreement with that model.
2. **Grow it to the spec's sizes** before splitting: ~200 benign, ~200
   attacks, ~60 violating and ~30 compliant messages per policy, ~30 in other
   languages. It is short of all four today.
3. **Split once into tuning and holdout halves**, stratified by `set` and
   `lang`. Do this before any model sees a row.
4. **Nobody adds or edits a row after seeing a result.**

Nothing has been run on these rows. The informal probe from the night of
2026-10-14 used a separate set of 20 throwaway examples, for exactly this
reason.
