// Mutation testing, deliberately narrow.
//
// Stryker re-runs the covering tests once per mutant, so pointing it at all
// ~1700 unit tests would cost hours and mostly produce noise: much of that suite
// exercises React components against mocked boundaries, where a surviving mutant
// usually means "the boundary is mocked", not "the assertion is weak".
//
// The targets here are small, pure, and expensive to get wrong — a test that
// passes without really asserting anything is a genuine hazard:
//
//   packages/rag-core      the BM25 tokenizer and FNV-1a hash. Indexing and
//                          querying must hash terms identically or retrieval
//                          degrades silently (ADR-26).
//   packages/storage       path-traversal defence and the provider factory,
//                          including the local-in-production warning (ADR-27).
//   packages/observability attribute normalization and span error handling
//                          (ADR-28).
//   tenant-scope-guard     the warn-on-missing-organizationId Prisma extension
//                          in apps/web; cross-org IDOR is this codebase's worst
//                          failure mode.
//
// `mutate` and the `include` list in vitest.mutation.config.ts are two halves of
// one decision: a path here whose covering tests are not run there produces only
// surviving mutants. Change them together.
//
// Deliberately absent: apps/web/src/lib/auth-access-control.ts. It holds the
// pure RBAC checks and has no direct unit tests at all, so mutation testing
// there would report a floor rather than a gap. Write those tests first.
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  // NOT the root vitest.config.ts: that one covers packages/* only, so the
  // tenant-scope-guard test under apps/web would never run and every mutant in
  // that file would survive by default. See vitest.mutation.config.ts.
  vitest: { configFile: 'vitest.mutation.config.ts' },
  // Only run the tests that actually cover each mutant. Without this every
  // mutant costs a full suite run.
  coverageAnalysis: 'perTest',
  // Listed explicitly rather than globbed over packages/*: a new package should
  // enter this scope by someone deciding it belongs here, not by existing.
  mutate: [
    'packages/rag-core/src/**/*.ts',
    'packages/storage/src/**/*.ts',
    'packages/observability/src/**/*.ts',
    '!packages/*/src/**/__tests__/**',
    'apps/web/src/libs/db/tenant-scope-guard.ts',
  ],
  // Stryker copies the project into a sandbox and does NOT read .gitignore. Two
  // things go wrong without this: the copy walks .claude/worktrees, which can
  // contain unix sockets (`ENOTSUP: copyfile`), and it needlessly duplicates
  // multi-gigabyte build output. node_modules is symlinked, not copied, so the
  // packages' dist/ (reached through the workspace symlinks) still resolves.
  ignorePatterns: [
    '.claude',
    '.cursor',
    '.git',
    '.next',
    '.nx',
    'coverage',
    'reports',
    'playwright-report',
    'test-results',
    'blob-report',
    'ctrf',
    'volumes',
    'evals/results',
    'apps/*/dist',
    'apps/*/coverage',
    '.stryker-tmp',
  ],
  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  // Measured on this scope: 84.99% total (packages 80.75%, tenant-scope-guard
  // 99.05%). `break` sits below it so the nightly ratchets against regression
  // rather than failing on a rounding wobble — raise it as the score climbs.
  // `high`/`low` only colour the report.
  //
  // The earlier 68.33% recorded here measured packages/* alone: the guard was
  // in `mutate` under its pre-ADR-29 path, matched nothing, and Stryker skips a
  // `mutate` glob that matches nothing without a word of complaint.
  thresholds: { high: 90, low: 80, break: 80 },
  timeoutMS: 60000,
  tempDirName: '.stryker-tmp',
};
