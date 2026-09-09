---
title: 'A Playwright browser cache keyed to a semver range serves the wrong chromium build, and skipping the install on a cache hit turns that into a red main'
modules: ['ci', 'web', 'admin']
areas: ['ci', 'testing']
topics: ['github-actions', 'caching', 'playwright', 'e2e', 'cache-keys', 'fail-open']
---

# A Playwright browser cache keyed to a semver range serves the wrong chromium build, and skipping the install on a cache hit turns that into a red main

**Context**: both e2e workflows (`e2e.yml`, `admin-e2e.yml`) cached `~/.cache/ms-playwright` and skipped `playwright install` when the cache hit. The key came from the lockfile:

```yaml
run: echo "PLAYWRIGHT_VERSION=$(node -e "console.log(require('./package-lock.json').packages[''].devDependencies['@playwright/test'])")" >> "$GITHUB_ENV"
key: ${{ runner.os }}-playwright-${{ env.PLAYWRIGHT_VERSION }}
```

That field is the **declared range** — `^1.63.0` — not the version npm resolves. It does not move when the lockfile does.

**Problem**: every test in both suites failed in ~2 ms with

```
browserType.launch: Executable doesn't exist at
/home/runner/.cache/ms-playwright/chromium_headless_shell-1243/…
```

Two pushes to `main` fifteen seconds apart split on it: `a261b7d2` green, `f88fca27` red. The difference was not the code — `f88fca27` only deleted dead components and three dependencies. It was that touching `package-lock.json` changed the **node_modules** cache key, so that job installed dependencies fresh while the green one restored them.

The two caches had been holding each other up. `~/.cache/ms-playwright` held the chromium build an older `playwright-core` wanted; the node_modules cache kept handing that older core back, so nobody noticed. A fresh install resolved the current core, which wants build 1243 — never downloaded, because the browser cache "hit" and the install step was skipped. One cache was stale, the other hid it, and the pair stayed consistent until an unrelated lockfile edit desynced them.

Worth stating plainly: **a red e2e job here had nothing to do with the change that turned it red**, and the change that exposed it never touched a test, a workflow or a browser.

**Rule**:

- Key a binary cache on the **resolved** version, not on a declared range: `packages['node_modules/playwright'].version`. A key that cannot change cannot invalidate.
- **Do not skip `playwright install` on a cache hit.** It already skips browsers it has, so it costs a second when the cache is good and repairs the cache when it is not. `if: cache-hit != 'true'` converts a stale entry from a slow run into a total failure.
- A cache is an optimisation. If a wrong cache entry can fail the build rather than slow it, the step is wrong, not the cache.
- When two caches in one job describe the same dependency, expect them to desync eventually — and check what happens when exactly one of them misses.

**Applies to**: `.github/workflows/e2e.yml`, `.github/workflows/admin-e2e.yml`, and any workflow caching a downloaded toolchain (browsers, sandboxes, model weights) beside a `node_modules` cache.
