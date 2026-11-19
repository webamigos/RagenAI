/* eslint-disable no-console */
/**
 * Re-index every document of an organization from the database — what an
 * embedding-model change needs (docs/appliance-runbook.md, section 8.2).
 *
 * `reindex-for-context.ts` finds its files by reading Qdrant. After a model
 * change the collections are deleted, so it reports nothing to do; this one
 * reads `user_files` instead.
 *
 *   # what it would start — reads only
 *   node dist/scripts/reindex-organization.js --all-orgs --dry-run
 *   # start everything
 *   node dist/scripts/reindex-organization.js --all-orgs
 *   # or in batches: the same --before on every run
 *   node dist/scripts/reindex-organization.js --org <organizationId> \
 *     --before 2026-11-19T01:00:00Z --limit 200
 *
 * On an appliance it runs in the worker image, which has the database and
 * the queue in its environment:
 *
 *   docker compose run --rm --no-deps worker node dist/scripts/reindex-organization.js --all-orgs --dry-run
 *
 * From a checkout: `npx tsx --env-file=.env.local apps/worker/src/scripts/reindex-organization.ts …`.
 *
 * A file nobody edited is re-ingested with `runFileEmbeddings`; one whose
 * active version is an edit, an optimization or a rollback goes through
 * `reindexDocumentVersion`, because the stored file still holds the original
 * upload. Which files it takes: `fullReindexWhere`. Jobs join the ordinary
 * ingest queue and run after the script exits. Published Brain pages are not
 * covered — their chunks are written by publishing.
 */
import { nanoid } from 'nanoid';

import { closeJobs, jobs } from '../jobs.js';
import { getPrisma } from '../services/db/prisma.js';
import {
  reindexStepFor,
  startReindexSteps,
  type ReindexStep,
} from './reindex-for-context-plan.js';
import {
  fullReindexWhere,
  parseFullReindexArgs,
  renderOrgPlan,
} from './reindex-organization-plan.js';

const PAGE = 500;

async function stepsFor(
  orgId: string,
  before: Date,
  limit: number,
): Promise<{ steps: ReindexStep[]; total: number }> {
  const prisma = getPrisma();
  const where = fullReindexWhere(orgId, before);
  const total = await prisma.userFile.count({ where });
  const steps: ReindexStep[] = [];
  let cursor: string | undefined;
  while (steps.length < limit) {
    const files = await prisma.userFile.findMany({
      where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: Math.min(PAGE, limit - steps.length),
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
    if (files.length === 0) {
      break;
    }
    for (const file of files) {
      steps.push(
        reindexStepFor({
          id: file.id,
          fileName: file.fileName,
          projectId: file.projectId,
          documentId: file.document?.id ?? file.documentId,
          activeChangeType: file.document?.versions[0]?.changeType ?? null,
        }),
      );
    }
    cursor = files[files.length - 1].id;
  }
  return { steps, total };
}

async function main() {
  // Validated before any read, let alone a job.
  const args = parseFullReindexArgs(process.argv.slice(2));
  const before = args.before ?? new Date();
  const prisma = getPrisma();

  const orgIds = args.orgId
    ? [args.orgId]
    : (
        await prisma.organization.findMany({
          select: { id: true },
          orderBy: { id: 'asc' },
        })
      ).map((org) => org.id);

  console.log(
    `Re-indexing files embedded before ${before.toISOString()} in ` +
      `${orgIds.length} organization${orgIds.length === 1 ? '' : 's'}.`,
  );

  let budget = args.limit;
  let started = 0;
  const failed: { orgId: string; fileId: string; error: unknown }[] = [];
  for (const orgId of orgIds) {
    if (budget <= 0) {
      break;
    }
    const { steps, total } = await stepsFor(orgId, before, budget);
    const brainPages = await prisma.userFile.count({
      where: { organizationId: orgId, publishedPages: { some: {} } },
    });
    if (total === 0 && brainPages === 0) {
      continue;
    }
    console.log(
      renderOrgPlan({
        orgId,
        steps,
        remaining: total - steps.length,
        brainPages,
        dryRun: args.dryRun,
      }),
    );
    budget -= steps.length;
    if (args.dryRun) {
      continue;
    }

    const report = await startReindexSteps(steps, {
      newWorkflowId: () => `reindex-org-${nanoid()}`,
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
    started += report.started;
    failed.push(...report.failed.map((f) => ({ orgId, ...f })));
  }

  if (args.dryRun) {
    console.log('Dry run: nothing was started.');
    return;
  }
  console.log(
    `Started ${started}. They run on the ordinary ingest queue. For the next ` +
      `batch, or to see what is left, run again with --before ${before.toISOString()}.`,
  );
  if (failed.length > 0) {
    console.error(
      `${failed.length} did not start. A failed start puts the file's ` +
        'previous status back, unless the error below says it could not:',
    );
    for (const { orgId, fileId, error } of failed) {
      console.error(`  ${orgId} ${fileId}:`, error);
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
