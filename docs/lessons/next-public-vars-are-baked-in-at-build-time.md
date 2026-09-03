---
title: 'A NEXT_PUBLIC_ variable is baked in at build time, so changing it on Railway changes nothing until the next build'
modules: ['web', 'admin']
areas: ['architecture']
topics: ['nextjs', 'environment-variables', 'railway', 'observability', 'self-hosting']
---

# A NEXT_PUBLIC_ variable is baked in at build time, so changing it on Railway changes nothing until the next build

**Context**: renaming the web app's OpenTelemetry service from `ragen-app` to `ragen-web` meant changing two defaults — `OTEL_SERVICE_NAME` for the server and `NEXT_PUBLIC_OTEL_SERVICE_NAME` for the browser. Both looked like the same kind of change: a fallback in code, overridable per environment. They are not.

**Problem**: Next replaces every `process.env.NEXT_PUBLIC_*` reference with a literal string when it compiles, so the value that ends up in the bundle is whatever was set **during `next build`** — not what the running container has. `apps/web/Dockerfile` sets `NEXT_PUBLIC_OTEL_SERVICE_NAME` in its build stage, so that line, not the runtime environment, decided the browser's `service.name`. An operator who sets the variable at runtime on a prebuilt image sees no effect at all, and there is no warning: telemetry keeps arriving under the old name and looks like the rename never landed. The non-`NEXT_PUBLIC_` sibling (`OTEL_SERVICE_NAME`, or `BETTER_AUTH_URL`) is read at runtime and behaves the way people expect. The same asymmetry decided which variable `emails/utils/base-url.ts` should prefer: a self-hoster running the published image can set `BETTER_AUTH_URL` and cannot meaningfully set `NEXT_PUBLIC_APP_URL`.

**Rule**: treat a `NEXT_PUBLIC_` variable as a build input, not configuration. Changing its value means rebuilding, and any Dockerfile build-stage default for it has to move with the code default in the same commit. When a value has to be settable by whoever *runs* the app — a self-hosted install, or an operator flipping something on Railway — read it from a variable without the prefix, and keep `NEXT_PUBLIC_` for values the browser genuinely needs inlined. When one value has both audiences, resolve the runtime variable first and let the public one be the fallback.

**Applies to**: `apps/web` and `apps/admin` (both Next apps), every `NEXT_PUBLIC_*` in `apps/web/Dockerfile`'s build stage and in Railway's service variables, and anything reachable from `src/instrumentation-client.ts`, `src/providers/Telemetry/` or `src/app/emails/`. Worth re-checking whenever a rename or a self-hosting question touches an environment variable the browser also reads.
