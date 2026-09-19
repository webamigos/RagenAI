---
title: 'A published image that omits an architecture is emulated, not refused — and no job anywhere goes red'
modules: ['ci']
areas: ['ci', 'architecture']
topics: ['github-actions', 'docker', 'multi-arch', 'buildx', 'self-hosting', 'fail-open', 'architecture-tests']
---

# A published image that omits an architecture is emulated, not refused — and no job anywhere goes red

**Context**: `publish-images.yml` (the worker-runtime programme's G1) published five images to GHCR so a self-hoster would not have to compile them. It built `linux/amd64` only, and said why in a comment: arm64 would cross-build under QEMU, at several times the cost, for an architecture no deployment target used.

**Problem**: the reasoning was right about deployment and wrong about everything else, and nothing in CI could tell the difference.

- **A missing architecture is not an error anywhere in the chain.** `docker pull` on an arm64 host does not fail when the manifest has no arm64 entry — it takes the amd64 one. Docker Desktop on Apple silicon then emulates it and flags the container `⚠ AMD64`, which is the _only_ notice anyone gets, and it is a badge in a GUI rather than a line in a log. (Which emulator depends on the VMM in use — Rosetta under Apple's Virtualization framework, QEMU under Docker VMM, which does not support Rosetta at all. The badge is the same and so is everything below, which is why this is a parenthesis.)
- **What it breaks, it breaks at a distance.** A Node image under emulation does not fail at startup; it fails when a native addon (sharp, onnxruntime, a tokenizer) hits something the emulator handles badly, and it fails as a segfault inside application code. That reads as an application bug for as long as nobody thinks to check the badge.
- **"No deployment target uses arm64" answered the wrong question.** The images are published _for other people_ — the point of G1 is that somebody else does not compile them. Developers on Apple silicon are most of that audience, and Graviton and Ampere are the cheap half of the hosting market. The constraint that actually justified amd64-only was the QEMU cost, and that constraint evaporated when this repository went public: `ubuntu-24.04-arm` is a free hosted runner for public repositories, so each architecture builds natively, in parallel, in about the wall-clock time one of them took.

**Rule**: a container image published for other people is a two-architecture manifest, built natively per architecture and joined with `docker buildx imagetools create`. The shape that makes this work is a fan-out and a join: the per-architecture job pushes **by digest and applies no tag** (`push-by-digest=true,name-canonical=true`), and one merge job writes the tags onto the manifest list. Tagging from the per-architecture job instead is the trap — both jobs succeed, and whichever finishes last leaves a single-architecture image sitting under a tag that claims to be both.

Two further things this repository learned while doing it:

1. **Give each architecture its own `cache-to` scope.** One shared GHA scope has the two builds evict each other's layers on every run, which looks like a cache that simply never warms up.
2. **Assert the manifest against the registry.** `tests/architecture/every-image-is-published-for-both-architectures.test.ts` keeps the two `app:` matrices in agreement and keeps each architecture on a runner that provides it natively — but it reads the workflow, and the workflow is not the artifact. The published manifest is, so the last step of the merge job inspects what GHCR actually holds and fails if an architecture is missing from it.

**Applies to**: every image in `publish-images.yml`, and to `ragen-enterprise`, whose Temporal image is `FROM ghcr.io/webamigos/ragen-worker` and therefore inherits whatever architectures that manifest has. Also to any future published image, and to the general shape: a check that "works" by falling back to something slower or emulated has no failure mode CI can observe, so the assertion has to be written against the artifact rather than the build.
