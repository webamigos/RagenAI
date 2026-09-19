---
title: 'A semantic-release rule value is a glob, so `[no release]` is a character class — the marker that was meant to skip one release switched off every release, silently'
modules: ['ci']
areas: ['ci']
topics: ['semantic-release', 'micromatch', 'globs', 'release-automation', 'fail-silent', 'architecture-tests', 'adr-50']
---

# A semantic-release rule value is a glob, so `[no release]` is a character class — the marker that was meant to skip one release switched off every release, silently

**Context**: ADR-50 slices a large feature into several pull requests that each
merge into `main`. `release.yml` runs semantic-release on every push there, and
`publish-images.yml` fires on the release and builds five container images,
moving `latest` with them — so ten merges for one feature meant ten releases and
ten image publications. Most of that is answered by the commit type (a slice
behind a disabled feature key is a `chore`, not a `feat`), and the rest by an
opt-out in `.releaserc`:

```json
{ "subject": "*[no release]*", "release": false }
```

Read as a substring test, that says "suppress the release when the subject
carries the marker". It says nothing of the sort.

**Problem**: `@semantic-release/commit-analyzer` matches rule values with
micromatch — `lib/analyze-commit.js` imports it and calls
`micromatch.isMatch(commit.subject, rule.subject)`. In a glob, `[no release]` is
a **character class**: one character out of `n o ' ' r e l a s`. Against the
subjects actually in this history it matches all of them:

| subject | `*[no release]*` | `*\[no release\]*` |
|---|---|---|
| `publish the worker, api and admin images` | match | no |
| `one reading of IS_ON_PREMISE` | match | no |
| `…that can cache [no release]` | match | match |

And a rule that matches is not merely ignored afterwards. `index.js` falls back
to the default release rules only when the custom rules return `undefined`; a
matched rule returns `false`, which is not `undefined`, so the fallback that
would have released the commit never runs. That asymmetry is the whole reason
the opt-out works at all — and the reason a too-greedy pattern is not a partial
failure but a total one.

Run against the real analyzer at the pinned version, every ordinary commit came
back **no release**. Nothing fails, no check turns red, no log says anything.
The only symptom is a release that does not arrive, on a repository where
nobody waits for one in particular.

A second mistake rode along in the same change: the ADR claimed the rules are
evaluated in order and the first match wins, and that the `breaking` rule
therefore had to be written first. It does not. `analyze-commit.js` keeps the
**highest** release type among all matching rules (`major` also ends the
analysis early), so a commit carrying both a `BREAKING CHANGE` footer and the
marker releases `major` whichever order the rules are in. The rule belongs there
regardless — as the guarantee that a break is never silenced, not as an ordering
trick — but the stated reason was wrong, which is its own kind of trap for
whoever edits the file next.

**Rule**: **every string in a semantic-release `releaseRules` entry is a glob.**
Escape the brackets — `"*\\[no release\\]*"` — and treat any punctuation in a
rule value as glob syntax until proven otherwise. More generally: when a config
value's failure mode is *silence*, "the JSON parses" is not verification. Run
the tool's own matching code against real inputs, from both sides — a case that
must match and a case that must not.

`tests/architecture/a-release-rule-matches-only-what-it-names.test.ts` fails on
an unescaped bracket in any rule value, and asserts the breaking rule exists. It
was written against the planted bug: red on the unescaped pattern, green on the
escaped one.

**Applies to**: `.releaserc` and anything else consumed by
`@semantic-release/commit-analyzer`; by extension any configuration whose values
are globs or regular expressions rather than literals, and any automation whose
failure is a thing not happening.
