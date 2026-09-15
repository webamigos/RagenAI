'use strict';
/**
 * What a background job is called, what it is handed, and what it hands back.
 *
 * This file is the reason the package exists. The same six job names were
 * declared twice before it — as a `Workflow` enum in
 * `apps/web/src/features/documents/contracts/document.types.ts` and as a
 * hand-maintained subset in `apps/api/src/temporal/temporal.consts.ts`, whose
 * own comment said "keep in sync by hand". That is the duplication
 * [ADR-33](../../../docs/adrs/33-shared-platform-contracts-package.md) exists
 * to stop; it lands here rather than in `platform-contracts` because it is
 * runtime plumbing, not a per-organization capability.
 *
 * The payloads moved from `apps/worker`, which is where they were already
 * defined and documented as payloads rather than as row mirrors. Nothing about
 * their shape changes here: a payload's shape is in the history of every
 * unfinished run, so relocating it is the only safe operation.
 */
Object.defineProperty(exports, '__esModule', { value: true });
exports.JOB_NAMES = void 0;
/**
 * Every job this deployment can run, by the name it has always had.
 *
 * The strings are unchanged on purpose: they are what a producer wrote into
 * `UserFile.workflowId`, what an in-flight engine record is keyed by, and what
 * the repo's "reference by string name, not function import" convention has
 * always meant. Renaming one is a migration, not a refactor.
 */
exports.JOB_NAMES = [
  'runFileEmbeddings',
  'scrapeWebsite',
  'generateDocument',
  'reindexDocumentVersion',
  'optimizeDocument',
  'scoreDocument',
  'cleanupDemoThreads',
  'pruneAnalyticsRetrievals',
];
//# sourceMappingURL=contract.js.map
