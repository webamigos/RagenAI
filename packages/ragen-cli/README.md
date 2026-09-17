# ragen-cli

The command line for [Ragen AI](https://docs.ragen.ai) — a self-hosted RAG chat
platform with document knowledge bases, an in-process model gateway and a
public API.

```bash
npx ragen-cli@latest help     # no install
npm install -g ragen-cli      # or install it, then just `ragen`
```

Reach for `npx` while the only substantial command is `create`, which you run
once per installation. Install it globally when you run it often — and expect to
upgrade it yourself, because a global CLI goes stale without saying so.

## The package is `ragen-cli`; the command is `ragen`

npm refuses the unscoped name `ragen` — its similarity filter reads it as too
close to the existing `raven` and `hygen`, and returns 403 to anyone who tries,
not just to us. `bin` is independent of `name`, so the command you type is
unaffected.

The split only bites with `npx`, which resolves a **package**: `npx ragen-cli`
works, `npx ragen` looks for a package that does not exist. (It may appear to
work on a machine that already has the CLI installed globally — npx runs a
binary it finds on `PATH` before it fetches anything.)

## What works today

```
ragen create [dir]   scaffold a self-hosted Ragen installation
ragen help
ragen version
```

`ragen create` delegates to
[`create-ragen-app`](https://www.npmjs.com/package/create-ragen-app) and
forwards its arguments unchanged, so this is equivalent:

```bash
npx --yes create-ragen-app@latest ./my-ragen --skip-docker
ragen create ./my-ragen --skip-docker
```

`--yes` and `@latest` are what `ragen create` passes, so the two lines above run
the same version without a confirmation prompt. A bare `npx create-ragen-app`
may reuse whatever copy npx has cached.

The scaffolder stays the scaffolder. It is the only thing exercising the
first-run path, CI runs it on every pull request, and a second copy of that
wizard living here would drift from the environment manifest without anything
noticing.

## What does not work yet

`login`, `doctor`, `kb` and `plugin` are listed in `ragen help` under **Not
built yet**. Running one prints what it is waiting on and **exits non-zero**,
so a script cannot mistake it for a no-op that succeeded.

`ragen plugin` in particular waits on custom MCP connectors. Ragen's extension
API is MCP — third-party code runs out of process and never inside the app —
and the piece that lets an organization point Ragen at its own server is
designed but not built. See ADR-38 in the main repository.

## Versioning

This CLI talks to an installation over the public API, and a self-hosted fleet
runs many versions at once. Its version number describes the client, not the
server it is pointed at.

## Node

`engines` asks for Node 20 or newer, which is deliberately lower than the Node
24 a Ragen *installation* requires. This is a client; refusing to print help on
Node 20 would be untrue and unhelpfully broad. `ragen create` inherits
`create-ragen-app`'s own check, which refuses at the point where a too-old Node
would actually damage the install.

## Publishing (manual)

There is no publish job in CI. From a clean checkout:

```bash
npm version <patch|minor|major> --workspace=ragen-cli
```

Land that on `main` **before** publishing. npm versions are immutable: a
publish that runs ahead of the repository cannot be corrected by re-publishing,
only by pushing the commit that should have gone first, and `npm unpublish` is
limited to 72 hours and burns the version number permanently.

```bash
npm publish --workspace=ragen-cli
```

`prepack` runs `clean` before `build` deliberately — `files` publishes `dist`
wholesale, so without the clean a deleted source file lingers in the tarball.

Then exercise what was actually published, not what was packed:

```bash
npm install -g ragen-cli@latest && ragen --version
```

## Licence

Apache-2.0.
