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
//   tenant-scope-guard     the warn-on-missing-organizationId Prisma extension;
//                          cross-org IDOR is this codebase's worst failure mode.
//
// Deliberately absent: src/lib/auth-access-control.ts. It holds the pure RBAC
// checks and has no direct unit tests at all, so mutation testing there would
// report a floor rather than a gap. Write those tests first.
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.config.ts' },
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
    'src/libs/db/tenant-scope-guard.ts',
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
  // Measured baseline on this scope: 68.33%. `break` sits just below it so the
  // nightly ratchets against regression rather than failing on day one — raise
  // it as the score climbs. `high`/`low` only colour the report.
  thresholds: { high: 90, low: 80, break: 65 },
  timeoutMS: 60000,
  tempDirName: '.stryker-tmp',
};
