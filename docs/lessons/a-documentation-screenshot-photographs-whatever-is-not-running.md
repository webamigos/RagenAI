---
title: 'A documentation screenshot photographs whatever is not running — an unreachable service renders as an empty section, not an error'
modules: ['web', 'admin', 'api', 'docs']
areas: ['documentation', 'frontend']
topics: ['screenshots', 'capture', 'better-auth', 'apps-api', 'fail-open', 'seed-data']
---

# A documentation screenshot photographs whatever is not running — an unreachable service renders as an empty section, not an error

**Context**: `docs/img/web/knowledge-base.png` had been a hand-placed design
target since #991. Phase 7 shipped, so the image went back to being generated:
point `apps/web` at `ragen_e2e`, seed `apps/docs/screenshots/demo-data.sql`,
`npx tsx apps/docs/screenshots/capture.mts web knowledge-base`. The script has a
guard for exactly this situation — it refuses to photograph a page showing
"failed to load" — and the run passed it.

**Problem**: three things went wrong, and none of them failed anything.

**The rail had no folders, and the page did not mind.** `getFolders()` reaches
apps/api through `ragenApiRequest`, and apps/api was not running. The caller
catches and moves on — "Folders are optional, don't block the page" — so the
knowledge base rendered its scope list, its usage block and no FOLDERS section
at all. That is a valid-looking screenshot of a feature that is simply absent.
The capture script's error-state check cannot see it: nothing failed, half the
rail just was not there. The shot now carries `needsApi: true`, which says so.

**The seeded state was not the state worth photographing.** `ragen_e2e` holds
three text files named after the tests that use them. Folders, per-file
policies, a status other than Ready, a scope count that differs between All
files and My files — none of it exists, so the image proves the page renders
and shows nothing about what it does. `demo-data.sql` is where that is fixed;
it existed for the admin panel and had no knowledge-base section.

**Changing the seed silently staled another image.** The same file pins
`storage_limit_bytes = 2048` so the admin Disk Usage page has a percentage to
draw against three files totalling 1.6 kB. Twenty-eight demo documents later
that ceiling reads "64.2 MB / 2 kB" in the app's usage block and a
seven-figure percentage in the panel. A number in `demo-data.sql` is an input
to every image the file feeds, not just the page being worked on.

**And the admin capture cannot sign in at all without its own origin.** Better
Auth takes `BETTER_AUTH_URL` as its base URL; the root `.env.local` sets it to
`http://localhost:3000` for the app, so serving the panel on 3200 answers every
sign-in with "Invalid origin". In the script that surfaces as a navigation
timeout inside `signIn()` with an empty log — nothing names the origin.

**Rule**: a generated screenshot is a test with no assertions, so give it one.
A companion service whose absence the UI swallows renders as a missing
section, and the script's "refuse to photograph a failure" guard only catches
pages that _say_ they failed.

The two fields are not interchangeable. `needsApi` changes nothing about what
happens — every shot that throws is skipped with a warning either way; it only
adds "(needs apps/api running)" to that warning, so whoever reads the log
knows where to look first. It does nothing at all for a page that renders
happily without the service, which is the case that produced this lesson.
`requires` is the assertion — text that must be on screen before the shutter
opens, so a page missing the half the shot exists to show throws by name
instead of being captured quietly. A shot that depends on a companion service
wants both: one to explain a failure, the other to cause it.

And when a page is only worth photographing with content in it, the content
belongs in `demo-data.sql` — where a value changed for one image has to be
walked through every other image the file feeds.

**Applies to**: `apps/docs/screenshots/capture.mts`, `demo-data.sql`, and any
panel surface whose data comes from apps/api, the token vault or another
companion service. The Better Auth origin note applies to running `apps/admin`
against the shared local environment generally, not only to screenshots.
