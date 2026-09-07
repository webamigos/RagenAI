---
title: 'An e2e locator keyed to a Tailwind colour class fails when the colour is tokenised, while the feature works perfectly'
modules: ['web']
areas: ['testing']
topics: ['playwright', 'e2e', 'tailwind', 'design-tokens', 'locators', 'refactoring']
---

# An e2e locator keyed to a Tailwind colour class fails when the colour is tokenised, while the feature works perfectly

**Context**: `apps/web` had no colour system — 3830 hard-coded Tailwind colour
classes against 824 uses of the semantic tokens. Part of fixing that replaced
`text-red-600 dark:text-red-400` with `text-destructive` on a form validation
message.

**Problem**: `test-e2e` went red on `p0-22-projects.spec.ts`, three attempts,
`element(s) not found`:

```
Locator: locator('#input-error, [class*="text-red"]').first()
```

The validation error still rendered. The test was not asserting that an error
appears — it was asserting that an element carrying a class whose name
contains `text-red` appears, which is a different claim and one the product
never promised. Renaming the class broke the test without touching the
behaviour.

Two details made it worse than a one-line fix:

- The element **already** carried `role="alert"` and `id="title-error"`. The
  semantic hooks the test wanted existed the whole time; the locator reached
  past them for a colour.
- The locator's first alternative, `#input-error`, is real — `libs/common-ui`'s
  shared `Input` and `Select` render it. So the pattern works for forms built
  from those components and silently falls through to the colour class for
  forms that are not, which is why the coupling survived unnoticed.

A colour-class locator also cannot fail in a useful way. It reports "element
not found", pointing at rendering, when the cause is a rename three files
away.

**Rule**: never locate by a Tailwind palette class in a test. Locate by a
specific id or `data-testid` the component already exposes, by accessible
name, or by role — in that order. Role alone is weaker than it looks here:
`getByRole('alert').first()` is satisfied by _any_ visible alert on the page,
so it can pass for the wrong reason. Prefer the hook that identifies the one
element the test is about. A class name is an implementation detail, and
colour classes in particular are the detail most likely to move: a design
refresh, a dark-mode pass or a token migration renames all of them at once.

The same applies to structural classes used as a proxy for content — a
`[class*="border-dashed"]` standing in for "the empty state" is the same bug
waiting for the next styling change.

When a test does need a hook that no role provides, add `data-testid` to the
component rather than reaching for whatever class happens to be there.

**Applies to**: everything under `apps/web/e2e/`. Two locators used this
pattern when it was found — `p0-22-projects.spec.ts` (fixed) and
`p1-31-organization-members.spec.ts`, which survives only because it targets a
dialog built from the shared `Input` and so matches on `#input-error`. Note
the priority split in AGENTS.md: a PR runs only `smoke-*` and `p0-*`, so the
`p1` one would not have failed the PR that broke it.
