---
title: "Adding a config file at an app root moves tsc's rootDir, so the build emits dist/src/main.js, exits 0, and the container cannot start"
modules: ['api']
areas: ['architecture', 'ci', 'deployment']
topics: ['typescript', 'rootdir', 'nestjs', 'build-outputs', 'turborepo', 'false-green', 'architecture-tests']
---

# Adding a config file at an app root moves tsc's rootDir, so the build emits dist/src/main.js, exits 0, and the container cannot start

**Context**: `apps/api` builds with `nest build`, which runs tsc over
`tsconfig.build.json`. Every source file lives under `src/`, and `start:prod`
and the Dockerfile `CMD` both name `dist/main.js`.

**Problem**: tsc has no `rootDir` set here, so it derives one — the common
ancestor directory of all its input files. While every input is under `src/`,
that ancestor is `src/` and `src/main.ts` emits to `dist/main.js`.

The jest→vitest migration added `vitest.config.ts` and `vitest.e2e.config.ts`
at the app root. They are `.ts`, so they were inputs. The common ancestor
climbed one level to the app root, and the entire tree shifted down: the app
emitted to `dist/src/main.js`, and `dist/main.js` stopped existing.

Nothing static caught it. `nest build` exits 0 — the compile genuinely
succeeded, it just wrote somewhere else. `turbo run build` reported 9 tasks
successful. Typecheck and lint are unaffected; so is the whole unit suite,
which never touches `dist/`. The CI **Build** check was green.

The only job that noticed was `test-e2e`, and it reported the symptom rather
than the cause, 60 seconds later:

```
apps/api failed to start within 60s:
Error: Cannot find module '/home/runner/work/RagenAI/RagenAI/apps/api/dist/main.js'
```

which reads like a build that did not run at all. `prisma.config.ts` had
already been excluded from that tsconfig for exactly this reason, with no
comment saying why — so the trap was rebuilt the moment a second root config
file appeared.

**Rule**: a `.ts` file at an app root is a build input, and every build input
votes on `rootDir`. Exclude it from `tsconfig.build.json`, or set `rootDir`
explicitly. After any change that adds one, check the emit layout — `ls
dist/main.js` — rather than the build's exit code. A build's exit code says the
compiler was happy, not that it produced the artifact the start command names.

`tests/architecture/build-output-stays-where-the-start-command-looks.test.ts`
enforces this now: it enumerates root-level `*.config.ts` files in `apps/api`
and asserts each is excluded, so a third one fails at test time instead of at
container start.

**Applies to**: `apps/api` directly. Any workspace compiling with an implicit
`rootDir` has the same exposure — `apps/worker` happens not to, but that is a
property of its tsconfig, not a guarantee.
