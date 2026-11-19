---
title: 'In a content filter, an optional quote before a negative lookahead can match nothing, so `href=["'']?(?!#)` refuses `href="#g"`'
modules: ['platform-contracts', 'web', 'admin']
areas: ['security']
topics: ['regex', 'svg', 'upload-validation', 'lookahead', 'branding']
---

# In a content filter, an optional quote before a negative lookahead can match nothing, so `href=["']?(?!#)` refuses `href="#g"`

**In short**: The SVG logo check (spec B2) meant "refuse any `href` that does not point inside the file". Written as `href\s*=\s*['"]?\s*(?!#)`, it refused every SVG with a gradient reference: the engine let `['"]?` match nothing, and the lookahead then saw the quote, which is not `#`. Put the optional part inside the lookahead: `href\s*=\s*(?!['"]?\s*#)`. A unit test with a *valid* input caught it; the tests of hostile inputs all passed.

## Context

`findUnsafeSvgConstruct` in `packages/platform-contracts/src/branding/instance-branding.ts`
refuses SVG constructs a logo cannot carry: scripts, event handlers, links
outside the file, external `url()` references. Internal references —
`fill="url(#gradient)"`, `<use href="#shape"/>` — are how ordinary exported
logos draw gradients, and must pass.

## Problem

Both the `href` and the `url(` rules were written with the optional quote in
front of the lookahead. A regex engine backtracks into an optional element
before it gives up on a match, so for `href="#g"`:

1. `['"]?` takes the quote, `(?!#)` sees `#` and fails;
2. the engine backtracks, `['"]?` takes nothing, `(?!#)` now sees `"` — not
   `#` — and succeeds.

The rule matched, and a harmless logo was refused as "a link to something
outside the file". Every test of a hostile SVG passed, because over-refusing
is invisible to tests that only ever expect a refusal.

The same shape fails the other way in an allowlist: a *positive* lookahead
after an optional element can be satisfied by the element matching nothing,
and lets through what it was meant to stop.

## Rule

- When a lookahead is meant to inspect what comes after an optional prefix,
  put the prefix **inside** the lookahead: `(?!['"]?\s*#)`, not
  `['"]?\s*(?!#)`.
- A filter's tests need a valid input that exercises each rule's exception,
  not only hostile inputs. "It refuses the bad thing" says nothing about
  whether it refuses everything.

## Applies to

Any regex-based content check — upload validation, URL allowlists, the
guardrail patterns in `packages/guardrails` — where a rule has an exception
introduced by a lookahead.
