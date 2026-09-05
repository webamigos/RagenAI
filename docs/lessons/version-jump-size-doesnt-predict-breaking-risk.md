# A large version-number jump doesn't predict breaking risk — where the last breaking release sits does

**Context:** Docling upgrade, `v1.1.0` → `v1.32.0` (2026-09-05,
[`docs/runbooks/docling-upgrade.md`](../runbooks/docling-upgrade.md)).

31 minor versions looked like the kind of jump that needs the same caution as
the LiteLLM `v1.83.10-stable` → `v1.99.1` upgrade a few days earlier (16
minors). Reading the project's own changelog instead of just eyeballing the
version numbers showed the opposite: the one genuinely breaking release in
Docling's history — `v1.0.0`, a full API/architecture rewrite to the "v1"
orchestrator model — happened *before* our pinned `v1.1.0` baseline. Every
release from `v1.1.0` to `v1.32.0` was additive from our own usage's
perspective (new endpoints, new optional env vars, new source/target types) —
confirmed by cross-checking the changelog against the two calls this repo
actually makes (`apps/worker/src/services/docling-client.ts`'s
`/v1/convert/source` and `/health`), neither of which changed shape anywhere
in that range.

**Why:** the size of a version gap is a proxy for "how much changed," not for
"how much of what changed affects us." A vendor's own breaking-change history
is the thing to read — where the actual breaking cuts landed relative to the
version already deployed — not the arithmetic distance between two version
numbers. A 31-minor jump landing entirely after the last breaking release can
be lower-risk than a 3-minor jump that crosses one.

**How to apply:** before scoping the caution level for any version bump
(Docker image, npm package, anything with a changelog), find the vendor's own
"breaking changes" markers first and check whether the currently-deployed
version is already past them. Only then decide how much of the intervening
history is worth reading in detail. See also
[`docs/runbooks/litellm-upgrade.md`](../runbooks/litellm-upgrade.md) for the
same repo's LiteLLM upgrade, where the size of the jump *did* turn out to
matter (Prisma migration-behavior changes were in-range).
