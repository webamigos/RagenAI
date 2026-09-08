# ADR-26: Absorb ragen-worker into the Monorepo as `apps/worker`

**Status:** Accepted. Phases 1, 2 and 3 implemented; Phase 4 (Prisma generator for the worker) outstanding.
**Date:** 2026-08-31

## Context

`ragen-worker` is the Temporal worker that owns document ingest: parse → chunk →
summarize → embed → upsert into Qdrant. It lives in its own repository
(`WebAmigos/ragen-worker`, 158 TypeScript files, ~12.9k LOC, 277 commits,
deployed to Railway from its own Dockerfile).

ADR-21 merged `ragen-api` into this repository as `apps/api` and unified the
Prisma schema, and it explicitly deferred this question:

> Decide, as a separate future ADR, whether `ragen-worker` should start talking
> to `apps/api` instead of the DB directly — not required for this decoupling to
> succeed.

This ADR answers the repository-boundary half of that question. It does **not**
decide the "talk to apps/api instead of the DB" half — see _Out of scope_.

### The problem is not tidiness, it is silent drift

ragen-app and ragen-worker are not two services with an API between them. They
are the two halves of one retrieval system, joined by a set of contracts that
exist only as convention:

- the Qdrant collection schema (named vectors `vectors` / `sparse_vectors`)
- the dense vector dimensionality (`VECTOR_SIZE`)
- the embedding model — the worker writes vectors with it, the app queries with it
- the BM25 tokenizer and hash function — indexing and querying must agree
- `metadata` payload keys (`accessible_by`, `chunk_type`, `project_id`, `file_id`…)
- the Postgres schema, owned by `prisma/schema.prisma` in this repo

Every one of these fails **at runtime and silently** when the two sides
disagree. A mismatch does not break a build or a test; it degrades retrieval
quality, which surfaces as "the AI gave a bad answer" weeks later. This is the
worst possible failure mode to defend with a repository boundary, because a
repository boundary is exactly the thing that prevents a compiler or a test run
from noticing.

### Four pieces of evidence that the drift is already happening

Found by inspection while writing this ADR, not hypothetical:

**1. The embedding-model env var has two different names.**

```
ragen-app/src/app/lib/services/llm.ts:156      process.env.EMBEDDING_MODEL
ragen-worker/src/consts.ts:10                  process.env.EMBEDDINGS_MODEL
```

Same setting, two spellings. They must hold the same value or the app queries a
vector space the worker never wrote to. `AGENTS.md` documents only the singular
form, so anyone configuring a deployment from the documentation sets one of the
two and gets a silently broken index.

**2. The same `VECTOR_SIZE` comment is maintained in two repositories.**
`ragen-app/src/libs/vector-store/qdrant-client.ts:10-14` and
`ragen-worker/src/services/qdrant.ts:18-24` carry near-identical prose about
when it is safe to override the value. Documentation that must be kept in sync
across a repo boundary is a signal that the boundary is in the wrong place.

**3. `bm25-encoder.ts` is an explicitly hand-mirrored file.** The worker copy's
header says _"Kept in sync with ragen-app/src/libs/vector-store/bm25-encoder.ts."_
The logic is identical today (verified: comment-stripped diff is empty), but the
comments have already diverged. A divergence in the tokenizer or the FNV-1a hash
would make indexed terms and queried terms hash to different sparse indices —
undetectable except as worse search results.

**4. The worker writes raw SQL (Knex, `client: 'pg'`) against a schema this repo
owns via Prisma.** There is no compile-time link between
`prisma/schema.prisma` and `ragen-worker/src/activities/db/*`. A column rename
here breaks the worker in production, not in CI.

### What the split repo is actually buying

Honest accounting of the arguments for keeping it separate:

- **Blast radius of one lockfile.** PR #805 (a Dependabot dev-dependency group
  bump) broke every CI job in this repo with an out-of-sync lockfile. Adding the
  worker's `@hyzyla/pdfium`, AWS SDK, Temporal and Langfuse trees to the same
  lock widens that.
