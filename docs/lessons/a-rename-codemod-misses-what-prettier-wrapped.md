---
title: 'A rename codemod matching `\bjest\.fn\b` misses every call prettier wrapped onto two lines, and the migration looks finished while the suite is red'
modules: ['worker', 'api']
areas: ['testing', 'architecture']
topics: ['codemod', 'vitest', 'jest', 'prettier', 'regex', 'false-green']
---

# A rename codemod matching `\bjest\.fn\b` misses every call prettier wrapped onto two lines, and the migration looks finished while the suite is red

**Context**: moving `apps/worker` and `apps/api` off jest (ADR-48) meant
renaming jest's mocking API to vitest's across 106 files. The mechanical part
was done by a codemod matching `\bjest\.<member>\b` per member name.

**Problem**: prettier breaks a long chain across lines. A mock with a trailing
`.mockResolvedValue(...)` is formatted as

```ts
getDocumentParser: jest
  .fn()
  .mockResolvedValue({ parser: 'legacy', strict: false }),
```

and `\bjest\.fn\b` does not match that — there is a newline and indentation
between `jest` and `.fn`. Every wrapped call survives the rename untouched.

The survivors do not announce themselves at rename time. They fail later, at
run time, as `ReferenceError: jest is not defined`, in files that look fully
migrated. The worker's first pass left 18 and reported the migration as done
with 12 suites red; `apps/api` had 102 of them, enough that the same mistake
would have looked like the migration had fundamentally failed rather than that
one regex was too narrow.

Line-based `grep` cannot find them either, which is what makes the state hard
to audit — `grep -rn 'jest\.'` over the worker came back with four hits while
18 broken call sites sat in the same tree.

**Rule**: before a rename codemod runs, normalise the formatting it is about to
match against — collapse `jest\s*\n\s*\.` to `jest.` in one pass, then rename,
then let prettier re-wrap. To audit afterwards, match across lines:

```bash
find src -name '*.ts' -exec perl -0777 -ne 'print "$ARGV\n" if /\bjest\s*\n\s*\./' {} \;
```

More generally: a codemod's coverage claim is only as good as its search, and a
count of "N renames applied" says nothing about what it failed to see. Verify
by running the suite, not by re-reading the codemod's own output.

**Applies to**: any identifier-rename codemod over prettier-formatted source —
method chains, fluent builders, and long argument lists are where the wrapping
happens.
