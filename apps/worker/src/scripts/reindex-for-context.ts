/* eslint-disable no-console */
/**
 * Re-index an organization's files that are indexed below the current
 * context version (spec 2026-09-29-contextual-chunks, C2).
 *
 *   # the count per version, and what it would start — reads only
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/reindex-for-context.ts \
 *     --org <organizationId> --dry-run
 *   # start the re-index jobs (at most --limit of them)
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/reindex-for-context.ts \
 *     --org <organizationId> [--limit 50]
 *
 * A file's version is the lowest `context_version` over its body chunks,
 * read from Qdrant; a chunk without one is version 0. A stale file that
 * nobody edited is re-ingested with `runFileEmbeddings`; one whose active
 * version is an edit, an optimization or a rollback goes through
 * `reindexDocumentVersion`, because the stored file still holds the original
 * upload. Nothing is overwritten.
 *
 * It refuses an organization with `contextualChunks` off: the re-index would
 * write no prefix, and the count afterwards would be the count before. Jobs
 * go through the ordinary ingest queue, so the Docling ceiling bounds them as
 * it bounds an upload. They run after the script exits: run it again with
 * `--dry-run` to see the count move. Point it at an environment's
 * `DATABASE_URL`, `REDIS_URL`, `QDRANT_URL` and `QDRANT_API_KEY`.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { nanoid } from 'nanoid';

import { closeJobs, jobs } from '../jobs.js';
import { FREE_CONTEXT_PREFIX_VERSION } from '../services/context-prefix.js';
import { getPrisma } from '../services/db/prisma.js';
import { resolveOrgFeatures } from '../services/org-features.js';
import { qdrantClientOptions } from './document-diagnostics-backfill.js';
import {
  countByVersion,
  fileContextVersions,
  parseReindexArgs,
  planReindex,
  renderVersionCounts,
  startReindexSteps,
  type ContextPoint,
  type ReindexCandidate,
} from './reindex-for-context-plan.js';

const PAGE = 1000;

/** Every point's file, chunk type and context version — payload fields only. */
async function contextPoints(
  qdrant: QdrantClient,
  orgId: string,
): Promise<ContextPoint[]> {
  const points: ContextPoint[] = [];
  let offset: string | number | undefined;
  do {
    const page = await qdrant.scroll(orgId, {
      limit: PAGE,
      offset,
      with_payload: {
        include: [
          'metadata.file_id',
          'metadata.chunk_type',
          'metadata.context_version',
        ],
      },
      with_vector: false,
    });
    points.push(...page.points);
    const next = page.next_page_offset;
    offset =
      typeof next === 'string' || typeof next === 'number' ? next : undefined;
  } while (offset !== undefined);
  return points;
}

async function candidatesFor(
  orgId: string,
  fileIds: string[],
): Promise<ReindexCandidate[]> {
  const files = await getPrisma().userFile.findMany({
    where: { organizationId: orgId, id: { in: fileIds } },
    select: {
      id: true,
      fileName: true,
      projectId: true,
      documentId: true,
      document: {
        select: {
          id: true,
          versions: {
            where: { isActive: true, organizationId: orgId },
            select: { changeType: true },
          },
        },
      },
    },
  });
  return files.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    projectId: file.projectId,
    documentId: file.document?.id ?? file.documentId,
    activeChangeType: file.document?.versions[0]?.changeType ?? null,
  }));
}

async function main() {
  // Validated before any read, let alone a job.
  const { orgId, dryRun, limit } = parseReindexArgs(process.argv.slice(2));
  const current = FREE_CONTEXT_PREFIX_VERSION;

  const features = await resolveOrgFeatures(orgId);
  if (!features.contextualChunks.value) {
    throw new Error(
      `contextualChunks is off for organization ${orgId}, so a re-index would ` +
        'write no prefix. Turn it on in apps/admin first.',
    );
  }

  const qdrant = new QdrantClient(
    qdrantClientOptions(
      process.env.QDRANT_URL || 'http://localhost:6333',
      process.env.QDRANT_API_KEY,
    ),
  );
  if (!(await qdrant.collectionExists(orgId)).exists) {
    console.log(`No collection for organization ${orgId}; nothing is indexed.`);
    return;
  }

  const versions = fileContextVersions(await contextPoints(qdrant, orgId));
  console.log(
    `Current context version: ${current}. Files per version now:\n` +
      renderVersionCounts(countByVersion(versions)),
  );

  const stale = [...versions].filter(([, v]) => v < current).map(([id]) => id);
  const { steps, missing } = planReindex(
    versions,
    await candidatesFor(orgId, stale),
    { current, limit },
  );
  const byJob = (job: string) => steps.filter((s) => s.job === job).length;
  console.log(
    `\n${stale.length} below version ${current}; ${dryRun ? 'would start' : 'starting'} ` +
      `${steps.length} (${byJob('runFileEmbeddings')} re-ingest, ` +
      `${byJob('reindexDocumentVersion')} from an edited version)` +
      (missing > 0 ? `; ${missing} have no file row and are skipped` : '') +
      (stale.length - missing > steps.length ? `; the rest past --limit` : '') +
      '.',
  );
  if (dryRun) {
    return;
  }

  const prisma = getPrisma();
  const { started, failed } = await startReindexSteps(steps, {
    newWorkflowId: () => `reindex-context-${nanoid()}`,
    readState: (fileId) =>
      prisma.userFile.findFirst({
        where: { id: fileId, organizationId: orgId },
        select: {
          parsingStatus: true,
          embeddingStatus: true,
          workflowId: true,
        },
      }),
    reset: async (fileId, workflowId) => {
      await prisma.userFile.updateMany({
        where: { id: fileId, organizationId: orgId },
        data: {
          parsingStatus: 'NOT_STARTED',
          embeddingStatus: 'NOT_STARTED',
          workflowId,
        },
      });
    },
    restore: async (fileId, state, workflowId) => {
      await prisma.userFile.updateMany({
        where: { id: fileId, organizationId: orgId, workflowId },
        data: state,
      });
    },
    start: (step, workflowId) =>
      step.job === 'runFileEmbeddings'
        ? jobs().start('runFileEmbeddings', workflowId, {
            fileId: step.fileId,
            orgId,
          })
        : jobs().start('reindexDocumentVersion', workflowId, {
            orgId,
            fileId: step.fileId,
            fileName: step.fileName,
            projectId: step.projectId,
            userId: null,
            documentId: step.documentId,
          }),
  });
  console.log(
    `Started ${started}. Run again with --dry-run once they finish to see the count move.`,
  );
  if (failed.length > 0) {
    console.error(
      `${failed.length} did not start. A failed start puts the file's ` +
        'previous status back, unless the error below says it could not:',
    );
    for (const { fileId, error } of failed) {
      console.error(`  ${fileId}:`, error);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([getPrisma().$disconnect(), closeJobs()]));
