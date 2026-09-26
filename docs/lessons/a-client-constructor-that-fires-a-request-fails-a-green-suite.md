---
title: "A client constructor that fires a request logs after the test has ended, and vitest fails a green suite over it"
modules: ['api', 'ci']
areas: ['testing', 'ci']
topics: ['vitest', 'flaky-tests', 'false-red', 'qdrant', 'console', 'fire-and-forget', 'local-services-hide-it']
---

# A client constructor that fires a request fails a green suite

**Context**: CI on a docs-only commit went red in `@ragenai/api#test:coverage`
with every test passing (109 files, 1229 tests):

```
Unhandled Rejection
EnvironmentTeardownError: [vitest-worker]: Closing rpc while "onUserConsoleLog" was pending
This error originated in "src/chains/basic-rag/initialize-basic-rag.service.spec.ts" test file.
```

Once in forty failed runs.

**Problem**: `new QdrantClient({...})` from `@qdrant/js-client-rest` defaults
to `checkCompatibility: true`. The constructor starts an **un-awaited** request
for the server version and `console.warn`s when it fails. CI's unit-test job
has no Qdrant, so the warning fires a few milliseconds later, after the test
that built the client has already finished. The CI log shows it as
`stderr | unknown test — Failed to obtain server version…` right after the
spec's summary line.

vitest sends each `console.*` write to the main process as an RPC call that
waits for an acknowledgement (`onUserConsoleLog`). At worker teardown it
rejects every call still waiting and reports that as an unhandled error. It
only reaches teardown when the warning lands in the last milliseconds of a
worker's run, which is why it is rare.

Three things hid it:

- **A local Qdrant answers the check.** The Compose container on 6333 makes
  the version request succeed, so no warning is ever printed on a developer
  machine. Point the client at a closed port to see it.
- **The Nest lines are a red herring.** `ConsoleLogger` writes to
  `process.stdout` directly, which vitest does not intercept. Only `console.*`
  goes through the RPC, so the hundreds of `[Nest] ERROR` lines in the log
  are not what raced.
- **The named file is wherever the worker was.** vitest attributes the error
  to the file the worker was running, not to the code that logged.

It was a product cost as well as a test flake. `QdrantVectorStoreClient` is
built per chat turn, so every turn sent one extra request to Qdrant, whose
only purpose was a warning.

**Rule**: when a suite fails with `Closing rpc while "onUserConsoleLog" was
pending`, look for a `console.*` call that runs after its test ended: a
constructor or module that starts async work nobody awaits. Search the CI log
for `stderr | unknown test`, which is that output when it does arrive. Fix it
where the work starts (here `checkCompatibility: false` at every
`new QdrantClient`), not with `dangerouslyIgnoreUnhandledErrors`. Before
concluding "cannot reproduce", check whether a local service is answering the
call that fails in CI.

**Applies to**: apps/api. apps/web constructs `QdrantClient` the same way in
`src/libs/vector-store/qdrant-client.ts`, `TableService.ts`,
`sync-vector-permissions-command.ts` and two scripts, still with the default.
Any SDK whose constructor phones home has the same shape.
