# Lessons

A catalog of non-obvious corrections and gotchas, indexed so an agent (or a human) can check the relevant area before starting nontrivial work in it, instead of re-discovering the same bug. Inspired by `open-mercato`'s `.ai/lessons.md` mechanism.

## How to use this catalog

Before starting a nontrivial task, skim the bullets under the area(s) it touches (not the whole catalog). Each bullet links to a lesson file with four fixed sections: **Context** (what was happening), **Problem** (what went wrong, concretely), **Rule** (the durable takeaway), **Applies to** (scope).

## Adding or updating a lesson

After a nontrivial correction or a non-obvious gotcha (see `AGENTS.md`'s "Post-Task Workflow"):

1. Check whether an existing lesson already covers it — extend that file instead of creating a near-duplicate.
2. Otherwise, add a new file under `docs/lessons/<kebab-case-slug>.md` with the front matter (`title`, `modules`, `areas`, `topics`) and four-section shape shown by any existing lesson.
3. Add one bullet to the relevant `### <area>` section below (create the section if it's a new area).

## Catalog

### ci

- [A path glob in CI config that matches nothing does not fail — it silently stops working](lessons/path-filters-fail-open-after-a-directory-move.md) — area:ci; module:ci; topic:github-actions,path-filters,codeowners,mutation-testing,monorepo
- [An `if: secret != ""` guard on a CI step fails open — and a gate nobody can run should be deleted, not repaired](lessons/a-secret-guarded-ci-step-fails-open.md) — area:ci; module:web; topic:github-actions,secrets,evals,fail-open

### architecture

- [Missing organizationId on a findUnique-by-id query is a cross-org IDOR, not just a style nit](lessons/missing-org-scope-on-project-lookup.md) — area:architecture,security; module:projects; topic:data-scoping,access-control
- [A constant duplicated across workspaces drifts silently, and typecheck cannot see it because each copy derives its own type](lessons/hand-copied-lists-drift-and-typecheck-only-sees-one.md) — area:architecture,testing; module:web,api,admin; topic:monorepo,feature-flags,model-ids,type-safety,architecture-tests. The admin model allowlist drifted in _namespace_ (`openai/gpt-5.3-chat` vs `gpt-5.3-chat`) and so emptied an org's model picker instead of restricting it. Resolved by [ADR-33](adrs/33-shared-platform-contracts-package.md) — read the "How it was resolved" section before adding a fifth copy of anything.
- [turbo.json excluded .next/cache but not .next/dev, so every build tarred the Turbopack dev cache](lessons/turbo-cached-the-turbopack-dev-cache.md) — area:architecture; module:web,admin; topic:turborepo,caching,disk-exhaustion,build-outputs
- [Adding a Postgres enum value is not backwards-compatible — an older Prisma client throws when it reads a row containing it](lessons/adding-an-enum-value-breaks-older-readers.md) — area:architecture,deployment; module:web,api,admin,worker; topic:prisma,migrations,enums,rolling-deploy. Two migrations claim enum additions are non-breaking because "older versions never produce it" — the hazard is reading, not writing.
- [A storage download streamed straight to destPath leaves a truncated file that a retry mistakes for a complete one](lessons/streamed-download-must-rename-not-write-in-place.md) — area:architecture; module:storage,worker; topic:temporal,s3,streaming,atomicity,retries,silent-corruption. Fixed by writing to a temp path and renaming onto destPath only on success — `existsSync` is not proof a write finished.
- [A shared local Postgres can carry migrations from another in-progress feature branch, absent from your branch's migration history](lessons/shared-local-postgres-can-carry-migrations-not-in-git.md) — area:architecture; module:worker,web,db; topic:prisma,migrations,git-worktrees,local-development,postgres. A git worktree isolates the working tree, not the shared Postgres container behind it — `prisma migrate reset` would have destroyed someone else's uncommitted schema.
- [Tail latency at 20 concurrent ingests varies run to run (1.25x-2x median) — measure more than once before trusting a single number](lessons/worker-concurrency-load-test-2026-09-05.md) — area:architecture; module:worker; topic:temporal,litellm,qdrant,s3,load-test,concurrency,onboarding. Measured, not assumed — `maxConcurrentActivityTaskExecutions: 50` is not proof the system handles 50 concurrent ingests cleanly, and one run is not a stable baseline either.
- [Adding a workspace dependency to an app whose Dockerfile installs with `--workspace` needs four coordinated changes, and the failure names an unrelated package](lessons/workspace-scoped-npm-ci-nests-conflicting-versions.md) — area:architecture,deployment; module:mcp,worker,api; topic:docker,npm-workspaces,monorepo,hoisting,railway. `npm ci --workspace=X` lays out node_modules differently than `npm ci`, and differently again per added workspace — the build broke on `Cannot find module 'fastmcp'`, a package nobody had touched.
- [A NEXT_PUBLIC_ variable is baked in at build time, so changing it on Railway changes nothing until the next build](lessons/next-public-vars-are-baked-in-at-build-time.md) — area:architecture; module:web,admin; topic:nextjs,environment-variables,railway,observability,self-hosting. Decided which variable email links resolve from, and why a Dockerfile build-stage default has to move with a code default.
- [A documented env flag that grep cannot find is not proof the gate was lost — check whether it became a per-org setting](lessons/a-missing-env-flag-may-be-a-moved-gate.md) — area:architecture,documentation; module:web,api,worker; topic:feature-flags,rag,organization-settings,docs-drift. `FEATURE_FLAG_MULTI_QUERY` became `OrganizationSettings.multiQueryEnabled`; the docs listed the env var for months, and reranking was documented as on-by-default while being opt-in.

### security

- [A dashboard layout does not protect Server Actions, and a non-existent Better Auth option fails silently](lessons/admin-panel-access-was-session-only.md) — area:security; module:admin; topic:access-control,better-auth,server-actions
- [A listing query that filters by permission is not access control — the by-id routes beside it have to check too](lessons/listing-filters-are-not-access-control.md) — area:security; module:documents,web; topic:data-scoping,access-control,idor,document-permissions

### dependencies

- [A large version-number jump doesn't predict breaking risk — where the last breaking release sits does](lessons/version-jump-size-doesnt-predict-breaking-risk.md) — area:dependencies; module:worker; topic:docling,upgrades,changelogs
- [A base image's own packaging can break your Dockerfile with zero changelog entry](lessons/base-image-packaging-can-break-with-no-changelog-entry.md) — area:dependencies; module:worker; topic:presidio,docker,upgrades,poetry,uv
- [Absorbing a repo into the monorepo silently re-resolves every dependency it had pinned](lessons/monorepo-absorption-discards-the-lockfile.md) — area:dependencies; module:worker,api; topic:monorepo,npm-workspaces,lockfile,upgrades
- [A seed that writes a library-owned table with Prisma has to satisfy that library's lookup, not just its schema](lessons/seeded-rows-must-satisfy-the-librarys-lookup.md) — area:dependencies,testing; module:web; topic:better-auth,upgrades,e2e,seeding,migrations

### integration

- [A NestJS controller returning a bare string/number/boolean/null serializes wrong](lessons/bare-primitive-response-serialization.md) — area:integration; module:api; topic:api-contracts,testing
- [ragenApiRequest without an explicit \<T\> silently infers Promise\<unknown\>](lessons/ragen-api-request-promise-unknown-inference.md) — area:integration; module:api-client; topic:type-safety,testing
- [AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in local .env.local are Scaleway S3 credentials, not AWS Bedrock ones](lessons/aws-prefixed-env-vars-are-scaleway-s3-not-bedrock.md) — area:integration; module:web,worker,infra; topic:env-vars,aws,scaleway,bedrock,litellm,reranker,storage. A flat 403 "security token invalid" (not a permissions error) means the credentials are for a different service, not expired.
- [A SignatureDoesNotMatch that survives every endpoint/bucket/region combination is the credential pair, not a config typo](lessons/s3-signature-mismatch-across-every-endpoint-is-the-key-not-config.md) — area:integration; module:storage,worker; topic:s3,scaleway,credentials,signature-does-not-match,local-development. Vary endpoint/bucket/region independently in an isolated script before auditing app config — the same error across every combination means the key itself, not a typo.

### testing

- [An e2e locator keyed to a Tailwind colour class fails when the colour is tokenised, while the feature works perfectly](lessons/an-e2e-locator-keyed-to-a-colour-class-breaks-when-colours-move.md) — area:testing; module:web; topic:playwright,e2e,tailwind,design-tokens,locators. The element already carried `role="alert"`; the locator reached past it for `[class*="text-red"]`, so a token rename failed the test while the error rendered perfectly.

- [A Stryker mutate entry that matches nothing, or whose tests are out of the runner config, reports success](lessons/stryker-mutate-glob-and-runner-scope-must-agree.md) — area:testing,ci; module:ci; topic:mutation-testing,stryker,vitest,config-drift
- [Flipping a feature default to opt-in broke six e2e specs, and the tier they live in never runs on a PR](lessons/flipping-a-feature-default-broke-specs-in-a-tier-that-never-gates-a-pr.md) — area:testing; module:web,api; topic:feature-flags,e2e,playwright,test-tiers,seed-data,fail-late. `publicChatbot` and `publicThreadLinks` went opt-in without the e2e seed being updated; both specs are `p1`, so every PR stayed green and only the post-merge run went red.
- [A library timer armed in one test file crashes a different one after teardown — and the report blames the wrong file](lessons/a-timer-armed-in-one-test-file-crashes-another.md) — area:testing; module:web; topic:vitest,jsdom,better-auth,nanostores,teardown,flaky-tests. All 1871 tests passed and the job was still red: nanostores schedules an atom's teardown a second after its last subscriber leaves, and Better Auth's cleanup then touches `window` that jsdom has already disposed. Read this before editing whatever file a `ReferenceError` names.
- [Running vitest directly instead of through turbo tests the app against the last built `dist` of a workspace package, not the source you just edited](lessons/a-package-edit-is-invisible-to-apps-until-its-dist-is-rebuilt.md) — area:testing,architecture; module:web,api,admin; topic:monorepo,turborepo,workspace-packages,vitest,stale-build,false-green. A package's own tests import the source and go green; apps resolve `main` → `dist` and see the old code. `turbo.json` makes this impossible through turbo (`test`/`typecheck`/`lint` all `dependsOn: ["^build"]`) — it only bites when you bypass turbo to run one file, and the direction that costs you is the stale `dist` making an assertion pass.
