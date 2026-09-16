---
title: 'Moving a seam’s default variant adds a required variable to every workflow that boots an app — and the honest fix is a service, not a dummy value'
modules: ['ci', 'web', 'api', 'worker']
areas: ['ci', 'architecture']
topics:
  ['worker-runtime', 'bullmq', 'adr-44', 'github-actions', 'env-validation']
---

# Moving a seam’s default variant adds a required variable to every workflow that boots an app — and the honest fix is a service, not a dummy value

**Context**: ADR-44 made BullMQ the default worker runtime, and `WORKER_RUNTIME_SEAM` declares `REDIS_URL` required under BullMQ. A later change made the *producers* — apps/web and apps/api, which enqueue but never run jobs — validate that half of the seam at boot, so a deployment with no Redis fails at startup with the variable named rather than at the first upload with a Redis error three layers from the cause.

**Problem**: `e2e.yml` boots `apps/api` for real, and its workflow-level `env:` block had no `REDIS_URL`. It never needed one: while Temporal was the default, the seam demanded `TEMPORAL_SERVER_ADDRESS`, and four dummy `TEMPORAL_*` variables covered it until ADR-44 removed them. So a PR that touched no workflow turned `Start apps/api` red — `REDIS_URL is required when WORKER_RUNTIME is "bullmq"` — while every other check stayed green, because no other job starts that process. The requirement did not move to the app; it moved to the *default*, which every environment inherits without naming it.

**Rule**: when a seam's `defaultVariant` changes, or a new consumer starts validating one, enumerate every place that boots an app with no `.env` of its own — CI workflow `env:` blocks, the Helm values, the Dockerfiles, the installer's written config. A grep for the old variant's variables finds the environments that were configured for it; a grep for the new one's finds the ones already ready. Only a job that starts the process proves it, so treat "which check actually boots this app" as part of the change.

**And add the service, not a value.** The temptation on a CI failure like this is `REDIS_URL: 'redis://example.com'`, which boots the app and means nothing — exactly the workaround the producer rule was written against, since inventing a value is how a boot check stops being believed. The e2e suite drains no queue (the upload specs mock `/api/upload`), so a dummy would even have "worked"; a `redis:7-alpine` service costs one container and makes the variable name something that answers.

**Applies to**: `.github/workflows/e2e.yml`, and to any future move of a seam default in `packages/env/src/provider-seams.ts` — storage, encryption, speech and the worker runtime all have one.
