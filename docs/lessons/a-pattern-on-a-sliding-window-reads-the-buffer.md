---
title: 'A regex evaluated on a sliding stream buffer anchors to the buffer, not to the answer — and `\b` is the half that does not look like an anchor'
modules: ['guardrails', 'web', 'api']
areas: ['architecture', 'security']
topics:
  [
    'guardrails',
    'streaming',
    'regex',
    'anchors',
    'word-boundary',
    'sliding-window',
    'false-positive',
    'save-time-validation',
  ]
---

# A pattern on a sliding window reads the buffer, not the answer

**Context**: guardrails Phase D evaluates `PATTERN` rules on the model's answer
while it streams. Because a match can straddle two deltas, the funnel holds the
last `OUTPUT_WINDOW_CHARS` characters back and runs the rules over a buffer —
a sliding piece of the answer, not the answer.

**Problem**: every construct that reads the *edges* of the string therefore
reads the wrong edges, and the rule fires on text that does not match it.
Checked in node rather than reasoned about:

```
foo$   on a mid-stream buffer 'the secret is foo'   → true
foo$   once more text arrives                        → false
\bfoo  on 'foo!', after 'zzzz' was released          → true
\bfoo  on the real answer 'zzzzfoo!'                 → false
```

`^` and `$` were reported by review. **`\b` is the worse half**: it turned up
while checking that report, it has the same defect, and nothing about it looks
like an anchor — an operator writing `\bpesel\b` has no reason to suspect the
string being searched has edges the answer does not. The same applies to
lookbehind and anything else zero-width that inspects neighbours.

A related trap in the same file: the release boundary counts UTF-16 code units,
so it can land between the halves of a surrogate pair and send a lone surrogate
in one delta and its partner in the next. Concatenated they are still one
emoji, which is why nothing downstream notices — the damage is done by the
split, in the delta that goes over SSE.

**Rule**: whenever a matcher is handed a *slice* of a larger string, ask what
it believes about the slice's edges — and fix the two causes differently.

- `^` and `$` are **refused at save time** (`usesStringAnchors`, failure code
  `string-anchor-on-output`), like a match wider than the window. Nothing at
  runtime can see this happen, so the only place to stop it is authoring. `$`
  alone could have been deferred to the final release, but `^` needs to know
  whether the buffer is still at the answer's start, and a rule whose meaning
  depends on which anchor it used is worse than one that is not allowed.
- `\b` and lookbehind are fixed with a **matching context**: the rules run over
  `context + buffer`, where the context is the tail of what has already gone
  out, and spans starting inside it are dropped. A span beginning in the
  context and reaching the buffer is dropped too — the context is a window
  wide, so such a match is wider than the window, which the validator already
  refuses.
- Input is untouched: a message arrives whole, so its anchors mean what they
  say. **The refusal still applies to an output rule even in the buffered mode**
  (`evaluateOutputText`), where the whole answer is present and the anchors
  would read correctly. A rule is authored once and may run in either mode, and
  one that behaved differently depending on whether the organization also
  happened to have a policy rule would be the worst kind of surprise.

**Applies to**: `packages/guardrails/src/evaluator/output-stage.ts`,
`validate-pattern.ts`, and any future matcher over a chunked stream — a
redaction pass, a citation scanner, a PII probe on deltas.
