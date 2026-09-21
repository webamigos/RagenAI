---
title: "`npm install` prunes a lockfile node that `npm ci` then demands back, so adding a workspace reds every CI job in 40 seconds"
modules: ['ci']
areas: ['dependencies', 'ci']
topics:
  [
    'npm-workspaces',
    'lockfile',
    'npm-ci',
    'monorepo',
    'false-green',
    'adr-33',
  ]
---

# `npm install` prunes a lockfile node that `npm ci` then demands back

**Context**: the MCP-catalogue work added one workspace, `packages/connector-guard`, and declared `"@ragenai/connector-guard": "*"` in apps/web, apps/api and apps/admin. That is the most ordinary dependency change there is, and it is made with `npm install`. `npm run verify` was green across all 31 workspaces.

**Problem**: every one of the eleven CI checks failed in 10–40 seconds, before a single job reached any code — `npm ci` refused the install with `Missing: @smithy/signature-v4@5.7.3 from lock file` and thirty more like it. The branch reads as catastrophically broken when nothing in it is wrong.

There were two distinct causes stacked on top of each other, and only the first is documented in `.github/actions/use-pinned-npm/action.yml`:

1. **The lockfile was written by the wrong npm.** `package.json` pins `npm@10.9.8` and CI enforces it through corepack; the local shell had npm 11.19.1, whose `npm install` rewrites the tree wholesale — a 174/788 line diff that pruned `esbuild@0.28.2` with all its `@esbuild/*` optional binaries and five copies of `@smithy/signature-v4`. npm 10's `npm ci` requires every one of them. Nothing local reports this: `npm run verify` never runs `npm ci`.

2. **The pinned npm is not self-consistent either.** Re-running `npm install` under npm 10.9.8 produced a correct 27-line diff — and still failed `npm ci` under that same npm 10.9.8, now on `Missing: zod@3.25.76 from lock file`. The install prunes `node_modules/@modelcontextprotocol/sdk/node_modules/zod`; the clean-install sync check then insists on it. The node is genuinely redundant — the SDK accepts `^3.25 || ^4.0` and the hoisted zod is 4.3.6, and it is not even on disk after an install — but `npm ci` compares against its own ideal tree, not against reality. `--package-lock-only` does the same thing, so it is not a shortcut around this.

**Rule**: a lockfile change is only verified by running `npm ci`, with the npm the repository pins, and `npm run verify` does not do it. The whole procedure, after any `npm install` in this repo:

```bash
corepack prepare npm@10.9.8 --activate   # or run the cached binary directly:
NPM10="node ~/.cache/node/corepack/v1/npm/10.9.8/bin/npm-cli.js"
git checkout origin/main -- package-lock.json   # start from the merge base
$NPM10 install                                  # regenerate with the pinned npm
$NPM10 ci --dry-run                             # the check CI actually runs
```

If that last command names a missing node, **re-insert it from `origin/main`'s lockfile rather than accepting the pruned one**, and confirm with a second `--dry-run`. The right shape for adding a workspace is a pure addition — the workspace's `packages/<name>` node, its `node_modules/@ragenai/<name>` link, and one line per consuming app. Any deletion in a `package-lock.json` diff that is not a dependency you removed on purpose is the resolver editorializing, and is the thing that will red the branch.

Corepack's `enable npm` may leave an existing nvm `npm` symlink in place, so check `npm --version` actually moved; if it did not, invoke the cached binary by path as above.

**It fires on a removal too, and the image build is a second consumer.** #1300 took jest out of `apps/mcp` — three devDependencies deleted, nothing added — and the pinned npm's `npm install` pruned `@modelcontextprotocol/sdk/node_modules/zod` again, exactly as in cause 2. The first sign was not CI: it was `docker build -f apps/mcp/Dockerfile`, dying at `npm ci` on `Missing: zod@3.25.76 from lock file`. **No Dockerfile uses the pinned npm** — `node:24-slim` and `node:24-alpine` ship npm 11 — so the lockfile has two consumers on two npms, and `npm ci --dry-run` under npm 10 catches both: it names the same missing node. Re-inserting that one entry from `origin/main`'s lockfile left a diff of 208 deletions and nothing else, which is the shape a removal should have. A lockfile diff that touches packages unrelated to the dependency you changed is still the resolver editorializing, in either direction.

**Applies to**: every change that touches `package.json` in any workspace, and especially adding a workspace — which is how ADR-33's "declare it once" shared packages get created. Related: `.github/actions/use-pinned-npm/action.yml`, which fixed the CI half of this after #1255 and #1258, and [`monorepo-absorption-discards-the-lockfile`](monorepo-absorption-discards-the-lockfile.md) for what silently re-resolves when the tree's shape changes.
