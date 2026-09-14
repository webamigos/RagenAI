---
title: 'Moving a suite to ESM makes a top-level `process.env` assignment run too late, and the test then asserts against the disabled code path while passing'
modules: ['worker', 'api']
areas: ['testing', 'architecture']
topics: ['vitest', 'jest', 'esm', 'feature-flags', 'module-load', 'false-green', 'silent-failure']
---

# Moving a suite to ESM makes a top-level `process.env` assignment run too late, and the test then asserts against the disabled code path while passing

**Context**: `apps/worker` moved from jest to vitest (ADR-48). Several tests
set a feature flag before importing the module under test, in the obvious
shape:

```ts
process.env.FEATURE_FLAG_TABLE_CHUNKS = '1';

import { loadDocling } from '../load-docling.js';
```

The flag is read once, at module load: `consts.ts` has
`export const TABLE_CHUNKS_ENABLED = process.env.FEATURE_FLAG_TABLE_CHUNKS === '1'`.

**Problem**: under jest this worked, because ts-jest compiled the file to
CommonJS and the `require` calls were emitted in source order — the assignment
really did run first. Real ESM hoists every `import` above every plain
statement regardless of where it is written, so `consts.ts` is evaluated,
`TABLE_CHUNKS_ENABLED` is fixed at `false`, and only then does the assignment
run against nothing.

What makes this worth a lesson is the failure mode, not the mechanism. Four of
the five jest/vitest differences the migration hit fail loudly — a missing
`default` export, an arrow used as a constructor, `fail` being undefined. This
one does not fail at all. The module loads, the test runs, and it asserts
against the flag's **disabled** behaviour. In `load-docling-tables.test.ts` the
symptom was a diff showing the markdown table still inline where `[Table 1]`
was expected — which reads like a broken excision in the parser, not like a
flag that never turned on. The same shape sat in the Presidio integration
suite, where a previous author had already noticed it and worked around it with
a `require()` call that stopped resolving the moment the worker became ESM.

**Rule**: anything a module reads **at load time** — a feature flag, a URL, a
model name — must be set in `vi.hoisted()`, which runs before the imports, not
in a top-level statement. When a suite moves to ESM, grep it for
`process.env.X =` at the top level and convert every one; a passing test is not
evidence that the assignment landed. If a module-load constant is worth
toggling in a test at all, prefer `vi.resetModules()` plus a dynamic import, so
the read is visibly ordered after the write.

**Applies to**: any ESM test suite (`apps/worker` and `apps/api`), and any
module-load `export const` derived from `process.env` —
`apps/worker/src/consts.ts` is full of them. `apps/api`'s e2e spec had the same
shape, worked around with a `require()` that stopped resolving the moment the
suite became ESM.
