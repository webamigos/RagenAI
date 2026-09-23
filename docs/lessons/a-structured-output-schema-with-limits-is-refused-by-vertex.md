---
title: A structured-output schema with length limits and array bounds is refused by Vertex, and every unit test passes
modules: [worker, brain-core]
areas: [integration, testing]
topics: [ai-sdk, generate-object, vertex, gemini, zod, json-schema, structured-output, llm-gateway, false-green]
---

## Context

Ragen Brain's extraction (spec B1–B3) asks the model for entities, claims
and relations through `generateObject` with a Zod schema. The schema carried
its limits in the obvious place: `.min()`/`.max()` on every string, `.max()`
on every array, "bounded everywhere" because an unbounded array invites a
response that costs more than the document. `brain-core` and the worker had
58 and 33 tests around it, all green, and the job ran through the BullMQ
integration suite.

## Problem

The first real call — B5's preview script, `gemini-2.5-flash` on Vertex —
failed before extracting anything:

> 400 The specified schema produces a constraint that has too many states for
> serving. Typical causes … long array length limits (especially when
> nested) … strings with complex formats …

Vertex compiles the response schema into a state machine for constrained
decoding and refuses one that is too large; length and item bounds are what
make it large. Nothing else could have seen it: every unit test binds
`generate` to a fixture, and the integration suite stubs the activity.

It was also invisible from the job's own output. The failure reason is
deliberately reduced to the error's class name (`AI_APICallError`) so the
document never reaches a finding, which meant the message that explained it
had to be read in a separate call that sent no customer text.

## Rule

- **Give the provider the shape, and apply the limits yourself.** A
  structured-output schema is a decoding constraint, not a validator. Keep
  the one sent to the model free of length and count bounds
  (`extractionProviderSchema`), and validate afterwards — per item, so one
  over-long value drops one item instead of failing the answer and paying for
  a retry (`parseExtraction`).
- **One real call before the second PR.** A code path whose only external
  dependency is a model call is not tested until it has made one. Fixtures
  prove the rules; they cannot prove the provider accepts the request.
- **When a reason is redacted on purpose, diagnose with a call that carries
  nothing sensitive.** Same model, same schema, a harmless prompt — then the
  full error is safe to print.

## Applies to

Any `generateObject` / structured-output schema routed to Vertex (Gemini),
and by caution to any provider doing constrained decoding. The other
structured-output call sites in the worker (`score-document-for-rag.ts`,
`evaluate-suggestion-dimensions.ts`, `optimize-document-suggestions.ts`)
carry bounds too; they pass today on their models, which is not the same as
being safe to move to Vertex.
