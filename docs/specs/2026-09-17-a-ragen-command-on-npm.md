---
title: A `ragen` command published on npm
status: in-progress
areas: [api, auth, mcp, self-hosting]
adrs: [13, 32, 37, 38]
---

# A `ragen` command published on npm

## TLDR

A globally installable CLI — `npm i -g ragen-cli`, which puts a `ragen`
command on your PATH — that talks to a Ragen install the way `gh` talks to
GitHub. The non-obvious part is that the command everyone
asks for first, `ragen plugin install`, has nothing to install: ADR-38 sanctions
MCP as the plugin API but records that **none of it is built**. So the package
ships in phases, and Phase A exists mostly to own the name.

The package is **`ragen-cli`**, not `ragen`: npm's similarity filter refuses
the unscoped name against the existing `raven` and `hygen`, for everyone, so it
was never available to claim — see
[the lesson](../lessons/npm-can-refuse-a-new-unscoped-name-and-says-so-last.md).
`bin` is independent of `name`, so the command is still `ragen`.
`create-ragen-app` is already published from this repository at 0.6.1, so the
packaging path is known rather than guessed.

## Open Questions

<!--
Per docs/specs/README.md this is a hard gate for Phases B onward. Phase A is
deliberately written so that none of these change it — the name can be claimed
before any of them are answered.
-->

- **Q1.** What does `ragen plugin install <x>` install? Two readings, and they
  share almost no code:
  **(a) local** — edits a self-hosted install on disk (`.env`, compose,
  restart), or **(b) remote** — registers a custom MCP connector in a running
  organization over the public API. (b) is the one that needs ADR-38 Tier 1;
  (a) needs nothing new and is arguably just `$EDITOR .env`.
  *Recommendation: (b).*
- **Q2.** Does `ragen` absorb `create-ragen-app`, or delegate to it?
  `npm create ragen-app` is the idiomatic scaffolding entry point and is
  already documented and exercised by `installer.yml`; a second copy of the
  wizard is a second thing to keep in step with the env manifest.
  *Recommendation: keep `create-ragen-app` as the scaffolder; `ragen create`
  delegates to it and is a convenience, never a fork.*
- **Q4.** What does the CLI authenticate as? API keys are opaque and carry no
  org context (ADR-13), and they live in the token vault (ADR-32). A CLI needs
  a durable local credential; is an API key pasted into `ragen login` the
  answer, or does this need a device-code flow against Better Auth?
  *Recommendation: API key for Phase B, device flow only if asked for.*
- **Q5.** Is the CLI in this monorepo or its own repository? It publishes on
  its own cadence and depends on the public API, not on internal packages —
  ADR-32's "measure the drift first" test applies.
  *Recommendation: here, as `packages/ragen-cli`, until it has a release
  cadence of its own.*

## Problem

There is no way to do anything with Ragen from a terminal. Every operation —
uploading a document, checking whether an install is healthy, adding a
connector — is a panel click or a hand-rolled `curl` against `apps/api` with a
key pasted from a password manager.

Three concrete gaps:

- **Self-hosters have no diagnostics.** `create-ragen-app` scaffolds an install
  and then stops. When the result does not work, the answer today is to read
  logs across five apps. The installer has already collected a registration
  deadlock, a rephrase model pointing at absent credentials, and an embedding
  model it could not serve — each reported by a stranger whose install did not
  work.
- **There is no extension story with a front door.** ADR-38 makes MCP the
  plugin API and notes the thing it lacks is "a name, a published contract, and
  the ability for anyone outside Web Amigos to point Ragen at their own
  server". `ragen plugin install` is what that front door looks like.
- **The name is unclaimed.** `ragen` on npm is free today and permanently gone
  the day someone else takes it.

## Out of scope

- **A plugin marketplace, registry or catalogue.** ADR-38 calls this Tier 3
  and rejects it until the tenant-scope guard throws rather than warns. A CLI
  does not change that calculus.
- **Any in-process plugin runtime.** Same ADR: third-party code stays out of
  process. `ragen plugin install` configures an outbound MCP connection; it
  never downloads code that Ragen executes.
- **A second scaffolding wizard.** See Q2.
- **Managing the hosted product's billing, orgs or users.** Platform-admin
  surface lives in `apps/admin` (ADR-35).
- **Shell completions, Homebrew, a single-binary build.** All reasonable, none
  needed to claim the name or prove the shape.

## Proposed solution

A new workspace, `packages/ragen-cli`, published as `ragen-cli`, modelled directly
on `packages/create-ragen-app`. The rejected alternatives:

**Answered by the registry, 2026-09-17** (was Q3, who owns the unscoped name):
nobody can. npm refuses `ragen` as too similar to `raven` and `hygen`. The name
is `ragen-cli`; `@ragenai/cli` remains available as a defensive scoped publish,
and an appeal to npm support for `ragen` can run in the background without
blocking anything. Because the filter blocks the name for every account, there
is no squatting risk to race.

