---
title: 'tsc does not set the executable bit and npm does, so a published CLI works while the same CLI in the workspace answers "Permission denied"'
modules: ['create-ragen-app', 'ragen-cli']
areas: ['dependencies', 'ci']
topics: ['npm', 'bin', 'tsc', 'build-outputs', 'publishing', 'npx', 'architecture-tests']
---

# tsc does not set the executable bit, and npm does

**Context**: verifying the `create-ragen-app` 0.6.2 release by typing the
obvious command in the obvious directory — `npx create-ragen-app`, from the
repository root.

**Problem**:

```
sh: /…/ragen-app/node_modules/.bin/create-ragen-app: Permission denied
```

Which reads like a broken install, or a permissions problem on the machine. It
is neither. Two facts meet:

- **Inside this repository, `npx <name>` resolves the workspace**, not the
  registry. `node_modules/.bin/create-ragen-app` is a symlink to
  `packages/create-ragen-app/dist/index.js`.
- **`tsc` writes that file mode 644.** It has no notion of a `bin` entry, and
  nothing else in the build chain set the bit either.

npm sets it when it *installs* a package, chmodding everything named in `bin`.
Not at pack time — worth checking rather than assuming, because it is the whole
explanation:

```
$ tar tvf create-ragen-app-0.6.1.tgz | grep dist/index.js
-rw-r--r--  0 0  0  409  package/dist/index.js        # the published tarball

$ ls -l ~/.npm/_npx/*/node_modules/create-ragen-app/dist/index.js
-rwxr-xr-x  1 …                                       # the same file, installed
```

So the published package had always worked, from a tarball that is itself mode
644, and the workspace copy had never worked — in either package that ships a
command. Nobody had typed the bare form before.

Note which way that cuts. The local artifact was broken and the published one
was fine, so every test, every CI job and every real install passed. The only
way to see it was to use the repository the way a contributor would.

**Rule**: a workspace that declares `bin` has to make its own build output
executable — `"build": "tsc -p tsconfig.json && chmod +x dist/index.js"` — and
the file it points at needs a shebang. Neither half is worth anything alone: no
bit and the shell refuses to run it, no shebang and the kernel answers "Exec
format error", which is an even less obvious message.

Guarded by `tests/architecture/a-published-bin-is-executable.test.ts`, which
reads the manifests rather than `dist/`: a guard that inspects build output
answers for whatever was built last and passes vacuously on a tree nobody has
built.

The larger rule, and this is the **third** time this package has paid for it:
**the working tree is not what ships, in both directions.** The other two —

- `npm pack` honours `files`, so the workspace resolved files the tarball does
  not carry, and the installer's CI job now tests the packed tarball rather
  than the workspace;
- `npm version --workspace` neither commits nor tags, so 0.2.0 went to the
  registry from a bump that then sat uncommitted, and `main` served an older
  number than npm did.

Each time the two artifacts differed, one of them was correct, and every check
looked at that one.

**Applies to**: any workspace with a `bin` field — today
`packages/create-ragen-app` and `packages/ragen-cli` — and to verifying a
release by hand.
