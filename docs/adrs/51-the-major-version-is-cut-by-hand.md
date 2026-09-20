# ADR-51: The Major Version Is Cut by Hand

**Status:** Accepted. Changes one line of `.releaserc` and the test that guards
it; amends ADR-50's "Which commits cut a release".
**Date:** 2026-09-20

## Context

The version line went `1.217.1 → 2.0.0 → 3.0.0 → 4.0.0 → 5.0.0` in under
thirty-six hours:

| tag      | cut              | what earned the major                                                                           |
| -------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `v2.0.0` | 2026-09-19 12:45 | a deliberate `chore(release):` — a human moving the line                                        |
| `v3.0.0` | 2026-09-19 22:33 | the Temporal adapter leaving the repository, and the images becoming two-architecture manifests |
| `v4.0.0` | 2026-09-20 14:37 | `MODERATION_ENABLED` no longer read                                                             |
| `v5.0.0` | 2026-09-20 18:21 | `JAILBREAK_DETECTION_ENABLED` no longer read                                                    |

Three of the four were internal environment-variable renames inside the
guardrails and worker-runtime programmes. `release.yml` runs semantic-release on
every push to `main`, and `@semantic-release/commit-analyzer`'s default ruleset
bumps the major on any breaking footer, so each one arrived on its own the
afternoon it merged.

**The footers were not wrong.** An operator whose `.env` sets
`MODERATION_ENABLED` needs to be told it is now inert, and the only place that
is said is the release notes. What was wrong is what the footer _also_ did: move
the first number.

That number is the one thing about a release anybody reads without opening it,
and here it was being spent on a question nobody had asked. Ragen has no
production deployment (demo is the only exposed environment), no published
client library pinned to a range, and no API contract that any of these four
changes altered — the public API's shape was untouched by all of them. Four
majors in two days said "we broke your integration, four times". Nothing broke.

The first of the four is the proof of what we actually want: `v2.0.0` was cut
because somebody decided the line should move. That decision is worth keeping.
It is the other three that were an accident of configuration.

## Decision

**A breaking footer releases a minor. The major is a deliberate act.**

```json
"releaseRules": [
  { "breaking": true, "release": "minor" },
  { "subject": "*\\[no release\\]*", "release": false }
]
```

A custom rule is consulted before the defaults and, when it matches, the
defaults are skipped entirely (`commit-analyzer/index.js` falls back only on
`undefined`). So this one line is the whole change: `feat!:` and
`BREAKING CHANGE:` keep every other meaning they have — commitlint still accepts
them, the notes still carry a **BREAKING CHANGES** section, the release still
goes out — and they no longer touch the first number.

`{ breaking: true }` must stay present with _some_ release type. Dropping the
rule altogether hands breaking commits back to the defaults and the major
returns; setting it to `false` would suppress the one release that must never be
suppressed, because the notes announcing the break go out with it or not at all.
`tests/architecture/a-release-rule-matches-only-what-it-names.test.ts` asserts
both halves.

### How to cut a major, when one is genuinely earned

Create the tag and the GitHub release by hand, at the head of `main`:

```bash
gh release create v3.0.0 --target main --title v3.0.0 --generate-notes
```

semantic-release reads the last release from the tags reachable on the branch,
so the next push to `main` continues from it — `3.0.1`, `3.1.0` — with no
configuration to remember to revert. `publish-images.yml` triggers on
`release: published`, so the images and `latest` follow exactly as they do for
an automatic release.

The alternative — flipping the rule to `major` in the same pull request as the
change that earns it and flipping it back afterwards — was rejected. It is two
commits of config churn around one release, and it fails open: forget the second
commit and every subsequent breaking footer is a major again, which is the state
this ADR is fixing.

## The rollback

`v3.0.0`, `v3.1.0`, `v3.1.1`, `v4.0.0`, `v4.1.0` and `v5.0.0` were deleted —
releases and tags both — so that the line resumes from `v2.0.1`. semantic-release
has no way to go backwards: it takes the highest reachable tag as the last
release, so leaving them would have made the next release `5.0.1` no matter what
`.releaserc` says.

Nothing was lost from the history. Every commit those six tags pointed at is
still on `main` and still in the record; only the tags and the generated notes
went, and the notes were archived before deletion.

Two things survive the rollback and are expected:

- **Container images tagged `3.x`, `4.x` and `5.0.0` remain in GHCR.** They were
  published by `publish-images.yml` when those releases fired and are not
  removed by deleting a release. They are real images of real commits; they are
  simply numbered above the line now. `latest` moves to the next release.
- **The published changelog loses those six entries.**
  `docs.ragen.ai/changelog` is generated from GitHub Releases and is not
  hand-edited, so it now reads `2.0.1` at the top. The commits it was
  describing reappear there under `2.1.0`.
- **`v2.0.1`'s notes do not mention what happened afterwards.** The commits from
  the deleted range are picked up by the next release's notes, because
  semantic-release generates them from everything since the last tag.

## Consequences

- The next release after this one is **`2.1.0`**, and the line stays in `2.x`
  until somebody runs `gh release create`.
- A `feat!:` subject is now a documentation choice, not a version one. Use it
  when an operator has to do something; the `!` earns the **BREAKING CHANGES**
  heading in the notes and nothing more.
- ADR-50's release table is unchanged in every row: the four slice types still
  release what they did. Only the breaking case moved, from major to minor.
- `package.json` still reads `0.0.0-semantically-released`; no workspace
  version is written by the release, so nothing in the tree had to change.

## Revisiting

Revisit when a consumer exists that a major would be speaking to: a published
client library pinned to a range, a stable public API version, or a self-hosted
install that upgrades across a documented boundary. At that point the question
is not "should breaking bump the major" — it is which surface the number
describes, and this repository will need to answer that before automating it
again.
