# A test that builds the model's answer by hand cannot see what the model actually writes

**Area:** testing, rag
**Module:** worker, packages/platform-contracts
**Topic:** personal-memory, structured-output, zod, evals, llm-contract, false-green

## What happened

Personal memory's extraction job (spec 2026-09-27, C1) shipped with 46 green
unit tests and a 44-case eval script (C2) that nobody had run against a model.
An overnight end-to-end test told a chat three facts about the user, saw the
job record its `MEMORY` usage, and found the memory table empty. The eval, run
for the first time, scored a keep recall of **0 of 19**.

## Problem

The parser validated each operation against `z.discriminatedUnion('op', …)`.
The schema handed to the model described the list as `z.array(z.unknown())`,
and the prompt wrote operations as `ADD { content }` without ever naming the
field that carries the kind. So the model chose: gemini-2.5-flash answered
`{"operation": "ADD", "content": "Is the CFO."}` on every turn, and every
entry failed the union and was dropped — silently, because a plan with nothing
to write returned without a log line.

Every unit test built its answer as `{ op: 'ADD', … }`, by hand. They tested
the parser against the contract the author had in mind, which is exactly the
one the model was never told about. Two further gaps surfaced once the first
was fixed, both invisible to the same tests: with `content` *optional* in the
schema, structured output left it out of every UPDATE; and a model writes
"no date" as the string `"null"`.

## Rule

- **The schema you send is the contract; the prompt is not.** If a field
  matters to the parser, it must be in the schema handed to the model — a
  `z.unknown()` there leaves the shape to the model. Add a test that reads the
  JSON Schema the provider actually receives (`zodSchema(x).jsonSchema`).
- **Prefer required-and-nullable over optional** for fields a model must
  decide about. Optional fields are the ones structured output drops.
- **Keep one real answer verbatim as a fixture.** A hand-built object proves
  the parser parses what you would have written; the model's own answer proves
  the contract.
- **A run that drops everything must say so.** "Nothing to do" and "rejected
  everything" have to be distinguishable in the log, counts only.
- **An eval that has never run is not evidence.** Run it once on the real
  model before the PR that adds it merges; it costs cents.

## Applies to

Any feature that parses a model's structured answer: memory extraction,
Brain extraction and contradiction checks, guardrail judges, section
selection, RAG scoring and Optimize.
