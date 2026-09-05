# ADR-30: Absorb ragen-docs into the monorepo as `apps/docs`

**Status:** Accepted
**Date:** 2026-09-01
**Supersedes:** nothing. **Related:** [ADR-26](26-absorb-ragen-worker-into-monorepo.md), [ADR-29](29-move-the-main-app-into-apps-web.md)

## Context

The documentation site lived in its own repository, `WebAmigos/ragen-api-docs`
— a Docusaurus 3 site with 27 tracked files and no code shared with anything.
It was the last piece of the platform outside the monorepo apart from
`ragen-token-vault`, `ragen-mcp` and `ragen-deploy`.

Being separate cost something specific. The docs describe the API surface and
the self-hosting story, and both move in this repository. A pull request that
changed either could not carry the documentation change with it, so the two
drifted, and the drift was invisible until someone read both. The most recent
docs commit — reframing the whole site around self-hosting — landed days after
the self-hosting work it describes, in a repository with no link back to it.

It also had its own dependency line. Node 18 in `engines`, its own TypeScript
pin, `yarn.lock` against everything else's npm, and a Dockerfile that assumed
its own directory was the build context.

## Decision

Move it to `apps/docs` as an npm workspace, on the same terms as every other
app since ADR-26.

- `yarn.lock` is dropped; the site resolves from the root `package-lock.json`.
- TypeScript is aligned to the monorepo's `~5.7.0` rather than pinning `~5.6.2`
  and nesting a second copy. `engines.node` moves to `>=24` to match the rest.
- The Dockerfile takes the repository root as its build context and copies
  every workspace manifest, because npm validates the whole tree against the
  root lockfile. `railway.toml` uses a root-relative `dockerfilePath`, so that
  service's Root Directory stays unset — the same shape as `apps/web`,
  `apps/api`, `apps/worker` and `infra/*`.
- Turbo picks it up automatically. `build.outputs` gains `build/**` so the
  Docusaurus output is cached like the other apps' artifacts.
- A `Docs / Build` CI job runs on every PR. Docusaurus fails the build on a
  broken internal link, so this is a link check as much as a compile — the
  standalone repository never had one.

### Docusaurus 3.7 → 3.10.2

Not cosmetic, and the reason the first build attempt failed. Docusaurus 3.7
depends on `webpackbar` 6, which passes `{name, color, reporters}` to webpack's
`ProgressPlugin`. Webpack accepted those through 5.97 and rejects them in
5.106. In its own repository the site resolved webpack 5.97 and was fine; in
the monorepo, npm hoists the 5.106 that `apps/api`'s NestJS toolchain pulls in,
and Docusaurus resolves that instead.

Pinning webpack under `apps/docs` would have worked and is what `apps/worker`
does for `@temporalio`. It was rejected here because the constraint is not a
real one — it is a transitive incompatibility already fixed upstream, and
pinning would have frozen the docs site behind whatever webpack the API happens
to want. Docusaurus 3.10.2 ships `webpackbar` 7, which builds against 5.106.

## Consequences

**Good.** Documentation changes ride in the pull request that makes them
necessary. One lockfile, one Node version, one CI configuration. Broken
internal links now fail a PR.

**Cost.** 980 packages enter the root lockfile — Docusaurus's tree is large,
and it is now installed by anyone running `npm ci` at the root, including CI
jobs that never touch the docs. One package was removed and twelve transitive
versions drifted upward (babel helpers, `caniuse-lite`, `electron-to-chromium`);
nothing any workspace pins directly moved.

**Not done.** The old repository is not deleted here — it stays as history
until the Railway service is repointed at this one. `ragen-token-vault`,
`ragen-mcp` and `ragen-deploy` remain separate; see ADR-31 for what was taken
from the last of those.

> **Update 2026-09-05:** `ragen-mcp` was renamed on GitHub to
> `ragen-connectors` (`github.com/webamigos/ragen-connectors`) — same
> repository, same "stays separate" status described above, name only.
