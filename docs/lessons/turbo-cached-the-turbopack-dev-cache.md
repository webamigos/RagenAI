---
title: 'turbo.json excluded .next/cache but not .next/dev, so every build tarred the Turbopack dev cache'
modules: ['web', 'admin']
areas: ['architecture']
topics: ['turborepo', 'caching', 'disk-exhaustion', 'build-outputs']
---

# turbo.json excluded .next/cache but not .next/dev, so every build tarred the Turbopack dev cache

**Context**: `turbo.json`'s `build` task declared `outputs: ["dist/**", ".next/**", "!.next/cache/**", "build/**"]`. That exclusion was written when Next put its incremental build cache in `.next/cache`. Next 16 with Turbopack keeps dev-server state in `.next/dev` instead, and nothing excluded it.

**Problem**: `.next/dev` grew to 1.7 GB in `apps/admin` from ordinary `next dev` use. Because it sits under the declared `.next/**` output, every `turbo run build` in that workspace snapshotted the whole thing into `.turbo/cache`, keyed by input hash — one build produced a **1.0 GB** cache entry, of which 3713 of 6470 tar entries were `.next/dev`. Distinct input hashes each get their own entry and nothing prunes them, so the local cache reached **62 GB across 1401 entries in about two days** and filled the disk to 100%. That is where it stops looking like a disk-hygiene issue: the full disk then killed the Docker daemon and Postgres with it, and Turbopack started throwing `ENOSPC` mid-request, so the app returned 500s and page latency measurements were garbage. Both looked exactly like application bugs. Adding `"!.next/dev/**"` took the same build's cache entry from 1.0 GB to **18 MB** (57×) with the restore still complete and `FULL TURBO` intact.

**Rule**: a Turborepo `outputs` glob is a snapshot instruction, so it must name the build *product* and nothing that merely lives in the same directory. When a framework moves its cache location, an old negation silently stops covering it — there is no warning, only a cache that grows. Two symptoms are worth wiring together: an implausibly large `.turbo/cache`, and restoring a cached build overwriting dev-server state (stale dev cache is part of the artifact, so a cache hit can hand a developer another machine's dev state). Check the artifact's contents, not just its size: `tar --use-compress-program=unzstd -tf .turbo/cache/<hash>.tar.zst`.

**Applies to**: `turbo.json` at the repository root, and any workspace whose `outputs` include a framework directory (`.next/**`, `dist/**`) that also holds transient state. Re-check after a Next major upgrade. The cache is local-only (no remote cache is configured), so the cost lands on developer disks rather than CI — which is why it went unnoticed.
