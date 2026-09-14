---
title: apps/web imported the AI SDK in 19 files without declaring it, so another workspace's package.json decided its version
modules: [web, api, worker]
areas: [architecture, dependencies]
topics: [npm-workspaces, hoisting, phantom-dependencies, ai-sdk, monorepo, upgrades]
---

## Context

Phase B of the LiteLLM retirement needed `@ai-sdk/azure`, `@ai-sdk/amazon-bedrock`
and `@ai-sdk/google-vertex`. Scoping the upgrade started with the ordinary
question — which workspaces resolve `ai`, and at what version:

```
+-- @webamigos/ragen-api  -> ai@6.0.99 deduped
+-- @webamigos/ragen-worker -> ai@6.0.99 deduped
`-- ai@6.0.99
```

`apps/web` is not in that list.

## Problem

**`apps/web` imports `ai`, `@ai-sdk/openai`, `@ai-sdk/provider` and
`@ai-sdk/mcp` across 19 files and declared none of them.** The chat stream, the
model factories, the embeddings factory and the MCP tool loading all resolve
through the hoisted root `node_modules`, which contains those packages only
because `apps/api` and `apps/worker` ask for them.

Two consequences, neither visible from `apps/web`:

- **Its version is decided elsewhere.** Bumping `ai` in `apps/worker` — an app
  that summarises documents — silently changes the library that streams every
  chat response in the panel. Nothing in `apps/web`'s diff would show it, and
  nothing in its package.json would explain the new behaviour.
- **A removal elsewhere breaks it.** If `apps/api` stopped using `@ai-sdk/mcp`,
  the panel's connector tooling would fail to resolve, in a workspace nobody
  edited.

Neither typecheck nor lint sees this: the import resolves, so it type-checks,
and `eslint-plugin-import`'s `no-extraneous-dependencies` is not enabled here.
`npm ls` shows it only if you notice an app is _absent_ from the tree, which is
the kind of negative observation that is easy to skim past.

## Rule

**An app declares every package it imports, even when hoisting already makes it
work.** The test is not "does it resolve" but "does this app's package.json
explain which version it gets".

When scoping a dependency upgrade in a workspace repo, `npm ls <pkg>` answers
"who resolves it", not "who uses it". Ask the second question separately:

```bash
grep -rl "from '<pkg>'" apps/*/src packages/*/src | cut -d/ -f1-2 | sort -u
```

An app that appears in the grep and not in `npm ls` is taking its version from
somebody else's decision.

## Applies to

Every workspace in this monorepo, and most sharply to the shared runtime
libraries — `ai`, `@ai-sdk/*`, `zod`, `@temporalio/*` — where a version change
alters behaviour rather than just types. The same shape as
[a package edit is invisible to apps until its dist is rebuilt](a-package-edit-is-invisible-to-apps-until-its-dist-is-rebuilt.md):
the monorepo resolves something for you, and the resolution is not where you
would look for it.
