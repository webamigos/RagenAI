---
title: 'A `BREAKING CHANGE:` footer on an internal environment-variable rename is a major release — four of them in two days, and semantic-release cannot go back'
modules: ['ci']
areas: ['ci']
topics: ['semantic-release', 'release-automation', 'versioning', 'conventional-commits', 'adr-50', 'adr-51', 'architecture-tests']
---

# A `BREAKING CHANGE:` footer on an internal environment-variable rename is a major release — four of them in two days, and semantic-release cannot go back

**Context**: `release.yml` runs semantic-release on every push to `main`, and
two programmes were landing slice by slice — guardrails and the worker runtime.
Several of those slices retired an environment variable: `MODERATION_ENABLED`
stopped being read, then `JAILBREAK_DETECTION_ENABLED`, and the Temporal adapter
left the repository. Each pull request said so in the footer, which is the
correct thing to write: an operator whose `.env` still sets the variable has to
be told it is now inert, and the release notes are the only place that is said.

**Problem**: `@semantic-release/commit-analyzer`'s **default** ruleset bumps the
major on _any_ breaking footer, whatever the footer is about. So the line went
`1.217.1 → 2.0.0 → 3.0.0 → 4.0.0 → 5.0.0` in thirty-six hours, and three of the
four majors announced an internal rename to a product with no production
deployment, no published client pinned to a range, and no API-shape change in
any of them. The first number — the one thing anybody reads without opening the
release — was being set by whichever internal slice happened to merge that
afternoon.

Two things about the recovery are not guessable:

- **There is no way back through configuration.** semantic-release takes the
  highest tag reachable on the branch as the last release. Fixing the rule and
  pushing would have produced `5.0.1`. Returning to `2.x` meant deleting six
  GitHub releases **and** their tags (`gh release delete <tag> --cleanup-tag`),
  after archiving the generated notes, which are not recoverable.
- **The container images stay.** `publish-images.yml` fires on
  `release: published`, so `3.x`, `4.x` and `5.0.0` images were built and pushed
  to GHCR when those releases happened. Deleting a release does not delete them;
  they sit above the line until somebody removes them by hand, and only `latest`
  moves with the next release.

The fix itself is one line, and it works because of a mechanism worth knowing:
a **custom** `releaseRules` entry is consulted before the defaults, and
`commit-analyzer/index.js` falls back to the defaults only when no custom rule
matched (`isUndefined`). So `{ "breaking": true, "release": "minor" }` does not
merely outrank the default breaking rule — it prevents it from being consulted.

**Rule**: **a breaking footer is a documentation decision; the major is a
release decision, and they should not be the same lever.** Keep the footer
honest — it earns the **BREAKING CHANGES** heading that an operator needs — and
map it to a release type that matches what the number actually promises your
consumers. Per ADR-51 that is `minor` here, with a major cut by hand
(`gh release create vX.0.0 --target main --generate-notes`), which semantic-release
then continues from with no configuration to revert.

The `{ "breaking": true }` rule has to stay present with _some_ release type:
delete it and the defaults take over again, set it to `false` and the marker
rule would suppress the one release that must never be suppressed.
`tests/architecture/a-release-rule-matches-only-what-it-names.test.ts` asserts
both halves, because a JSON file with no comments cannot explain itself.

**Applies to**: `.releaserc` and any semantic-release configuration in a
repository that releases on every push; by extension any automation where a
commit convention written for humans also drives a number read by machines.
