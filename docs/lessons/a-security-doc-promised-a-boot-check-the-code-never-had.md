---
title: 'A customer security document promised "the system will not start without a configured key provider" — the code has never done that'
modules: ['web', 'api']
areas: ['security', 'documentation']
topics: ['encryption', 'kms', 'target-env', 'environment-variables', 'security-events']
---

# A customer security document promised "the system will not start without a configured key provider" — the code has never done that

**Context**: a security document sent to a customer (2026-08-31) stated that
message encryption is enforced by refusing to boot: "without a configured key
provider, the system will not start." `isEncryptionEnabled()`
(`@ragenai/crypto`) has always instead returned `false` and let every write
path fall through to storing plaintext — `create-message-command.ts`,
`create-document-command.ts`/`update-document-command.ts` in apps/web, and
their apps/api equivalents. This is deliberate for local development (`docs/thread-encryption.md`
used to say so directly: "local development is plaintext"), but nothing in
the code distinguished a developer's laptop from a production deployment —
both read the same `false`.

**Problem**: the gap was invisible from the inside. `apps/web`'s own
first-run setup checklist (`inspect-environment.ts`) already listed
"message-encryption" as only `recommended`, never `required`, and
`hasBlockingIssues` — the flag meant to distinguish the two — only changes a
heading's wording on the sign-in page; it doesn't block anything. Nobody had
to lie to write the customer document; the claim was simply never checked
against the code that would have to keep it true, and would have been
trivially falsified by unsetting the variable and watching the app start
anyway.

**Rule**: a security claim made externally about "refuses to start" needs an
enforcement point that actually refuses something, not a config validator
that reports and moves on — the two are easy to conflate because most of this
repository's env validation (`@ragenai/env`'s `requiredInDeployedEnvs`, `apps/web`'s
`config/env.ts`) is deliberately report-only, matching `apps/web`'s own
documented "never `process.exit()`, it serves the setup page" rule. When the
claim is "this refuses to start" for one specific, security-critical
condition, that condition needs its own enforcement, separate from the
general config-validation convention: apps/api's `main.ts` gets an actual
`process.exit(1)`; apps/web, which really cannot exit, needs a different
mechanism that actually stops normal use (an app-wide blocking screen, not a
checklist item) — see the "Production requires a key provider" section of
`docs/thread-encryption.md`. And because a screen can be bypassed by any
caller that doesn't render it (a direct API call, a backfill script), the
same condition also needs to be checked at the actual write path, not only at
the boot/UI layer — the write-path guard is what makes the "will not persist
plaintext" claim true regardless of how the write was triggered.

**Applies to**: any documentation, sales, or compliance claim that describes
what the running code does rather than what it is configured to do — a
default that is safe for one deployment mode is not proof of a claim about a
different one, and the two need to be told apart in the code, not just in
prose.
