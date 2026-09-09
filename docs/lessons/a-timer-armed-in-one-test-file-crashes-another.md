---
title: 'A library timer armed in one test file crashes a different one after teardown — and the report blames the wrong file'
modules: ['web']
areas: ['testing']
topics:
  ['vitest', 'jsdom', 'better-auth', 'nanostores', 'teardown', 'flaky-tests']
---

# A library timer armed in one test file crashes a different one after teardown — and the report blames the wrong file

**Context**: CI on [#897](https://github.com/webamigos/ragenai/pull/897), a PR touching only ESLint configuration and two `package.json` files, failed the `Test` job. The output was:

```
Test Files  219 passed (219)
     Tests  1871 passed | 1 skipped | 1 todo (1873)
    Errors  1 error
ReferenceError: window is not defined
 ❯ Object.cleanupBroadcastSetup  better-auth/dist/client/broadcast-channel.mjs:35
 ❯ Object.cleanup                better-auth/dist/client/session-refresh.mjs:109
 ❯ Timeout._onTimeout            nanostores/lifecycle/index.js:139
This error originated in "…/ManageKnowledge/Folders/__tests__/EditFolderDialog.test.tsx"
```

**Problem**: three things about that report are misleading, and each one sends you somewhere useless.

_The named file is innocent._ `EditFolderDialog.test.tsx` has nothing to do with authentication, and running it alone passes 28/28. Vitest attributes an unhandled error to whatever was executing when it surfaced, not to whatever caused it. The real culprit is any earlier file that rendered a component calling `useSession()`.

_Every test passing does not mean the job passes._ The failure is an unhandled rejection outside any test body, so the assertion count is a perfect 1871/1871 and the job is still red. Reading only "Tests: 1871 passed" tells you nothing.

_The mechanism spans two libraries and a full second._ Better Auth's `createAuthClient` builds a nanostores atom for the session. nanostores does not tear an atom down when its last subscriber leaves — it schedules the teardown on a `setTimeout` of `STORE_UNMOUNT_DELAY` (one second). Better Auth's teardown then calls `window.removeEventListener` to dismantle its cross-tab broadcast channel. So a component unmounting at the end of one test leaves a timer that fires up to a second later, by which point Vitest may have disposed that file's jsdom environment and `window` no longer exists.

That makes it timing-dependent, and therefore rare and machine-specific: **it did not reproduce in three local full-suite runs, including `vitest run --coverage`, the exact command CI runs.** Re-running the identical commit on CI went green, which is the tell that no code in the PR was involved.

Only two of the repository's test files mocked `@/app/hooks/use-better-auth` themselves. Every other file that rendered an authenticated component got the real client, so the hazard was spread across most of the suite while looking like a property of one dialog.

**Rule**: a browser-client library that a test only touches transitively still gets to schedule work after the test ends. Mock it once in `apps/web/vitest-setup.ts` rather than per file — the same reasoning that put the `ResizeObserver` stub there, after ten files had each defined their own copy and pass/fail depended on which ran first.

More generally: when a CI failure names a file whose subject has nothing to do with the error, treat the filename as a timestamp rather than an address. Check whether the run is reproducible at all before changing the named file, and check whether the PR's diff could plausibly reach the failing code — for #897 it could not, and a re-run proved it. Fixing the accused file would have been fixing nothing.

Note the fix here is justified mechanically, not empirically: with `createAuthClient` mocked no atom is created, so no timer is armed. There is no before/after demonstration, because the symptom could not be summoned on demand. When that is the situation, say so and pin the mechanism down with a test, so the mitigation cannot be deleted silently.

**Applies to**: `apps/web`'s Vitest suite, and any future dependency whose client schedules cleanup on a timer — session stores, websocket clients, analytics SDKs, anything registering `window` or `document` listeners at module or hook level.
