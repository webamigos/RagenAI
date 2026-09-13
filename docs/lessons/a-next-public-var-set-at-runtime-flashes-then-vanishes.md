---
title: 'A NEXT_PUBLIC_ variable set only at runtime renders on the server and disappears on hydration, and a placeholder value for one is worse than none'
modules: ['web', 'admin']
areas: ['architecture', 'deployment']
topics:
  [
    'nextjs',
    'environment-variables',
    'docker',
    'railway',
    'build-args',
    'hydration',
    'silent-failure',
    'architecture-tests',
  ]
---

# A NEXT_PUBLIC\_ variable set only at runtime renders on the server and disappears on hydration, and a placeholder value for one is worse than none

**Context**: the demo deployment was supposed to print its shared account's credentials above the sign-in form. `NEXT_PUBLIC_DEMO_EMAIL` and `NEXT_PUBLIC_DEMO_PASSWORD` were set as Railway service variables, the environment was rebuilt, and the box still did not appear — except that the operator caught it appearing for a fraction of a second and then vanishing.

**Problem**: `apps/web/Dockerfile` declared a build arg for one `NEXT_PUBLIC_*` name and no others. Next inlines `process.env.NEXT_PUBLIC_*` into the bundle at build time, and Railway hands a service variable to a Dockerfile build only through a matching `ARG` — so the compiled JavaScript held `undefined` no matter what the service was set to. The blink is the diagnostic: the server render read the live environment and drew the box, then hydration ran the bundle's compiled-in `undefined` and unmounted it. Nothing in the build, the deploy or the server logs mentions any of this; the only signal is a hydration mismatch in the browser console and an element that is there and then is not.

Auditing the rest of the file turned up the sharper half. The Dockerfile keeps a block of placeholder credentials so `next build` can collect page data, labelled "not used at runtime" — true of a server-side secret, false of an inlined one, because for a `NEXT_PUBLIC_*` variable the bundle **is** the runtime. `NEXT_PUBLIC_PUSHER_KEY="dummy"` sat in that block, and `notification-client.ts` chooses Pusher over the SSE fallback on the key's presence alone: every Docker-built deployment had been subscribing to a Pusher app that does not exist instead of falling back. A missing variable degrades to its fallback; a fake one takes the configured path with a value that cannot work.

**Rule**: a `NEXT_PUBLIC_*` variable is build input, not deploy config. Every name the app reads needs an `ARG`/`ENV` pair in the Dockerfile, and none of them may be given a literal — give the `ARG` a default when the code needs one, and let empty mean unconfigured so the code's own fallback decides. Setting one on the deployed service and restarting proves nothing; only a rebuild does. When a feature appears and then vanishes on load, suspect an inlined variable before suspecting the feature.

**Applies to**: `apps/web` and `apps/admin`, both built from a Dockerfile on Railway. `tests/architecture/next-public-vars-reach-the-build.test.ts` is the tripwire for `apps/web`: it fails when a name read under `apps/web/src` has no `ARG`, and when any `NEXT_PUBLIC_*` is assigned a literal value. Related: [a-hardcoded-analytics-id-tracks-every-self-hoster.md](a-hardcoded-analytics-id-tracks-every-self-hoster.md), which records the same Railway `ARG` requirement from the other direction.
