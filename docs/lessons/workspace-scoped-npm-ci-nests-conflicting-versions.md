---
title: 'Adding a workspace dependency to an app whose Dockerfile installs with --workspace needs four coordinated changes, and the failure names an unrelated package'
modules: ['mcp', 'worker', 'api']
areas: ['architecture', 'deployment']
topics: ['docker', 'npm-workspaces', 'monorepo', 'hoisting', 'railway', 'observability']
---

# Adding a workspace dependency to an app whose Dockerfile installs with --workspace needs four coordinated changes, and the failure names an unrelated package

**Context**: `apps/mcp` gained its first workspace dependency, `@ragenai/observability` (ADR-28). Its Dockerfile uses the tight, well-cached shape: copy only the manifests it needs, then `npm ci --workspace=@webamigos/ragen-mcp --ignore-scripts`, then copy only `/app/node_modules` into the builder. That shape works precisely as long as the app has *no* workspace dependencies — which was true when it was written and stopped being true with one line in `package.json`.

**Problem**: the build failed with `error TS2307: Cannot find module 'fastmcp'` — a package nobody had touched, and the one dependency `apps/mcp` had had since day one. The cause is hoisting, not fastmcp. A single-workspace `npm ci` has nothing to conflict with, so everything hoists to `/app/node_modules`, which is the only tree the builder copied. Installing a second workspace alongside it introduces version conflicts (here `apps/mcp`'s TypeScript 5.8 against the package's pinned ~5.7), npm resolves them by *nesting* the loser under `apps/<app>/node_modules` — and it is free to nest anything else while rebalancing, which is how `fastmcp` moved. The error therefore points at whichever package happened to lose the reshuffle, never at the dependency that was added.

Four changes are needed, and three of them fail silently or late if missed:

1. `COPY packages/<pkg>/package.json packages/<pkg>/` in the manifests stage — otherwise `npm ci` cannot link the symlink target.
2. A second `--workspace=` on the *deps* install (not prod-deps), so the package's own devDependencies — its pinned TypeScript — are available to build it.
3. `COPY --from=deps /app/apps/<app>/node_modules ./apps/<app>/node_modules` in the builder, **after** the `COPY apps/<app> ./apps/<app>` that would otherwise overwrite it. This is the one the fastmcp error is about.
4. `COPY --from=builder /app/packages/<pkg>/dist` **and** its `package.json` into the runner. `node_modules/@ragenai/*` are symlinks into `packages/`, `--ignore-scripts` skips the `prepare` hook that would have built the package, and `.dockerignore` excludes `**/dist` so a locally-built one never enters the context. Miss this and the image builds clean and the container dies at startup on a dangling symlink.

**Rule**: `npm ci --workspace=X` produces a *different node_modules layout* than `npm ci`, and the layout changes again with each `--workspace` added. Treat "copy only `/app/node_modules`" as an assertion that the install is single-workspace; the moment it is not, copy the nested `node_modules` too (`mkdir -p` them in the install stage first, so the COPY cannot fail on a tree where npm happened to hoist everything — `apps/worker/Dockerfile` already does this). And verify with an actual `docker build` plus a `docker run`: `npm run verify` on the host proves nothing about any of the four, because the host tree has every workspace installed.

**Applies to**: `apps/mcp/Dockerfile` and `apps/worker/Dockerfile`, both of which install workspace-scoped. `apps/api/Dockerfile` sidesteps all of it by running a plain `npm ci` over the whole tree and `COPY --from=build /app/packages ./packages` — slower and fatter, but it cannot develop this failure. Re-check whenever an app takes on its first, or an additional, `packages/*` dependency.