- **Different deploy target and cadence.** Railway, own Dockerfile, dependency
  on the `docling` container, released independently.
- **Container image size**, if the build naively installs the whole workspace.

These are real but bounded, and they are all _build-time_ problems with known
mitigations. The drift problem is a _runtime correctness_ problem with no
mitigation short of discipline. We already accepted this trade for `apps/api`
under ADR-21, and the workspace infrastructure it built — a shared schema with
per-app `generator` blocks, per-app Dockerfile and Railway config, root
`.dockerignore` — is exactly what the worker needs.

## Decision

**Absorb `ragen-worker` into this repository as `apps/worker`, an npm workspace,
following the pattern ADR-21 established for `apps/api`.**

Four specific decisions:

### 1. Plain file copy, no git history import

Same as ADR-21: this is a file copy, not `git subtree` or a submodule. The
standalone `ragen-worker` repository is **tagged and archived, not deleted**, as
the historical record. `git blame` continuity is lost going forward from the
merge commit; this was judged acceptable for `apps/api` and the same reasoning
applies.

The base is `origin/dev` of ragen-worker at `4c4b31f` (_"feat(parsing): make
Docling the default parser, add DOCLING_STRICT (#119)"_). ragen-worker PR #109
(`[WIP] rag-optimization-pipeline`, open since 2026-05-06) is stale and is
**not** carried over; if that work is still wanted it gets re-opened against the
monorepo.

### 2. Standardize on `EMBEDDINGS_MODEL` (plural), with no back-compat alias

The worker's spelling wins; ragen-app is changed to match. No deprecation
period, no alias reading both — deployments set the new variable name.
Accepting a brief coordinated env change is cheaper than carrying a
dual-read shim that hides which variable is authoritative.

`AGENTS.md`, `README.md`, `.env.example` and `docker-compose` are updated to the
single name. A codebase-wide grep for `EMBEDDING_MODEL` (singular) must return
nothing after this ADR lands.

### 3. Extract `packages/rag-core` **after** the move, not before

The shared-contract code — BM25 encoder, `VECTOR_SIZE`, the Qdrant collection
schema, the embedding-model constant, `metadata` key names — moves into a
workspace package consumed by both `src/` and `apps/worker/`.

This is the actual payoff, but it is deliberately **sequenced second**, because
an extraction spanning two repositories cannot be verified atomically: you
cannot make the change and run both test suites in one command until both sides
already live in one tree. Moving first is mechanical and low-risk; extracting
second is semantic and gets a green build to check it.

`packages/rag-core` must be consumable by a `tsc --build` → `dist` → plain-node
target, which the existing `packages/db` (raw `.ts` via `exports`, consumed only
by a Next.js app that transpiles it) is not. It therefore ships a real build
with declarations rather than raw TypeScript.

### 4. The worker keeps its own Dockerfile and Railway deploy

No change to how it ships. The Dockerfile is reworked for the workspace layout —
the lockfile is now at the repo root, and the install is scoped with
`npm ci --workspace=apps/worker` so the image does not pull in Next.js, Playwright
and the rest of the app's tree.

## Phasing

Each phase is independently mergeable and leaves the tree green.

| Phase    | What                                                                                                                                                                                                                                                           | Risk                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **1** ✅ | Copy worker to `apps/worker`, wire as npm workspace, root `worker:*` scripts, CI jobs, reworked Dockerfile. No source changes beyond what the layout forces.                                                                                                   | Low — mechanical                                                               |
| **2** ✅ | Unify `EMBEDDINGS_MODEL` across app + worker + docs. Also corrected the embedding-model default to `bge-multilingual-gemma2` so it matches `VECTOR_SIZE`'s 3584 — they had disagreed, so an install setting neither variable had every Qdrant upsert rejected. | Low, but touches runtime config — **needs a coordinated env rename on deploy** |
| **3** ✅ | Extract `packages/rag-core`; delete all **three** `bm25-encoder.ts` copies (apps/api had one too) and the triplicated `VECTOR_SIZE` / vector-name / batch-size constants.                                                                                      | Medium — the payoff phase                                                      |
| **4**    | Third `generator` block in `prisma/schema.prisma` for the worker; begin replacing hand-written Knex with the generated client. Minimum bar if this stalls: a schema-drift test that fails when a column the worker queries disappears.                         | Medium — largest surface                                                       |

Phases 1–3 are in scope for this ADR's implementation. Phase 4 may be split into
its own ADR if it grows.

## Update: what Phase 1 actually cost

Phase 1 is done and green (worker lint, 261 tests in 21 suites, `tsc` build; app
and api unchanged). It was _not_ a pure file copy, and the reason is worth
recording: **discarding the worker's lockfile re-resolved every `^` range
against the root tree — 42 of its 82 dependencies landed on a different
version.** Nobody asked for those upgrades; they were a side effect of the move.

The dangerous ones, pinned back to what the worker actually ran:

| dep                  | standalone     | monorepo default        | action                                                                             |
| -------------------- | -------------- | ----------------------- | ---------------------------------------------------------------------------------- |
| `@temporalio/*`      | 1.13.1         | 1.23.0                  | **pinned to 1.13.1** — workflow determinism and server compatibility hang off this |
| `typescript`         | 5.8.3          | 5.7.3 (root's `~5.7.0`) | **pinned to 5.8.3** — a silent downgrade                                           |
| `@aws-sdk/client-s3` | 3.787.0        | 3.1120.0                | accepted                                                                           |
| `pino`               | 9.6.0          | 9.14.0                  | accepted                                                                           |
| `knex` / `pg`        | 3.1.0 / 8.14.1 | 3.3.0 / 8.18.0          | accepted                                                                           |

Three source changes were forced, each a genuine finding rather than churn:

1. **`tsconfig`: `types: ["node", "jest"]`.** `@tsconfig/node18` added
   `types: ["node"]` in 18.2.7, which switches off automatic `@types/*`
   inclusion and drops Jest's globals from the test files `include` picks up.
   The standalone repo never saw it because its lockfile pinned 18.2.4.
   Declaring both explicitly stops the build depending on a patch release of a
   config base.
2. **`website-loader`: `logger.error(msg, err)` → `logger.error({ err }, msg)`.**
   Newer pino types reject the old form, and they are right to: pino treats
   trailing args as printf interpolation, so the error object was never actually
   being attached to the log line. A latent bug the version bump surfaced.
3. **`score-document-for-rag`: a `@ts-expect-error` on the `generateObject`
   schema.** See below.

### The zod split, and why it is only suppressed for now

`@mendable/firecrawl-js` requires `zod@^3`, so npm nests zod 3 under
`apps/worker`, while the hoisted `@ai-sdk/provider-utils` resolves the root's
zod 4. Handing a zod 3 schema to a zod-4-typed generic makes TypeScript's
structural comparison unbounded (TS2589) — including through `zodSchema()`, the
AI SDK's own zod-3-or-4 bridge, which is typed against both and therefore
compares both.

Everything tried and rejected, so nobody repeats it:

- Declaring `zod: ^4.3.6` on the worker — npm still nests zod 3, because
  firecrawl's constraint wins inside the workspace subtree.
- `npm dedupe` — tries to hoist TypeScript to 6.0.3 repo-wide and fails
  `apps/api`'s peer range. Far too broad for this change.
- Pinning `ai` to nest alongside zod 3 — `@ai-sdk/provider-utils` stays hoisted
  regardless, so the mismatch survives.

AI SDK v6 supports both zod majors at runtime, so this is a type-checking
artifact with no runtime effect, and the directive is self-cleaning (it errors
once it stops being needed). **The real fix is putting the worker on zod 4**,
which is smaller than it sounds: every zod API the worker uses — `z.string().url()`,
`z.enum`, `z.preprocess`, `.superRefine`, `.default`, `z.ZodIssueCode.custom`,
`safeParse().error.issues` — was verified present in 4.3.6, across only three
files. It needs its own PR because it changes env-validation behaviour on a
production service.

### Smaller things worth knowing

- `apps/worker` joins `apps/api` in `.eslintignore`. It has its own ESLint 9
  flat config and CI job, and the root's ESLint 8 config enforces rules
  (`no-console`, no `export *`) the worker's code was never written against — the
  pre-commit hook lints staged paths with the root config regardless of app.
- The Dockerfile resolves `@temporalio/core-bridge` via `require.resolve` rather
  than a hardcoded `node_modules/` path. Because the worker pins `@temporalio/*`
  away from the root's version, npm nests it in some trees and hoists it in
  others — and `--omit=dev` flips which one you get, so the hardcoded path built
  the `deps` stage and broke `prod-deps`.
- Prettier 3.9 (from PR #805) reformats four worker files on first commit. This
  is pending across `apps/api` too and is tracked separately.

## Out of scope

- **Whether the worker should call `apps/api` instead of the database directly.**
  ADR-21 deferred this and it stays deferred. This ADR moves the code; it does
  not re-architect the data path.
- **Consolidating test runners.** The worker stays on Jest, ragen-app stays on
  Vitest, `apps/api` stays on Jest. Three runners in one repo is not elegant, but
  rewriting the worker's suite is unrelated risk.
- **Consolidating ESLint.** The worker is on ESLint 9 flat config, ragen-app on
  ESLint 8 with `eslint-config-next`. npm nests the second copy under
  `apps/worker/node_modules`; both lints keep working. Unifying is future work.
- **Migrating to AI SDK v7.** v7 is GA (`latest` = 7.0.86) and v6 is still
  maintained under the `ai-v6` tag, so there is no forcing function. It is also
  **ESM-only**, while both `apps/worker` and `apps/api` compile to CommonJS —
  that conversion, not the API renames, is the real cost. Beyond it, v7 changes
  `usage` from final-step to all-steps aggregation (this repo reads `.usage` in
  ~50 places to bill AI usage) and moves tool approval from `tool()`'s
  `needsApproval` to a call-level `toolApproval` option (~35 sites). A codemod
  (`npx @ai-sdk/codemod v7`) covers the renames but not either of those. Its own
  ADR, after this one lands.
- **The pre-existing `npm audit --audit-level=critical --omit=dev` failure** on
  `dev` (4 criticals: `better-auth`, `protobufjs`, `tar`, `vitest`). Unrelated to
  this move, but it means the security-audit job is already red and cannot serve
  as a regression signal for this work.

## Consequences

### Positive

- The shared retrieval contract becomes checkable by the compiler and by one
  test run instead of by discipline across two repos.
- One `prisma generate` from one schema can eventually serve all three apps.
- A change to the ingest/retrieval pair lands as one reviewable PR instead of two
  PRs that must be merged and deployed in the right order.
- The stale `EMBEDDING_MODEL` / `EMBEDDINGS_MODEL` split gets fixed rather than
  documented around.

### Negative

- **Wider Dependabot / lockfile blast radius.** One broken lock now stops app,
  api, admin and worker CI together. PR #805 is the worked example.
- **Slower CI**, with three more jobs on every pull request.
- **Loss of `git blame` continuity** for worker files across the merge commit.
- **A bigger repository** for anyone who only cares about one app.
- **Docker build complexity**: the build context and install scoping have to be
  right, or the worker image silently gains the whole Next.js tree.

### Neutral but worth recording

`apps/api/package-lock.json` was tracked in git but inert — npm workspaces
resolve from the root lockfile. It was a leftover from the ADR-21 merge and
misleading to anyone who opened it: by the time it went it was missing 26 of
the 81 dependencies `apps/api/package.json` declares and disagreed with five
version ranges. **Deleted**, and
`tests/architecture/only-the-repository-root-has-a-lockfile.test.ts` now fails
on a lockfile under `apps/*` or `packages/*` in any format, so the next
absorbed repository cannot bring one along the way this one did.

## Open questions

- Does the open-source posture (Apache 2.0 and governance files landed in
  `0252d573`) intend to cover the worker? If the app is to be public and the
  worker private, this ADR is wrong and the boundary should stay. **Assumed:
  same posture for both.**
- Does anyone deploy the worker from a fork or a separate pipeline that a repo
  move would break?