The rejected alternatives:

- **Publish a placeholder with no behaviour.** It claims the name at the cost
  of the first impression, and an empty package tends to stay empty. Phase A
  instead ships something small that works.
- **Wait until ADR-38 Tier 1 is built.** That is a quarter of work on the
  connector side, and the name is claimable by anyone in the meantime.
- **Scope it as `@ragenai/cli`.** Bypasses the filter and matches the
  monorepo's internal `@ragenai/*` convention, but needs an npm organization and
  is less discoverable for an OSS CLI. Worth registering defensively later;
  not the primary name.

### Packaging, and why it is copied rather than reinvented

`create-ragen-app` solved each of these once; the skeleton inherits all of it.

| Decision | Why |
|---|---|
| `tsconfig.json` emits **CommonJS**, `moduleResolution: node` | The repo is `"type": "module"`, but a published `bin` run by `npx`/global install resolves a plain CommonJS entry with no module-type ambiguity. The comment in `packages/create-ragen-app/tsconfig.json` says so. |
| No `"type"` field in `package.json` | Node resolves the nearest `package.json` to `dist/index.js`; omitting it keeps the output CommonJS regardless of the root. |
| `#!/usr/bin/env node` in `src/index.ts` | Without it a global install produces a file the shell cannot run. |
| `files: ["dist"]`, `prepack` runs `clean` then `build` | `files` publishes `dist` wholesale, so a stale artefact ships unless the build cleans first. |
| **Zero runtime dependencies** in Phase A | Keeps `npm i -g` instant and the supply chain empty. `@clack/prompts` and an HTTP client arrive with Phase B, when there is something to prompt for. |
| `engines.node: ">=20"` | Deliberately *not* the repo's `>=24`. `node-version.ts` already makes this argument for the installer: the *installation* needs Node 24; the tool talking to it does not, and a client that refuses on Node 22 is untrue and unhelpfully broad. |

### Command surface

Phase A ships the first three; the rest print what they will be and exit
non-zero, so `ragen plugin install` never looks like it silently did nothing.

```
ragen create [dir]   scaffold a self-hosted install (delegates to create-ragen-app)
ragen help
ragen version

ragen login          authenticate against an install        (Phase B)
ragen doctor         check an install's configuration       (Phase B)
ragen kb upload      push a document into a knowledge base  (Phase C)
ragen plugin ...     manage custom MCP connectors           (Phase D, blocked on ADR-38 Tier 1)
```

## Core surfaces touched

| Surface | Change | What catches a mistake |
| --- | --- | --- |
| `prisma/schema.prisma` | **None** in A–C. Phase D adds `CUSTOM` to `McpConnectorProvider` and widens `McpConnector`'s unique constraint (today `[organizationId, userId, provider]`, which admits exactly one custom connector per user) | migration + `npm run verify` |
| `packages/env` | None. The CLI reads its own config file and `RAGEN_*` variables from the user's shell; it is not a Ragen service and must not import the app's env contract | — |
| `apps/api` | Phase B adds a read-only health/identity endpoint; Phase D adds connector registration | its own tests; API keys stay opaque per ADR-13 |
| auth / tenant scoping | Every CLI call is an ordinary API-key call. The CLI derives no org from user input — the key does | existing guards |
| `lint-staged.config.mjs` | One entry, `'packages/ragen-cli': 'ragen-cli'` | `tests/architecture/lint-staged-covers-every-workspace.test.ts` derives the expected set from the filesystem and fails until the map agrees |
| `packages/create-ragen-app` | None. `ragen create` shells out; it does not import it | `installer.yml` still exercises the real first-run path |

## Data model

Nothing until Phase D.

Phase D's migration is additive — a new enum value and a wider unique
constraint — so existing rows need no backfill. The constraint widening is the
part to review: rows written under the old constraint remain valid under the
new one, but any code that relied on "at most one connector per provider per
user" stops being true the day the migration lands, whether or not a custom
connector exists yet.

On the client side, credentials live in `~/.ragen/config.json`, mode `0600`,
with `RAGEN_API_URL` and `RAGEN_API_KEY` taking precedence so CI never writes a
file. A key is never echoed back, including in `--verbose` output.

## Failure modes

- **`ragen create` and `npx` is unavailable or offline.** Print the exact
  `npx create-ragen-app` command instead of failing opaquely.
- **The CLI is newer than the install it talks to** (or older). Phase B's first
  call reads a version from the API and refuses politely on a mismatch it
  cannot support. A self-hosted fleet will run many versions at once; this is
  the normal case, not the edge case.
- **An install behind Vercel/Cloudflare auth returns an HTML login page with
  200.** Detect a non-JSON body and say so, rather than reporting a parse
  error.
- **A stale or revoked API key.** One clear message naming the config file,
  never a 401 dump.
- **Two shells racing on `~/.ragen/config.json`.** Write via a temp file and
  rename; last writer wins, and nothing is left truncated.
