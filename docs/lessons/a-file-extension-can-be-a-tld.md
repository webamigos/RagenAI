---
title: 'A file extension can be a TLD, so linkify turns a cited filename into an external link'
modules: ['web']
areas: ['integration']
topics: ['markdown-it', 'linkify', 'rag', 'citations', 'rendering', 'security']
---

# A file extension can be a TLD, so linkify turns a cited filename into an external link

**Context**: An answer in the demo read `According to 'Sample FAQ — support
and availability.md', …` and `availability.md` rendered as a link. Clicking a
citation tried to navigate off-site.

**Problem**: `markdown-it` was constructed with `linkify: true`, which hands
plain text to `linkify-it`. That library links a bare host with no scheme —
`example.com` becomes `http://example.com` — and it decides what counts as a
host by matching the trailing label against the IANA TLD list.

That list is not a list of internet-looking things. It contains **`md`**
(Moldova). It also contains `pl`, `sh`, `zip`, `mov`, `py`, `it` and `me`. So
`availability.md`, `notes.pl`, `deploy.sh` and `archive.zip` are all
hostnames as far as linkify is concerned.

In a product whose answers **cite filenames by design**, this is the common
case rather than an edge case. It is also worse than cosmetic: a citation is
the one element a reader is invited to trust, and it was pointing at a domain
nobody here controls.

Two details made it easy to get wrong:

- **Two renderers had `linkify: true`**, configured independently in unrelated
  files — the panel's chat output and the public thread view. Fixing one would
  have left the bug on the other, and the fixed surface would have looked like
  proof.
- The other markdown-it instances in the app have linkify **off**, which is
  markdown-it's default. So the bug is not "the app links filenames" but "two
  specific renderers do", and grep for the symptom finds nothing.

**Rule**: with `linkify` on, also set `fuzzyLink: false` — link only text that
names its scheme. `applyLinkifyPolicy` in
`apps/web/src/libs/markdown/linkify-policy.ts` does this, and
`tests/architecture/linkify-requires-the-filename-policy.test.ts` fails on any
file that switches linkify on without it.

Do not fix this by removing the offending TLDs from the list: that means
restating the whole list minus a hand-picked few, and it drifts the moment
IANA delegates another one that happens to look like a file extension. What
`fuzzyLink: false` costs is specific and small — `www.example.com` written
without a scheme stops linking, while `https://example.com` and ordinary
markdown links are unaffected. `fuzzyEmail` stays on, because no filename
looks like an address.

**Applies to**: any markdown-it instance rendering model output or user
content. The same reasoning applies to any autolinking library that resolves
hosts against a TLD list, which is all of them.
