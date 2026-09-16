---
title: 'Omitting a workspace from `npm ci --workspace=…` does not keep it out of the image — and the package you were trying to drop was not the big one'
modules: ['worker', 'ci']
areas: ['architecture', 'ci']
topics:
  [
    'docker',
    'npm-workspaces',
    'image-size',
    'worker-runtime',
    'temporal',
    'adr-44',
    'measurement',
  ]
---

# Omitting a workspace from `npm ci --workspace=…` does not keep it out of the image — and the package you were trying to drop was not the big one

**Context**: ADR-44 made BullMQ the worker runtime and left Temporal as an adapter. The plan for taking Temporal out of the published worker image was a one-line Dockerfile edit: drop `--workspace=@ragenai/jobs-temporal` from the `npm ci` that builds the production stage.

**Problem**: two assumptions in that plan were wrong, and building the image is what showed it.

- **A workspace omitted from `--workspace=` is still linked.** npm creates `node_modules/@ragenai/*` symlinks for every workspace in the tree and installs the linked package's own dependencies, whether or not the flag selected it. `docker run … ls node_modules/@ragenai` found `jobs-temporal` present in an image whose install never named it, together with the `@temporalio/client` it depends on.
- **The adapter was 136 KB. The SDK was 182 MB.** `@temporalio/worker` is a *production dependency of `apps/worker`* — nothing about the adapter — and it pulls `client`, `common`, `proto`, `activity`, `nexus` and `core-bridge`, whose prebuilt native binaries are 147 MB on their own. Dropping the adapter would have removed about 0.07% of what the phase was named after.

What kept the SDK in place was not the manifest alone. `activities/loaders/load-website.ts` imported `ApplicationFailure` from `@temporalio/workflow` for a single validation, in an activity that **both** engines run — so the module graph of a BullMQ start reached the SDK no matter what the Dockerfile said.

**What worked**: make every Temporal import conditional, then move the packages to `devDependencies`, where the production install's existing `--omit=dev` reaches them. The activity throws the seam's `JobFailure`; `temporal-runtime.ts` translates it to `ApplicationFailure` at the activity boundary, which is the half the port never wrote (a plain `Error` out of a Temporal activity is *retryable*, so a non-retryable failure would have been retried under the activity's own policy before failing anyway). Result, measured on two real builds: **1.19 GB → 1.01 GB**, and `@temporalio` inside the image **182 MB → 13 MB**.

**Rule**: for anything about what an image *contains*, build it and look. `docker run --rm --entrypoint sh <image> -c 'du -sh node_modules/<pkg>'` answers in seconds what a Dockerfile diff only suggests, and it is the only thing that distinguishes a dependency you removed from one npm re-added through a link. Before cutting a dependency to shrink an image, measure which dependency holds the bytes — a package's *position* in a plan (the adapter, the seam, the thing the ADR is about) predicts its size not at all.

**Rule for a runtime you ship optionally**: it is only optional if nothing on the shared path imports it. One `import` in one activity is a container that cannot start, and it fails in the image alone — a root install hoists everything, so every local run and every CI job resolves it happily. `tests/architecture/the-temporal-sdk-stays-on-the-temporal-path.test.ts` is the tripwire.

**Applies to**: `apps/worker`'s image and Phase G, which moves the adapter out of this repository; and to `packages/jobs-bullmq` / `jobs-temporal` if a second optional runtime is ever added. The same `--workspace=` misconception is available in `apps/api`'s and `apps/web`'s Dockerfiles.
