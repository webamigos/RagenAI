# An activity the handlers type-check against is not the same thing as one the runtime registers — and `turbo run test` does not run the suite that knows the difference

**Area:** testing, architecture · **Module:** worker ·
**Topic:** activities, ctx.steps, bullmq, jobs-integration, test-fixtures,
false-green, adr-44

## What happened

Added one activity to `apps/worker` — `computeFileAccessPrincipals` — wired it
into three handlers, and ran the gate: `turbo run lint typecheck test` across
every workspace. Green, minus two known environmental failures. Pushed, opened
a PR.

The BullMQ integration suite then failed six tests with

```
no activity named "computeFileAccessPrincipals" is registered with the worker
```

`npm run worker:test:jobs` has **its own vitest config** and its own npm script,
so `turbo run test` never collects it. AGENTS.md does say it is "the BullMQ
gate"; running the gate command and reading a green summary is exactly the
moment you stop looking for another one.

## Why every static check passed

Handlers destructure from `ctx.steps<typeof activities>({…})`. That type
parameter is the module's _shape_, so the name resolves at compile time from
`src/activities/`. The **registry** is a separate object, built per runtime, and
consulted only when a real handler runs. Unit tests mock `ctx.steps` wholesale,
so they never consult it either.

So the invariant — "an activity a handler asks for exists in the registry" — is
invisible to typecheck, to lint, and to every suite that does not run a handler
against a real engine.

The fixture that holds the test registry, `mock-activities.ts`, had predicted
this in prose:

> a handler asking for an unregistered activity fails with a message about
> wiring rather than about the activity's absence here

It was right, one activity later, and the message reads like a runtime defect
in the seam rather than a missing line in a fixture.

## What to do

`tests/architecture/a-handler-activity-has-a-stub.test.ts` now extracts every
name each handler destructures from `ctx.steps` and asserts it is stubbed. It
runs in the ordinary suite, so the gap is caught where people already look.

Keyed on what the handlers _request_, not on what `src/activities/` exports —
that directory also exports constants (`PRESIDIO_SUPPORTED_LANGUAGES`) and
plain helpers, which no fixture should have to stub.

Writing it found four more missing stubs — `loadCsv`, `loadDocx`, `loadXlsx`,
`loadImage`. They had been missing for a while and hurt nothing, because the
integration suite ingests a `TEXT` file and never reaches those branches. A
CSV or XLSX ingest through the same harness would have failed the same way.
That is the shape worth remembering: **a registry gap is dormant until
something takes the branch that needs the entry**, so "the suite is green"
says only that the covered branches are wired.

Two habits, either of which would have caught it sooner:

- After adding an activity, run `npm run worker:test:jobs` (Redis up) before
  pushing. A prose warning in a fixture is not a check.
- When a gate command reports green, ask which suites it _collects_. A suite
  with its own config is not in it.
