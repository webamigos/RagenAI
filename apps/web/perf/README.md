# Load and access-control harness

Two questions this answers that the unit and e2e suites do not: how the
document queries behave once a tenant holds thousands of files, and whether a
user who is not supposed to reach a document actually cannot.

Both need a database with real volume in it, so nothing here runs as part of
`npm run verify` — it has its own vitest config and its own throwaway database.

## Setup

```bash
# 1. Backing services (Postgres publishes on 55432, not 5432)
npm run ragen:up:full

# 2. A throwaway database. The seed refuses any name without "perf" in it.
psql -h localhost -p 55432 -U postgres -c 'CREATE DATABASE ragen_perf'
export DATABASE_URL=postgresql://postgres:pass123@localhost:55432/ragen_perf
export DATABASE_DIRECT_URL=$DATABASE_URL
npx prisma migrate deploy

# 3. Seed. Defaults to a realistic mid-size tenant (~120 files/org).
npx tsx perf/seed-load.ts
```

Scale knobs are env vars, so the same harness answers both questions:

```bash
# Stress one org hard enough to show where the access filter stops being free.
PERF_FILES_PER_ORG=5000 PERF_THREADS_PER_ORG=300 \
  PERF_PERMISSIONS_PER_ORG=1500 npx tsx perf/seed-load.ts
```

## Running

```bash
# From the repository root (DATABASE_URL must point at the perf database):
npm run web:perf:seed
npm run web:perf:test

# Or directly, from apps/web:
npx vitest run -c vitest.perf.config.ts --disable-console-intercept
```

`--disable-console-intercept` is what lets the latency table and the `EXPLAIN`
output through; without it vitest swallows them on a passing run.

The HTTP suite additionally needs the app running against the same database:

```bash
npx next dev -p 3100          # with DATABASE_URL pointing at ragen_perf
PERF_BASE_URL=http://localhost:3100 npx vitest run -c vitest.perf.config.ts
```

`idor-http.test.ts` skips itself when `PERF_BASE_URL` is unset, so a run without
a server still exercises everything else.

## What is here

| File                     | Purpose                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixture.ts`             | Scale knobs, and the _named_ rows the matrix asserts on. Keep these hand-readable — the bulk rows exist only to make queries do work.          |
| `seed-load.ts`           | Generates the dataset. Deterministic PRNG, so two runs produce the same rows. Wipes its own prefix first.                                      |
| `access-control.test.ts` | Who can see which file, asked of Postgres through the real production queries.                                                                 |
| `idor-http.test.ts`      | The same question asked by requesting an id directly over HTTP, with real sessions.                                                            |
| `benchmark.test.ts`      | Latency table plus an `EXPLAIN` assertion that the access filter still uses an index.                                                          |
| `logger-stub.ts`         | Stands in for the app logger, which uses CommonJS `require()` and does not resolve outside webpack. Also captures tenant-scope-guard warnings. |

## Reading the results

Some cases are marked `it.fails()`. Those are **confirmed defects**, recorded so
the suite stays green while the bug exists and turns red the moment it is fixed
— which is the signal to unwrap the assertion. Each carries a comment
explaining the defect; see also `docs/lessons.md`. Do not "fix" a red
`it.fails()` by deleting it.

The benchmark's thresholds are deliberately loose. They exist to catch a dropped
index or an N+1, not to police milliseconds; the printed table is the real
output.
