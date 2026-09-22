---
title: 'npm links a workspace entry whether or not the package is there, so a deleted package installs as a broken symlink and nothing reports it'
modules: ['web', 'api', 'admin', 'ci']
areas: ['dependencies', 'architecture']
topics:
  [
    'npm-workspaces',
    'lockfile',
    'npm-ci',
    'monorepo',
    'adr-49',
    'dead-code',
    'architecture-tests',
  ]
---

# npm links a workspace entry whether or not the package is there, so a deleted package installs as a broken symlink and nothing reports it

**Context**: #1194 retired the LiteLLM path (ADR-49, B6) and deleted
`packages/litellm-client/package.json` and its `src/`. Three things survived:
twenty compiled files under `dist/`, tracked because the root `.gitignore`'s
`/dist` is root-anchored and never covered a package's own; the
`"@ragenai/litellm-client": "*"` line in `apps/web`, `apps/api` and
`apps/admin`; and the matching entries in `package-lock.json`.

**Problem**: the obvious guess about what that costs is wrong, and it is worth
knowing which way. **`npm ci` never fails on it.** Both configurations were
measured on a real clone:

| `packages/litellm-client/` | `npm ci` | what lands in `node_modules` |
| --- | --- | --- |
| present, holding only `dist/` | exit 0, silent | symlink to a directory with no `package.json` |
| absent entirely | exit 0, silent | **dangling** symlink |

npm links a workspace from the lockfile entry without ever asking the directory
for a manifest, and the string `litellm-client` appears nowhere in the install's
output either way. What you get is a package that is installed and cannot be
imported: `Cannot find package '.../index.js'` when the directory is there,
`ERR_MODULE_NOT_FOUND` when it is not. The first report is a runtime resolve
error in whichever process reached for it — with no connection back to the
manifest line that caused it.

It stayed inert only because nothing imported it. The name was still in three
manifests, which is where an editor's autocomplete reads from.

Two other things helped it hide. `npm run verify` never runs `npm ci`, so the
gate has no opportunity to compare the lockfile against the manifests — and as
this shows, `npm ci` would not have complained anyway. And the guards that walk
`packages/*` — `packages-build-in-dependency-order`,
`lint-staged-covers-every-workspace` — each drop a directory whose
`package.json` will not parse. Sensible for a scratch directory, and exactly how
a workspace with no manifest becomes invisible instead of loud.

The cleanup has its own trap: `npm install` does **not** remove the stale
lockfile entry. It rewrote the three dependency blocks and dropped the
`node_modules` link entry, but left `packages/litellm-client` in the `packages`
map marked `"extraneous": true`, and a second `npm install` left it there too.
Removing the block by hand, clearing `node_modules/.package-lock.json` and
re-running is what settles it — and re-running is the part that proves npm does
not put it back.

**Rule**: **a workspace that something declares is a workspace that exists**,
and no npm command will tell you when that stops being true. Check it from both
directions, because they fail apart: the manifests are the source of truth and
catch a dangling dependency the moment it is written; the lockfile is the
generated artefact and catches the half a forgotten `npm install` leaves behind.
`tests/architecture/a-declared-workspace-exists.test.ts` does both, plus the
directory-without-a-manifest case that the other `packages/*` walkers skip.

When deleting a package, the deletion is not done at `rm -rf`: the dependency
lines, the lockfile entries and any tracked build output go in the same change.
Check for tracked output specifically — a package with no `.gitignore` of its
own has been committing its `dist/` all along.

**Applies to**: removing or renaming any workspace in this monorepo. Related:
[`npm install` prunes a node `npm ci` then demands back](npm-install-prunes-a-node-npm-ci-then-demands.md)
is the other half of "the gate cannot see the lockfile", and
[a retired file outlives the comments that name it](a-retired-file-outlives-the-comments-that-name-it.md)
is the same deletion-shaped residue one level up.
