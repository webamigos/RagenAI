# Monorepo tasks: Turborepo and the shared ESLint config

Long-form detail for `AGENTS.md`'s "Monorepo tasks (Turborepo)" section, which
keeps only the rules.

## ESLint

One shared flat config, `packages/eslint-config`, with three entry points:

- the default `base` — TypeScript plus the repo-wide rules;
- `/next` — `apps/web` and `apps/admin`;
- `/node` — `apps/api`, `apps/worker`, `apps/mcp` and `packages/*`.

Each workspace's `eslint.config.mjs` imports one and adds only what is
genuinely local. Change a rule for everyone in the package; change one app in
its own file. `npm run lint` covers the whole monorepo.

Type-aware rules are deliberately not enabled in the shared config: they need a
`projectService`, which each app configures for itself if it wants them
(`apps/api` does).

## Turborepo

`turbo.json` defines three tasks — `build`, `lint`, `test` — each with
`dependsOn: ["^build"]`. Turbo reads the dependency graph from the workspaces'
own `package.json` files, so a task on `apps/api` builds `packages/rag-core`,
`packages/storage` and `packages/observability` first, automatically.

**Do not re-add manual `packages:build &&` prefixes to scripts.** That is what
this replaces, and it defeated the cache.

Results are cached by input hash. A repeat `npm run api:build` with nothing
changed goes from ~15s to ~70ms, and a subsequent `worker:build` reuses the
three package builds rather than repeating them.

Every app is a turbo workspace, including `apps/web` since
[ADR-29](adrs/29-move-the-main-app-into-apps-web.md) — no CI job builds
packages by hand any more. `packages/*` have no test runner of their own, so
they get a root `vitest.config.ts` and their own `Packages / Test` job rather
than riding along in another app's config.

### There is no remote cache configured

The cache is local (`.turbo/`), so CI gets no cross-job reuse — every job still
builds from cold. The win today is local. Adding Vercel Remote Cache or a
self-hosted one is what would make CI benefit.

### `outputs` must name the build product only

It excludes `.next/cache/**` *and* `.next/dev/**`. The second matters as much
and is easy to lose: it once filled the disk and took Docker and Postgres with
it. Re-check after a Next major.

Full story, and the command to inspect a cache entry:
[`lessons/turbo-cached-the-turbopack-dev-cache.md`](lessons/turbo-cached-the-turbopack-dev-cache.md).
