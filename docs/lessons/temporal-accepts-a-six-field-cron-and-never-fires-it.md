---
title: 'Temporal accepts a six-field cron and never fires it — a parity suite that reuses the other engine’s dialect reports the wrong engine broken'
modules: ['worker', 'ci']
areas: ['architecture', 'testing']
topics:
  [
    'worker-runtime',
    'temporal',
    'bullmq',
    'schedules',
    'cron',
    'adr-44',
    'parity-testing',
    'silent-failure',
  ]
---

# Temporal accepts a six-field cron and never fires it — a parity suite that reuses the other engine’s dialect reports the wrong engine broken

**Context**: the job-runtime integration suite (the spec's D1) was written runtime-agnostic so §8.3's nightly parity job could point it at Temporal. Its schedules file registers a fast schedule rather than waiting for a nightly one, and that fast schedule was `'*/2 * * * * *'` — six fields, seconds first, which is BullMQ's pattern dialect and was written when BullMQ was the only harness.

**Problem**: on Temporal that string is accepted and does nothing. `upsertSchedule` succeeds, `listSchedules` returns the schedule, `describe()` shows it exists — and **zero actions fire in sixty seconds**, measured, against thirty-three for the same interval written as `'@every 2s'`. Temporal's cron is five fields; the sixth is not rejected, it is parsed into something that never comes due. So two of the three schedule tests failed on the parity run with "expected at least 1 calls, saw 0", which reads exactly like *Temporal does not fire schedules at all* — a false and alarming first answer from a job whose entire purpose is to be believed. It also failed in isolation, which removed the obvious suspect (cleanup racing the next test) and cost the time it takes to rule one out.

**Rule**: a parity suite proves the *plumbing* is shared, not that the inputs are. Anything the engine parses — a cron expression, a duration string, a retry policy's shape, a queue name's legal characters — is a dialect, and belongs to the runtime rather than to the test. Give it to the harness (here, `RuntimeTraits.everyFewSeconds`) with the measurement in the comment, so the next person reads "Temporal accepts this and never fires it" instead of re-deriving it.

**And be suspicious of a green create.** The tell here was that every write-side call succeeded: the difference between "the schedule does not exist" and "the schedule exists and is never due" is invisible to everything except waiting. When a parity run reports a whole capability missing on one engine, check first whether the *input* crossed the boundary intact — an engine that silently accepts the other's syntax produces exactly this shape of failure.

**Applies to**: `apps/worker/test/jobs-integration/`, `packages/jobs-temporal`'s `upsertSchedule`, and the two ensure-schedule scripts, whose production patterns are five-field and therefore work on both engines — which is why this never showed up outside the test.