- **Phase D: a connector URL pointing somewhere hostile.** ADR-38 requires an
  operator allowlist defaulting to empty, and treats the connector's prompt
  fragment as untrusted input reaching the system prompt. The CLI is an
  additional way to set that row, not an exemption from it.

## Phases

### Phase A — the name, and one command that works

Independent of every open question.

- [x] **A1.** `packages/ragen-cli` with `package.json` (`"name": "ragen-cli"`,
  `bin` mapping the command `ragen`,
  `bin`, `files`, `publishConfig.access: public`, `engines`), the CommonJS
  `tsconfig.json`, `eslint.config.mjs` (`no-console` off for the entry point,
  as in `create-ragen-app`), `.gitignore`.
- [x] **A2.** `src/index.ts` (shebang, error boundary, exit code), `src/cli.ts`
  (pure command router, dependencies injected), `src/args.ts`,
  `src/commands.ts` — one table of `{ name, summary, status }` from which help
  output *and* the "not yet" message are derived, so the two cannot disagree.
- [x] **A3.** `ragen create [dir]` spawning `npx create-ragen-app@latest` with
  stdio inherited, injected as a function so the router stays testable.
- [x] **A4.** Unit tests beside the source: argument parsing, help text,
  unknown command, a planned command exiting non-zero, and the spawn binding
  (AGENTS.md is explicit that thin bindings get a test — they are the only
  place the wiring exists).
- [~] **A5.** Register the workspace: `lint-staged.config.mjs` done and its
  architecture guard passes, `check-config-path-globs` clean. **`npm run verify`
  and ESLint have not run** — this was built in a worktree with no
  `node_modules`, and `npm install --no-workspaces` cannot resolve this tree.
  They must run before the branch lands.
- [x] **A6.** A CI smoke job modelled on `installer.yml`: `npm pack`, install
  the tarball, run `ragen --help` and `ragen --version`. Exercise the artefact
  npm would serve, not the workspace.
- [x] **A7.** README covering the manual publish procedure — `npm version` →
  PR → merge → `npm publish` **from `main`**. Publishing first is exactly how
  the registry once ended up ahead of the repository, and npm versions are
  immutable.
- [ ] **A8.** Publish `ragen-cli@0.1.0`.
- [ ] **A9.** Ask npm support to release `ragen`; if granted, republish under it
  and leave `ragen-cli` pointing at the new name.

### Phase B — it can talk to an install

Blocked on Q4.

- [ ] **B1.** Config resolution: `RAGEN_API_URL` / `RAGEN_API_KEY` over
  `~/.ragen/config.json`, written `0600` via temp-file rename.
- [ ] **B2.** `ragen login` / `ragen logout`, key never echoed.
- [ ] **B3.** A read-only identity/health endpoint in `apps/api`, plus the
  version-skew check.
- [ ] **B4.** `ragen doctor`: reachability, key validity, configured model,
  vector store, worker queue — the questions a stranger's broken install
  actually raises.

### Phase C — it does something worth scripting

- [ ] **C1.** `ragen kb list` / `ragen kb upload <file>`.
- [ ] **C2.** `--json` on every read command, so it composes with `jq`.

### Phase D — `ragen plugin`

Blocked on Q1 and on ADR-38 Tier 1 being built. **This phase does not start
before that work is a spec of its own**; the CLI is the last mile, not the
feature.

- [ ] **D1.** (ADR-38 Tier 1, separate spec.) `CUSTOM` connector, widened
  constraint, host allowlist, prompt-fragment handling, published contract.
- [ ] **D2.** `ragen plugin list` / `install <url>` / `remove`, plus
  `lastError` surfaced at the point of failure — a plugin that breaks otherwise
  looks exactly like Ragen breaking.

## Testing

- **Unit** (`packages/ragen-cli/src/__tests__`, picked up by the root vitest
  `packages/*/src/**/*.test.ts` include, counted in coverage): the router, the
  parser, the command table, the spawn binding.
- **Package smoke in CI** (A6): the packed tarball runs.
- **No e2e tier applies.** The CLI is not a web surface, so `smoke-*`/`p0-*`
  are the wrong instrument; the tarball job is what gates a merge.
- **Phase B onward**: an integration test against a locally running `apps/api`,
  and a test that a 200 HTML login page is reported as such.

## Rollout and rollback

No feature flag — nothing in the product changes. Phase A's only externally
visible act is a publish.

Rollback is the part worth stating plainly: **an npm publish cannot be undone.**
`npm deprecate` and a follow-up version are the only remedies; unpublishing is
limited to 72 hours and burns the version number permanently. So A8 happens
after A1–A7 are merged to `main`, and the tarball that is published is the one
CI already installed and ran.

Phase D's migration reverts by reverting the migration, but only while no
custom connector rows exist — after that, a down-migration drops customer
configuration and needs its own plan.
