# ADR-26: Absorb ragen-worker into the Monorepo as `apps/worker`

**Status:** Accepted — implementation in progress
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
decide the "talk to apps/api instead of the DB" half — see *Out of scope*.

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
header says *"Kept in sync with ragen-app/src/libs/vector-store/bm25-encoder.ts."*
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

These are real but bounded, and they are all *build-time* problems with known
mitigations. The drift problem is a *runtime correctness* problem with no
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

The base is `origin/dev` of ragen-worker at `4c4b31f` (*"feat(parsing): make
Docling the default parser, add DOCLING_STRICT (#119)"*). ragen-worker PR #109
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

| Phase | What | Risk |
|---|---|---|
| **1** | Copy worker to `apps/worker`, wire as npm workspace, root `worker:*` scripts, CI jobs, reworked Dockerfile. No source changes beyond what the layout forces. | Low — mechanical |
| **2** | Unify `EMBEDDINGS_MODEL` across app + worker + docs + compose. | Low, but touches runtime config — needs a coordinated env update on deploy |
| **3** | Extract `packages/rag-core`; delete both `bm25-encoder.ts` copies in favour of it. | Medium — the payoff phase |
| **4** | Third `generator` block in `prisma/schema.prisma` for the worker; begin replacing hand-written Knex with the generated client. Minimum bar if this stalls: a schema-drift test that fails when a column the worker queries disappears. | Medium — largest surface |

Phases 1–3 are in scope for this ADR's implementation. Phase 4 may be split into
its own ADR if it grows.

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

`apps/api/package-lock.json` is tracked in git but inert — npm workspaces resolve
from the root lockfile. It is a leftover from the ADR-21 merge and is misleading
to anyone who opens it. Do not replicate it for `apps/worker`, and delete it
when convenient.

## Open questions

- Does the open-source posture (Apache 2.0 and governance files landed in
  `0252d573`) intend to cover the worker? If the app is to be public and the
  worker private, this ADR is wrong and the boundary should stay. **Assumed:
  same posture for both.**
- Does anyone deploy the worker from a fork or a separate pipeline that a repo
  move would break?
