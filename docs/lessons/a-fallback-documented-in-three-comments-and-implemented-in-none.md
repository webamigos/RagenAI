---
title: 'A fallback was documented in three comments, a commit message and a handoff note, and implemented in none of them — only a test written from the doc found it'
modules: ['worker']
areas: ['architecture', 'testing']
topics: ['error-handling', 'temporal', 'cancellation', 'silent-failure', 'doc-comments', 'test-design']
---

# A fallback documented in three comments and implemented in none

**Context**: the ingest cancellation port replaced a Temporal signal with a
database read. On Temporal that read has to be an activity — a workflow sandbox
has no I/O — so `temporalContext` proxies `isIngestCancelled` with its own short
retry policy, and the ingest handlers call it at about five checkpoints per run.

The intended behaviour was decided early and written down carefully: two
attempts, and if both fail the checkpoint answers *not cancelled* and the
pipeline continues. The reasoning is sound and worth keeping — a checkpoint that
throws lands in the handler's parsing catch, which records `FAILED`, so a
database blip would destroy an ingest that was going fine. A cancellation missed
by one checkpoint is caught by the next, and the row does not go away in between.

**Problem**: that behaviour existed only in prose. It was stated in the
activity's doc comment, in `temporalContext`'s doc comment, in the commit
message that introduced both, and in the handoff note listing the decisions not
to re-litigate. The code underneath read:

```ts
checkCancelled: (subject) => isIngestCancelled(subject),
```

No try/catch anywhere — not in the adapter, not in the handler's `checkCancelled`
wrapper. A failed read propagated straight out of the checkpoint.

Nothing was going to catch this. Every existing test mocked the activity to
resolve, so the failure path had no coverage; typecheck and lint have no opinion
about a missing catch; and the three comments agreeing with each other read, to
a reviewer, like corroboration. The density of the documentation is what made it
convincing — the same sentence in three places looks verified, when in fact it
was copied.

It surfaced only because the rewritten spec added a case *from the documented
behaviour rather than from the code*: "continues the ingest when the checkpoint
itself cannot read the status". That test failed on the first run, which is the
entire reason the gap is now closed.

**Rule**: when a doc comment describes what happens on failure — a retry budget,
a fallback value, a degradation — grep for the `catch` that implements it before
believing it. A comment is a claim, not a mechanism.

And when porting behaviour, write at least one test from the *prose* rather than
from the code. Tests derived from the implementation can only confirm what the
implementation already does; the documented-but-absent case is invisible to
them by construction. Repeated comments are one source, not three.

**Applies to**: any `JobContext` adapter (`temporal-context.ts`, and the BullMQ
one arriving in Phase C, which has to make the same promise); anywhere a doc
comment describes error handling that a reader cannot see from the call site.
