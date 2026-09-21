---
title: 'Text leaves a RAG chain three ways, and guarding the one the spec named covered two surfaces out of seven'
modules: ['web', 'api', 'guardrails']
areas: ['architecture', 'security', 'testing']
topics:
  [
    'guardrails',
    'streaming',
    'ai-sdk',
    'chain',
    'partial-coverage',
    'false-green',
    'architecture-tests',
  ]
---

# Three exits from a chain, and only one guarded

**Context**: guardrails Phase D wired the output window into `mapFullStream`,
which is the place the spec named, and the panel and the embedded widget were
covered. The slice looked done.

**Problem**: a chain hands out text three ways and the other two never met the
funnel.

| exit          | who reads it                                                                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fullStream`  | the panel, the widget, `/api/v1/chat` streaming, `apps/api`'s `/chat` streaming                                                                            |
| `textStream`  | `/api/v1/chat` non-streaming, **both** branches of `/api/v1/chat/completions`, `apps/api`'s `/chat` non-streaming and both branches of `/chat-completions` |
| `text`        | one fallback in `assistant-stream.ts`                                                                                                                      |

Five call sites across two apps were unguarded. `/api/v1/chat/completions` is
the one that reads worst: its *streaming* path streams `textStream`, not the
full one, so "we covered the streaming case" was true and irrelevant.

Nothing at runtime would have said so. The rule reads as enabled, some surfaces
enforce it, and which ones depends on which accessor a route happened to pick —
a failure that is invisible from every screen a person can open, and that a
test asserting "a blocked answer is refused" reproduces happily on the one
surface it exercises.

**Rule**: when a guard is attached to an accessor, enumerate the *other*
accessors before calling the slice done — and prefer a fix that makes the next
one covered by construction.

- Both apps now build one mapped stream and derive `textStream` from it
  (`textOfStream`), so a surface is covered by which function it calls rather
  than by somebody remembering. They share one iterator, so a caller consumes
  one of them and not both — which is what keeps the window single; two would
  each hold their own buffer and each file a hit for the same answer.
- `tests/architecture/a-chain-hands-out-guarded-text.test.ts` asserts both
  directions: no chain returns `result.textStream`, and every chain's text
  comes from `textOfStream`.
- A block reaches a reader of text as a **thrown** `GuardrailError`. A string
  iterator has nowhere to put "and the reason it stopped is a rule", and an
  iterator that simply ends is the easiest thing in the world to treat as a
  finished answer — which persists the text the rule stopped.
- The third exit was removed where nothing read it (`apps/api`) and, where one
  reader remains, the guard asserts there is exactly one and that it is gated
  on the refusal. "Its only consumer already checks" is not a guarantee; it is
  remembering.

**Applies to**: `apps/web/src/libs/chains/`, `apps/api/src/chains/`, and any
future cross-cutting pass over model output — a redaction step, a citation
extractor, a cost meter.
