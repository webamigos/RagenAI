---
title: "A vendor's analytics id hardcoded in an open-source app enrolls every self-hoster, and the gate that enabled it was a documented instruction"
modules: ['web', 'docs']
areas: ['security', 'architecture', 'documentation']
topics:
  [
    'analytics',
    'self-hosting',
    'open-core',
    'privacy',
    'environment-variables',
    'target-env',
    'architecture-tests',
  ]
---

# A vendor's analytics id hardcoded in an open-source app enrolls every self-hoster, and the gate that enabled it was a documented instruction

**Context**: the question was how to measure traffic on the vendor's own deployment of `apps/web` without measuring anyone who self-hosts it. Reading the code first turned an "how do I add this" question into "this is already happening".

**Problem**: `apps/web/src/app/[locale]/layout.tsx` rendered `isProductionTargetEnv && <GoogleTagManager gtmId="GTM-MPJ4T77X" />` — the vendor's container id as a literal, in an Apache-2.0 repository, in the document shell of every localized page. Two facts turned that from a style nit into a data-protection problem. The repository is meant to be self-hosted, so the id ships to every install. And the gate was `TARGET_ENV=production`, which is exactly what `apps/docs/docs/self-hosting.md` instructs a self-hoster to set — so the *documented* install was the one that loaded the vendor's tag manager, on every page of an authenticated panel whose paths carry thread and document `publicId`s. Meanwhile `docs/security-and-privacy.md` said "Nothing else phones home", which is the kind of claim that stops anyone from checking. The gate looked deliberate because it was: someone had thought about staging versus production, and not about vendor versus customer. Note also that removing the literal today does not retract it — builds already published carry it, and only a change inside the tag manager (a hostname condition on the trigger) stops those.

**Rule**: an analytics, tag-manager or telemetry id belongs to a deployment, not to a repository. Read it from the environment with no default, so that "not configured" means "measures nothing", and put it only on a surface the vendor alone deploys — here `apps/docs`, never the app a customer runs. `TARGET_ENV` cannot answer "is this the vendor's own deployment"; no variable describing an environment *tier* can, which is the same mistake `apps/web/src/app/emails/utils/base-url.ts` records with vendor URLs. When the surface is a static site the id is a build input, so it also needs an `ARG`/`ENV` pair in the Dockerfile — Railway hands service variables to a Dockerfile build only through an `ARG`, and without one the site builds clean and measures nothing.

**Applies to**: anything vendor-specific reached through a `TARGET_ENV` check; `apps/web` and `apps/admin`, which customers self-host; `apps/docs`, which they do not. `tests/architecture/analytics-ids-are-not-hardcoded.test.ts` is the tripwire — it forbids id literals monorepo-wide, forbids analytics loaders in the two product apps, and asserts the docs build actually receives `DOCS_GTAG_ID`. Re-read this before adding any third-party script tag, and before repeating a "nothing phones home" claim in documentation.
