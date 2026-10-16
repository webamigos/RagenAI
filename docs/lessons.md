# Lessons

A catalog of non-obvious corrections and gotchas, indexed so an agent (or a human) can check the relevant area before starting nontrivial work in it, instead of re-discovering the same bug. Inspired by `open-mercato`'s `.ai/lessons.md` mechanism.

## How to use this catalog

Before starting a nontrivial task, skim the titles under the area(s) it touches and open the ones that match. Each lesson file opens with an **In short** paragraph, then four fixed sections: **Context** (what was happening), **Problem** (what went wrong, concretely), **Rule** (the durable takeaway), **Applies to** (scope). To search by module or topic, grep the front matter: `grep -l "topics:.*prisma" docs/lessons/*.md`.

This index is titles only, on purpose. It used to carry each lesson's summary and tags too and reached 100 KB — about 25,000 tokens an agent had to spend before starting work, so in practice it was skipped. `tests/architecture/the-lessons-index-stays-an-index.test.ts` keeps it this way.

## Adding or updating a lesson

After a nontrivial correction or a non-obvious gotcha (see `AGENTS.md`'s "Post-Task Workflow"):

1. Check whether an existing lesson already covers it — extend that file instead of creating a near-duplicate.
2. Otherwise, add a new file under `docs/lessons/<kebab-case-slug>.md` with the front matter (`title`, `modules`, `areas`, `topics`), an **In short** paragraph, and the four-section shape shown by any existing lesson. The title should state the rule, since the title is all the index shows.
3. Add one bullet — `- [Title](lessons/<slug>.md)`, nothing after the link — to the relevant `### <area>` section below (create the section if it's a new area).

## Catalog

### ci

- [A cached typecheck hides a Prisma schema change, because the schema is outside every workspace](lessons/a-cached-typecheck-hides-a-schema-change.md)

- [`npm run web:e2e` locally differs from CI in two ways nothing announces: no apps/api, and no route table](lessons/local-e2e-diverges-from-ci-in-two-silent-ways.md)

- [`npm run verify` races apps/web's build against its own typecheck, so the gate only passes when turbo's cache is warm](lessons/verify-races-web-build-against-web-typecheck.md)

- [A five-second test timeout is a CPU budget, not a correctness budget — verify's `--concurrency=4` starves an architecture guard that runs in 264ms alone](lessons/a-five-second-test-timeout-fires-under-verifys-concurrency.md)

- [A build that fetches its fonts fails on whatever Google answers — and self-hosting two subsets puts a fallback between them](lessons/a-build-that-fetches-fonts-fails-on-googles-answer.md)
- [A path glob in CI config that matches nothing does not fail — it silently stops working](lessons/path-filters-fail-open-after-a-directory-move.md)
- [An `if: secret != ""` guard on a CI step fails open — and a gate nobody can run should be deleted, not repaired](lessons/a-secret-guarded-ci-step-fails-open.md)
- [A PR opened against another branch gets no CI at all, and retargeting it to main does not start a run](lessons/a-stacked-pr-gets-no-ci-and-retargeting-does-not-start-one.md)
- [A Playwright browser cache keyed to a semver range serves the wrong chromium build, and skipping the install on a cache hit turns that into a red main](lessons/a-playwright-cache-keyed-to-a-semver-range-serves-the-wrong-browser.md)
- [A CI job that clones its own branch races the merge, and loses](lessons/a-ci-job-that-clones-a-branch-races-the-merge.md)
- [Moving a seam's default variant adds a required variable to every workflow that boots an app](lessons/a-moved-seam-default-adds-a-required-variable-to-ci.md)
- [A published image that omits an architecture is emulated, not refused — and no job anywhere goes red](lessons/a-single-architecture-image-is-emulated-rather-than-refused.md)

- [Omitting a workspace from `npm ci --workspace=…` does not keep it out of the image](lessons/omitting-a-workspace-from-npm-ci-does-not-omit-it.md)


- [One `tsconfig.json` cannot be both the typecheck project and the build, and the cost is not the size it looks like](lessons/a-build-config-that-is-right-for-typecheck-is-wrong-for-the-image.md)
- [A guarded `await import()` still resolves at compile time, so extracting a package fails `tsc` in the one app written to survive it](lessons/a-literal-dynamic-import-resolves-at-compile-time.md)
- [A semantic-release rule value is a glob, so `[no release]` is a character class that matches every commit and switches off releases entirely](lessons/a-release-rule-is-a-glob-not-a-substring.md)
- [A `BREAKING CHANGE:` footer on an internal environment-variable rename is a major release — four of them in two days, and semantic-release cannot go back](lessons/a-breaking-footer-on-an-internal-rename-bumps-the-major.md)

- [turbo runs no root-package script unless turbo.json declares `//#task`](lessons/turbo-runs-no-root-script-without-a-root-task.md)

### architecture

- [Codex reads every AGENTS.md on the path under one 32 KiB budget, so a nested brief behind a full root is mostly never read](lessons/codex-reads-nested-agents-files-under-one-budget.md)
- [A migration and schema.prisma can drift apart, and until now nothing compared them](lessons/a-migration-and-the-schema-can-drift-and-nothing-compares-them.md)
- [Zod 4's `z.uuid()` refuses a well-formed id for its version nibble, so a real row comes back as invalid input](lessons/zod-4-uuid-refuses-well-formed-database-ids.md)

- [A retired file outlives the comments that name it, and the entry-point comment is the worst place for that](lessons/a-retired-file-outlives-the-comments-that-name-it.md)

- [A generated docs page can be hand-edited in `ragen-docs`, and the drift test that would catch it only runs where both checkouts exist](lessons/a-generated-page-can-be-hand-edited-in-the-other-repository.md)

- [A renamed field outlives the rename wherever it is a string — a query parameter, and the branch that never got the second edit](lessons/a-renamed-field-outlives-the-rename-in-a-query-string.md)

- [BullMQ matches Temporal at 20 concurrent ingests — but only once `WORKER_CONCURRENCY` matches; at the shipped default it is 2x slower](lessons/bullmq-matches-temporal-at-equal-concurrency-2026-09-16.md)

- [Temporal accepts a six-field cron and never fires it, so a parity suite that reuses the other engine's dialect reports the wrong engine broken](lessons/temporal-accepts-a-six-field-cron-and-never-fires-it.md)

- [A preflight that enumerates environment variables cannot see a model id hard-coded in source](lessons/a-preflight-that-reads-the-environment-cannot-see-a-hardcoded-model.md)

- [Adding a config file at an app root moves tsc's rootDir, so the build emits dist/src/main.js, exits 0, and the container cannot start](lessons/a-root-config-file-moves-tsc-rootdir-and-the-build-still-passes.md)

- [A feature merged into a component nothing renders is invisible, and every test still passes](lessons/a-feature-merged-into-a-component-nothing-renders.md)

- [The AI SDK offers two token-usage fields, both typecheck, and we aggregated the smaller one into the billing ceilings](lessons/the-sdk-offers-two-usage-fields-and-we-billed-the-wrong-one.md)
- [A shared cleanup helper that reads the session fails silently for every secret-authenticated caller](lessons/shared-cleanup-must-not-read-the-session.md)
- [Missing organizationId on a findUnique-by-id query is a cross-org IDOR, not just a style nit](lessons/missing-org-scope-on-project-lookup.md)
- [A constant duplicated across workspaces drifts silently, and typecheck cannot see it because each copy derives its own type](lessons/hand-copied-lists-drift-and-typecheck-only-sees-one.md)
- [A provider adapter is not configured until a real call goes through it](lessons/a-provider-package-is-not-configured-until-something-calls-it.md)

- [A model chosen by message content cannot be chosen where the model is built](lessons/a-model-chosen-by-content-cannot-be-chosen-at-construction.md)

- [A flag set on a deployment whose build predates its consumer is inert, and the deployment reports nothing](lessons/a-flag-set-on-a-build-that-predates-its-consumer-is-inert.md)

- [A layered Compose file resolves its relative paths against the first `-f` file, not its own directory](lessons/compose-resolves-relative-paths-against-the-first-f-file.md)
- [turbo.json excluded .next/cache but not .next/dev, so every build tarred the Turbopack dev cache](lessons/turbo-cached-the-turbopack-dev-cache.md)
- [A NEXT_PUBLIC_ variable set only at runtime renders on the server and disappears on hydration, and a placeholder value for one is worse than none](lessons/a-next-public-var-set-at-runtime-flashes-then-vanishes.md)
- [A `webpack` block in next.config.ts does nothing under Turbopack, and Next says nothing about it](lessons/a-webpack-config-block-is-inert-under-turbopack.md)
- [Adding a Postgres enum value is not backwards-compatible — an older Prisma client throws when it reads a row containing it](lessons/adding-an-enum-value-breaks-older-readers.md)
- [Declaring an app ESM breaks the three things tsc, eslint and jest cannot see — and two of them fail silently](lessons/an-esm-flip-breaks-what-typecheck-cannot-see.md)
- [A storage download streamed straight to destPath leaves a truncated file that a retry mistakes for a complete one](lessons/streamed-download-must-rename-not-write-in-place.md)
- [A shared local Postgres can carry migrations from another in-progress feature branch, absent from your branch's migration history](lessons/shared-local-postgres-can-carry-migrations-not-in-git.md)
- [Tail latency at 20 concurrent ingests varies run to run (1.25x-2x median) — measure more than once before trusting a single number](lessons/worker-concurrency-load-test-2026-09-05.md)
- [Adding a workspace dependency to an app whose Dockerfile installs with `--workspace` needs four coordinated changes, and the failure names an unrelated package](lessons/workspace-scoped-npm-ci-nests-conflicting-versions.md)
- [A NEXT_PUBLIC_ variable is baked in at build time, so changing it on Railway changes nothing until the next build](lessons/next-public-vars-are-baked-in-at-build-time.md)
- [A documented env flag that grep cannot find is not proof the gate was lost — check whether it became a per-org setting](lessons/a-missing-env-flag-may-be-a-moved-gate.md)

- [Presidio is per-language, and a wrong language corrupts text rather than erroring](lessons/presidio-is-per-language-and-fails-two-different-ways.md)
- [A field whose name misdescribes its contents outlives every comment warning about it](lessons/a-field-name-that-lies-outlives-every-comment.md)
- [A field added later is safe only if its absence means something — never default it](lessons/absence-is-the-discriminator-for-a-field-added-later.md)

- [Docling parses CSV and XLSX too, and the dispatcher returns to the markdown splitter before the `FileType` switch — so ADR-17 no longer reaches the two types it was written for](lessons/docling-routes-spreadsheets-past-the-csv-splitter.md)

- [Five documents handed out the Postgres port the repo moved off, including the guide that warns about it](lessons/a-comment-naming-the-wrong-port-cannot-fix-the-wrong-port.md)

- [Moving enforcement into a dependency left the old query behind, and six months later it read as proof the app still enforced the limit](lessons/enforcement-moved-to-a-dependency-left-its-query-behind.md)

### security

- [A rewrite applied before the split misses what the splitter adds, and a per-document value copied by the splitter becomes every chunk's](lessons/a-rewrite-before-the-split-misses-what-the-splitter-adds.md)

- [A feature gate on the internal thread route was described as covering the public one](lessons/a-gate-on-the-internal-route-is-not-a-gate-on-the-public-one.md)
- [An instruction describing a token format, sent unconditionally, teaches the model to produce that token](lessons/an-instruction-describing-a-token-teaches-the-model-to-write-it.md)

- [Text leaves a RAG chain three ways, and guarding the one the spec named covered two surfaces out of seven](lessons/three-exits-from-a-chain-and-only-one-guarded.md)

- [A regex evaluated on a sliding stream buffer anchors to the buffer, not to the answer — and `\b` is the half that does not look like an anchor](lessons/a-pattern-on-a-sliding-window-reads-the-buffer.md)

- [The admin panel cannot write raw SQL on a tenant-scoped table, because the guard that covers it has no way to say "platform-wide on purpose"](lessons/the-admin-panel-cannot-write-raw-sql-on-a-tenant-scoped-table.md)

- [A tenant filter built from an optional value is not a filter — `GET /v1/files` listed every organization's files](lessons/a-tenant-filter-that-only-works-when-an-optional-value-is-set.md)

- [A configured KMS key can still refuse every write, and the app only finds out one message at a time](lessons/a-configured-kms-key-can-still-refuse-every-write.md)

- [A vendor's analytics id hardcoded in an open-source app enrolls every self-hoster](lessons/a-hardcoded-analytics-id-tracks-every-self-hoster.md)
- [A dashboard layout does not protect Server Actions, and a non-existent Better Auth option fails silently](lessons/admin-panel-access-was-session-only.md)
- [A listing query that filters by permission is not access control — the by-id routes beside it have to check too](lessons/listing-filters-are-not-access-control.md)
- [An encrypted DEK does not record which provider wrapped it, so changing ENCRYPTION_PROVIDER silently orphans every existing thread](lessons/an-encrypted-dek-does-not-record-which-provider-wrapped-it.md)
- [A customer security document promised "the system will not start without a configured key provider" — the code has never done that](lessons/a-security-doc-promised-a-boot-check-the-code-never-had.md)
- [A URL validator cannot see DNS rebinding — the check has to run where the socket opens, and the library has to let you in](lessons/a-url-validator-cannot-see-dns-rebinding.md)

### dependencies

- [Optional auth plugins must follow the fixed plugin tuple](lessons/optional-auth-plugins-must-follow-the-fixed-plugin-tuple.md)

- [A patch release that reads the database client at construction time defeats a lazy client proxy](lessons/a-patch-release-that-touches-the-client-at-construction-defeats-a-lazy-proxy.md)

- [npm links a workspace entry whether or not the package is there, so a deleted package installs as a broken symlink and nothing reports it](lessons/npm-links-a-workspace-that-has-no-manifest.md)

- [`npm install` prunes a lockfile node that `npm ci` then demands back, so adding a workspace reds every CI job in 40 seconds](lessons/npm-install-prunes-a-node-npm-ci-then-demands.md)

- [tsc does not set the executable bit and npm does, so a published CLI works while the same CLI in the workspace answers "Permission denied"](lessons/tsc-does-not-set-the-executable-bit-and-npm-does.md)

- [A transitive dependency can raise the Node floor inside a major, and `engine-strict` turns that into a failed install](lessons/a-transitive-dependency-can-raise-the-node-floor-mid-major.md)

- [Pinning container, volume and network names in docker-compose.yml costs two installs a shared database](lessons/pinned-compose-names-make-two-installs-share-one-database.md)

- [apps/web imported the AI SDK in 19 files without declaring it, and one of those packages was declared only by apps/api](lessons/an-app-that-imports-what-it-does-not-declare-is-upgraded-by-someone-else.md)

- [npm can refuse a new unscoped package name outright — and the three errors you hit first all blame something else](lessons/npm-can-refuse-a-new-unscoped-name-and-says-so-last.md)

- [A large version-number jump doesn't predict breaking risk — where the last breaking release sits does](lessons/version-jump-size-doesnt-predict-breaking-risk.md)
- [A base image's own packaging can break your Dockerfile with zero changelog entry](lessons/base-image-packaging-can-break-with-no-changelog-entry.md)
- [Absorbing a repo into the monorepo silently re-resolves every dependency it had pinned](lessons/monorepo-absorption-discards-the-lockfile.md)
- [A seed that writes a library-owned table with Prisma has to satisfy that library's lookup, not just its schema](lessons/seeded-rows-must-satisfy-the-librarys-lookup.md)

### integration

- [A structured-output schema with length limits and array bounds is refused by Vertex, and every unit test passes](lessons/a-structured-output-schema-with-limits-is-refused-by-vertex.md)
- [`Agent.close()` waits for the response body, so closing a guarded dispatcher before the caller reads it hangs on anything bigger than the socket buffer](lessons/closing-a-dispatcher-waits-for-a-body-nobody-is-reading.md)
- [A connector manifest with no `authType` takes the popup OAuth branch, so moving it into data as `SERVER_SIDE` removes its authorization step](lessons/an-unset-auth-type-is-oauth-not-server-side.md)

- [A file extension can be a TLD, so linkify turns a cited filename into an external link](lessons/a-file-extension-can-be-a-tld.md)

- [A NestJS controller returning a bare string/number/boolean/null serializes wrong](lessons/bare-primitive-response-serialization.md)
- [ragenApiRequest without an explicit \<T\> silently infers Promise\<unknown\>](lessons/ragen-api-request-promise-unknown-inference.md)
- [AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY in local .env.local are Scaleway S3 credentials, not AWS Bedrock ones](lessons/aws-prefixed-env-vars-are-scaleway-s3-not-bedrock.md)
- [A SignatureDoesNotMatch that survives every endpoint/bucket/region combination is the credential pair, not a config typo](lessons/s3-signature-mismatch-across-every-endpoint-is-the-key-not-config.md)

- [A citation recorded at retrieval time counts what the model saw, not what it used](lessons/a-citation-recorded-at-retrieval-time-counts-what-the-model-saw.md)

### frontend

- [Knowledge-list optimization must match the document route](lessons/knowledge-list-optimization-must-match-the-document-route.md)

- [Brain publication after approval needs its own timestamp](lessons/brain-review-publication-needs-approval-timestamp.md)
- [Brain relation proposals need both endpoint versions](lessons/brain-relation-proposals-need-both-endpoint-versions.md)

- [Brain overview counts need the same scope as their destination lists](lessons/brain-overview-counts-need-matching-destinations.md)
- [Brain citations are not pages, and publication completion must reach the mounted screen](lessons/brain-citations-and-publication-state.md)

- [React rewrites `dangerouslySetInnerHTML` on every re-render, so marks added to that DOM vanish the moment the component updates](lessons/react-rewrites-inner-html-on-every-render.md)

- [A custom-property override on `:root` loses to the element that already owns the property, so the declaration renders nothing](lessons/a-custom-property-override-on-root-loses-to-the-element-that-owns-it.md)

- [An SVG logo that keeps its wordmark as live `<text>` renders in a different font for every viewer](lessons/an-svg-logo-with-live-text-is-not-a-logo-asset.md)

- [Moving an App Router page fails typecheck against stale .next/types, and the error blames your code](lessons/moving-a-route-fails-typecheck-until-the-next-build.md)

- [A dependency plus a config entry naming it is not evidence the feature works — the pdfjs alias points at a file that has not existed since the package went ESM, in a webpack block Turbopack never reads](lessons/a-webpack-alias-under-turbopack-pointed-at-a-file-that-does-not-exist.md)

- [A documentation screenshot photographs whatever is not running — an unreachable service renders as an empty section, not an error](lessons/a-documentation-screenshot-photographs-whatever-is-not-running.md)

- [A CSS escape hatch that matched no element shipped and stayed dead, and the page it was written for never existed](lessons/a-css-hook-with-no-consumers-was-never-a-working-hook.md)

- [A `<button>` resets text-transform and text-align, so `uppercase` on the parent and `text-left` you never wrote both lose](lessons/a-button-resets-text-styles-your-utility-class-set.md)

- [`typeof window` is already true while React hydrates, so a server-only branch mismatches whenever client state arrives early](lessons/typeof-window-is-true-during-hydration.md)

### rag

- [`isBinary(path)` reads only the extension, so a DOCX was ingested as text — and the workflow suite, which mocks the check, could not see it](lessons/istextorbinary-with-a-path-reads-only-the-extension.md)

- [A prompt rule the model follows most of the time is not a rule, and two repeats cannot tell you which it is](lessons/a-prompt-rule-the-model-mostly-follows-is-not-enforced.md)

- [A packer that measures one row through a header-aware renderer charges every row for a separator no chunk contains](lessons/measuring-a-row-through-a-header-aware-renderer-halves-the-budget.md)

- [A tool-calling loop can end on its step limit without a word of answer, and a model may ignore the setting meant to stop it](lessons/a-tool-loop-can-end-without-an-answer.md)

### testing

- [DCR resource bindings do not prove a client was used](lessons/dcr-resource-bindings-do-not-prove-a-client-was-used.md)

- [Better Auth OAuth sign-in needs the provider client plugin](lessons/better-auth-oauth-sign-in-needs-the-client-plugin.md)

- [A test that builds the model's answer by hand cannot see what the model actually writes](lessons/a-hand-built-model-answer-cannot-see-the-models-field-names.md)
- [A rubric sentence that permits something can be read by the judge as one that forbids its opposite](lessons/a-rubric-that-permits-reads-as-one-that-forbids.md)

- [A client constructor that fires a request logs after the test has ended, and vitest fails a green suite over it](lessons/a-client-constructor-that-fires-a-request-fails-a-green-suite.md)
- [A findBy query resolves on the commit, not on the effects that follow it — a scroll spy read right after it is a race](lessons/a-find-query-resolves-on-the-commit-not-on-its-effects.md)
- [The e2e suite has never carried a turn through a real chain to an answer, and four separate gaps hide behind that](lessons/the-e2e-suite-has-never-answered-a-chat-turn.md)

- [Five shapes of a test that guards nothing](lessons/three-shapes-of-a-test-that-guards-nothing.md)

- [An architecture guard that scans one app of two is a guard the second app does not have](lessons/an-architecture-guard-that-reads-one-app-of-two.md)
- [TS2307 on a workspace package's subpath has two causes a typo cannot explain](lessons/a-workspace-subpath-that-exists-on-another-branch.md)

- [A transitive `import "server-only"` takes every promptfoo eval down, and nothing reports it because no eval runs in CI](lessons/a-server-only-import-kills-every-promptfoo-eval-silently.md)

- [A status read taken in two round trips reports a run that finished between them — completed, with no result](lessons/a-status-read-in-two-round-trips-reports-a-result-it-never-saw.md)

- [A fallback documented in three comments and implemented in none — only a test written from the doc found it](lessons/a-fallback-documented-in-three-comments-and-implemented-in-none.md)

- [A vitest path filter from the repository root runs none of an app's tests, and reports success](lessons/a-vitest-path-filter-from-the-root-runs-no-app-tests.md)

- [A rename codemod matching `\bjest\.fn\b` misses every call prettier wrapped onto two lines, and the migration looks finished while the suite is red](lessons/a-rename-codemod-misses-what-prettier-wrapped.md)

- [Moving a suite to ESM makes a top-level `process.env` assignment run too late, and the test then asserts against the disabled code path while passing](lessons/esm-hoists-imports-above-a-feature-flag-assignment.md)

- [A benchmark corpus can be too small to see the failure it was built for, and it looks identical to one that works](lessons/a-benchmark-corpus-can-be-too-small-to-see-its-own-failure.md)
- [An eval asserting the old prompt contract reports a regression that is not there](lessons/an-eval-asserting-the-old-prompt-contract-reports-a-regression-that-is-not-there.md)

- [Symlinking `node_modules` into a git worktree makes the suite run against the primary checkout, and report green](lessons/symlinked-node-modules-in-a-worktree-fakes-a-green-suite.md)
- [A unit test that reads the runner's own `process.version` passes in CI and fails on every developer below the required major](lessons/a-unit-test-that-reads-process-version-only-passes-on-ci.md)
- [An e2e locator keyed to a Tailwind colour class fails when the colour is tokenised, while the feature works perfectly](lessons/an-e2e-locator-keyed-to-a-colour-class-breaks-when-colours-move.md)

- [A Stryker mutate entry that matches nothing, or whose tests are out of the runner config, reports success](lessons/stryker-mutate-glob-and-runner-scope-must-agree.md)
- [Flipping a feature default to opt-in broke six e2e specs, and the tier they live in never runs on a PR](lessons/flipping-a-feature-default-broke-specs-in-a-tier-that-never-gates-a-pr.md)
- [A library timer armed in one test file crashes a different one after teardown — and the report blames the wrong file](lessons/a-timer-armed-in-one-test-file-crashes-another.md)
- [Running vitest directly instead of through turbo tests the app against the last built `dist` of a workspace package, not the source you just edited](lessons/a-package-edit-is-invisible-to-apps-until-its-dist-is-rebuilt.md)
- [Deleting a route is invisible to typecheck, because a route is addressed by string and not by symbol](lessons/deleting-a-route-is-invisible-to-typecheck.md)
- [A permission filter on a payload field nothing writes matches nothing, and only the surface that resolves the caller's scope still answers](lessons/a-permission-filter-on-a-field-nothing-writes-matches-nothing.md)
- [An activity the handlers type-check against is not the same thing as one the runtime registers — and `turbo run test` does not run the suite that knows the difference](lessons/an-activity-typed-against-the-registry-is-not-registered-with-it.md)
- [A guardrail evaluated concurrently with the model call it guards loses two races at once](lessons/a-guard-racing-a-model-call-reports-the-wrong-failure.md)
- [A "test this" box that runs a different path from the real one is worse than no box](lessons/a-test-box-that-runs-a-different-path-is-worse-than-none.md)
- [Graph zoom labels need reprocessing, not only a redraw](lessons/graph-zoom-labels-need-reprocessing.md)
