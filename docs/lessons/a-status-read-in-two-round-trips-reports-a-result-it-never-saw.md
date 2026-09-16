---
title: 'A status read taken in two round trips reports a run that finished between them — completed, with no result'
modules: ['worker', 'web']
areas: ['architecture', 'testing']
topics:
  ['bullmq', 'jobs-seam', 'race-condition', 'integration-tests', 'docgen']
---

# A status read taken in two round trips reports a run that finished between them — completed, with no result

**Context**: the BullMQ adapter's `getRun(runId)` answers the one route that
reads a job's *result* — `/api/documents/status/[workflowId]`, which the
document-generation UI polls until it sees a file. It was written as the
obvious two steps:

```ts
const job = await Job.fromId(queue, runId); // a snapshot of the job hash
const state = await job.getState(); // a second read, a moment later
return { status, result: job.returnvalue };
```

**Problem**: those are two round trips against a key that is changing. A run
that finishes *between* them answers `completed` from the second read and
`null` from the first, because the snapshot was taken before the worker wrote
the return value. The caller is then told the document generated successfully
and handed nothing to open.

Nothing in the repository could see it. The adapter's unit tests mock
`Job.fromId` and hand back one object, so the two reads are the same object by
construction — the race does not exist in a mock. Every other job's result is
recorded rather than read, so the only consumer that would notice is one route,
polling every few seconds, which lands in a window a few milliseconds wide.

The D1 integration suite found it on its first run, and only because it polls
as fast as it can: eight jobs in 314ms, and one of them landed in the window.
The same code had already been through review and a green CI.

**Rule**: when a read is *two* reads, decide what happens if the thing changes
in between — and when the answer is "the outcome is already written", take the
second read after observing it rather than before. A terminal state is the
signal that the record is complete, which is why the fix is a re-read once
`getState()` says completed or failed, not a lock or a retry loop.

More generally: **a suite that mocks the transport cannot find a race in the
transport.** This is the argument for D1 existing at all, and the reason the
spec calls it the gate rather than an e2e test — `e2e.yml` starts no worker, so
nothing there consumes a queue either.

**Applies to**: `packages/jobs-bullmq/src/index.ts`'s `getRun`, and anything
else that reads a BullMQ job's `returnvalue` or `failedReason` alongside its
state. The Temporal adapter is not affected — `describeWorkflowExecution`
answers both in one call — which is itself the point: a seam's two
implementations can agree on a contract and disagree on what a partial read
means.
