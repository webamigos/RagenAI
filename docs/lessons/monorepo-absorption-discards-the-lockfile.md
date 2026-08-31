---
title: 'Absorbing a repo into the monorepo silently re-resolves every dependency it had pinned'
modules: ['worker', 'api']
areas: ['dependencies']
topics: ['monorepo', 'npm-workspaces', 'lockfile', 'upgrades']
---

# Absorbing a repo into the monorepo silently re-resolves every dependency it had pinned

**Context**: ADR-26 moved `ragen-worker` in as `apps/worker`. Following ADR-21's precedent, this was a plain file copy: source, configs and `package.json` came across, while the standalone `package-lock.json` was dropped because npm workspaces resolve from the root lockfile.

**Problem**: dropping that lockfile threw away every *resolution* the worker had been running on, keeping only its `^` ranges. Re-resolving those against the root tree moved **42 of 82 dependencies** — including `@temporalio/*` from 1.13.1 to 1.23.0 (ten minors of the SDK that owns workflow determinism and Temporal server compatibility), `@aws-sdk/client-s3` from 3.787.0 to 3.1120.0, and `typescript` *backwards* from 5.8.3 to 5.7.3 because the root pins `~5.7.0`. None of this appears in the diff — `package.json` is unchanged, so a reviewer reading the PR sees a file move. Three build failures were the only visible symptom, and each one was a version artifact rather than a porting mistake: `@tsconfig/node18` had added `types: ["node"]` in a patch release (18.2.7), which switches off automatic `@types/*` inclusion and drops Jest's globals; newer `pino` types rejected `logger.error(msg, err)`, which turned out to be a real latent bug (pino treats trailing args as printf interpolation, so the error was never attached); and `generateObject` overflowed type instantiation (TS2589) because the worker resolves a nested zod 3, forced by `@mendable/firecrawl-js`, while the hoisted `@ai-sdk/provider-utils` resolves the root's zod 4.

**Rule**: a move should change location, not runtime. Before merging an absorbed app, diff its resolved dependency versions against the standalone repo (read them out of both `node_modules`, not the manifests — the manifests are identical, that is the whole trap) and exact-pin anything where a silent jump is dangerous: workflow/protocol runtimes, native addons, database drivers, and the compiler. Upgrades then happen in their own PR where the diff is visible and revertible. Expect a handful of build errors that look like porting bugs but are version artifacts — check what the standalone lockfile pinned before "fixing" the code. And treat a build error appearing only after the move as a question about the tree, not the source: `npm install` honours the existing lockfile, so deleting `node_modules` does not re-resolve stale nested entries, and `npm dedupe` operates repo-wide and can fail on an unrelated workspace's peer ranges.

**Applies to**: any future absorption of a standalone repo into this monorepo (`ragen-token-vault`, `ragen-mcp`), and any time a workspace's dependency resolution changes shape — adding a workspace, changing a root pin, or introducing a shared package that hoists differently.
