---
title: 'A transitive `import "server-only"` takes every promptfoo eval down, and nothing reports it because no eval runs in CI'
modules: ['web']
areas: ['testing', 'architecture']
topics:
  ['evals', 'promptfoo', 'server-only', 'adr-20', 'false-green', 'dead-harness']
---

# A transitive `import "server-only"` takes every promptfoo eval down, and nothing reports it because no eval runs in CI

**Context**: ADR-20 says measure before shipping a retrieval or prompt change.
The instrument for a citation change is `npm run eval:citations`. Reaching for
it on 2026-09-16 produced, before a single question was asked:

```text
ESM import failed: This module cannot be imported from a Client Component
module. It should only be used from a Server Component.
```

**Problem**: `basic-rag/chain` → `operations` → `create-ai-usage-command` →
`check-team-rate-limit-query`, whose first line is `import 'server-only'`. That
package exists to throw: it is a build-time tripwire for a module that reached a
client bundle. The evals are a plain Node process driving the same chain the
route handlers drive, so the tripwire fires on code it was never meant to catch,
and the provider cannot even be constructed.

The import arrived in [#1175](https://github.com/webamigos/RagenAI/pull/1175),
which had no reason to think about promptfoo and no way to find out: **no eval
suite runs in CI.** So every suite that loads the chain — `citations`,
`rag-quality`, `red-team`, `model-comparison` — had been dead since that merge,
and the first person to learn it was the next person who tried to measure
something. Which is the worst moment: you reach for the instrument precisely
when you need it, and ADR-20's discipline turns into "the harness is broken,
ship it anyway".

Two smaller things fell out of the same session, both of the same family:

- `npm run eval:citations` loads no env file, unlike `eval:benchmark`. It
  depends on the shell's environment, and `. .env.local` does not work —
  `VERTEX_CREDENTIALS` is unquoted JSON with spaces. Every model call failed
  with `AI_NoOutputGeneratedError`, which reads like a provider outage.
  promptfoo takes `--env-file`.
- The suite's "nothing may be cited" case retrieves **nothing**, because the
  mock store drops chunks that share no term with the question. It proves the
  pipeline declines; it cannot prove a citation rule, and it had been standing
  in for one.

**Rule**: a harness nothing runs is not a harness, it is a file. If a repository
keeps evals for a standing "measure first" rule, either run one of them in CI or
expect the rule to be unenforceable at the moment it matters. And when adding
`server-only` to a query, remember who else imports it transitively: the guard
is about bundles, and a test runner is not one — shim it in the runner rather
than moving the import, because `server-only` on a query that reads a rate limit
is correct.

**Applies to**: `apps/web/evals/` — the shim now lives at
`evals/shims/server-only.ts` and is mapped in `evals/tsconfig.json`, beside the
logger shim that exists for the same reason. Any new `import 'server-only'` in
the chain's import graph is covered by it; a new *kind* of server-side guard
would need the same treatment.
