---
title: 'A build that fetches its fonts fails on whatever Google answers — and self-hosting two subsets puts a fallback between them'
modules: ['web', 'admin', 'ci']
areas: ['ci', 'frontend']
topics: ['nextjs', 'next-font', 'turbopack', 'google-fonts', 'flaky-builds', 'self-hosting', 'false-red']
---

# A build that fetches its fonts fails on whatever Google answers — and self-hosting two subsets puts a fallback between them

**Context**: `apps/web` and `apps/admin` loaded Inter, Barlow Condensed and Geist with `next/font/google`, which downloads the CSS and the font files while `next build` runs. On 2026-10-09 the `Build` job failed on two of three pushes to `main` with `next/font/google queries have exactly one entry`, while a pull-request run of the same tree, minutes apart, passed.

**Problem**: nothing in the repository had changed. Google sometimes serves the `css2` request with extensionless `fonts.gstatic.com/l/font?kit=…&skey=…&v=…` URLs instead of `/s/…/*.woff2`. Turbopack parses its font options as a query string, the `&` splits them, and the build fails; webpack fails on the missing extension ([vercel/next.js#99114](https://github.com/vercel/next.js/issues/99114), open). It reads as a flake because a re-run usually passes, and a diff of the two runs' environment, Next version and dependency cache shows nothing — the difference is in a response no log prints in full.

Moving to `next/font/local` brought a second, quieter bug. `next/font/local` gives every call its own family, so latin and latin-ext are two families in one stack, and Next follows each with a metric-adjusted local Arial (`adjustFontFallback`, on by default). Arial has ą ć ę ł: placed between the two subsets it answered for every Polish character, and the latin-ext file was never downloaded. The page looked fine at a glance — the fallback is metric-matched to look like the font.

**Rule**:

- A build must not depend on a third party's response. Serve fonts from the repository (`src/app/fonts/`, Fontsource files, OFL); `tests/architecture/fonts-are-not-fetched-at-build.test.ts` fails on a `next/font/google` import.
- When one face is split into several `next/font/local` calls, turn `adjustFontFallback` off on every call but the last in the stack.
- Check a font change in the browser with `document.fonts` and the resource list, on a page with the characters the subset exists for — not by looking at it.

**Applies to**: any `next/font` use in this monorepo, and any build step that reaches the network (`ThreadPDF.tsx` still fetches Roboto from `fonts.gstatic.com`, at runtime rather than at build).
