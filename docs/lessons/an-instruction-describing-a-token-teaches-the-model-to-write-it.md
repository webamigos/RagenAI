---
title: 'An instruction describing a token format, sent unconditionally, teaches the model to produce that token'
modules: ['web']
areas: ['security', 'rag']
topics: ['pii', 'presidio', 'prompt', 'placeholders', 'stream-unmasker', 'silent-failure']
---

# An instruction describing a token format, sent unconditionally, teaches the model to produce that token

**Context**: chat-time PII masking replaces personal data in the user's
question with Presidio placeholders (`<PL_PHONE_1>`), and `StreamUnmasker`
puts the real values back into the streamed answer from the alias map.
`assistant-stream.ts` appended a system instruction to every prompt explaining
the placeholders, with a list of example tokens, and telling the model to copy
them exactly.

**Problem**: the instruction was sent on every turn — masked or not, and with
masking switched off entirely. On demo, an English question with no personal
data in it retrieved a document containing "+48 61 245 18 00". The model read
the real number in the context, read an instruction describing `<PL_PHONE_1>`,
and answered "call <PL_PHONE_1>". The alias map was empty, so `StreamUnmasker`
returned early and passed the token through; the reader saw it, and it was
stored in the thread's history, where every later turn's context would carry it
again. The source snippet beneath the answer showed the real number, which made
the answer look like a masking bug rather than an invention.

Two things let it through, and either alone would have been enough to show the
reader a raw token:

- the instruction was unconditional, so the model had a template to invent from
  on exactly the turns where there was nothing to restore;
- the unmasker trusted that every placeholder in the output came from the map,
  and had a shortcut for an empty map — the one case where every placeholder
  is necessarily invented.

A side effect hid for as long: the chains fall back to their default answer
instructions only on an empty prompt, and the unconditional instruction filled
that slot on every turn, so an organization without its own prompt never got
the defaults the evals measure.

**Rule**: an instruction that describes a token format belongs only on a turn
that contains such tokens — build it from the actual tokens, not from examples,
and say what *not* to tokenize. And a restorer must handle the tokens it cannot
restore: rewrite an unmapped placeholder (here with `redactPiiPlaceholders`)
rather than pass it through, including when the map is empty and when the token
is split across chunks. Check every exit the text leaves through — the stream
and the resolved-text fallback in `assistant-stream.ts` both go through the
same `StreamUnmasker` instance now.

**Applies to**: any prompt text that describes a placeholder, marker or
template syntax (PII tokens, citation markers, guardrail `[[redacted:…]]`
labels), and any post-processor that assumes the model only emits what it was
given.
