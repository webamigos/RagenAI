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
 * ingest queue and run after the script exits. Published Brain pages are
 * written again by their publish job, at the generation they are on
 * (`brainRepublishWhere`).
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
  brainRepublishWhere,
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

interface BrainPage {
  publicId: string;
  generation: number;
  fileId: string;
}

async function brainPagesFor(
  orgId: string,
  before: Date,
  limit: number,
): Promise<{ pages: BrainPage[]; total: number }> {
  const prisma = getPrisma();
  const where = brainRepublishWhere(orgId, before);
  const total = await prisma.knowledgePage.count({ where });
  if (limit <= 0) {
    return { pages: [], total };
  }
  const rows = await prisma.knowledgePage.findMany({
    where,
    orderBy: { id: 'asc' },
    ...(Number.isFinite(limit) ? { take: limit } : {}),
    select: {
      publicId: true,
      publicationGeneration: true,
      publishedFileId: true,
    },
  });
  return {
    pages: rows.flatMap((row) =>
      row.publishedFileId
        ? [
            {
              publicId: row.publicId,
              generation: row.publicationGeneration,
              fileId: row.publishedFileId,
            },
          ]
        : [],
    ),
    total,
  };
}

/**
 * Starts the publish job for each page. The file reads STARTED first, as it
 * does after a publish from the panel, so a job that gives up leaves it
 * FAILED and the panel offers to publish again — instead of COMPLETED with
 * nothing in the index. Only a file still COMPLETED is touched.
 */
async function republishBrainPages(
  orgId: string,
  pages: readonly BrainPage[],
): Promise<{ started: number; skipped: number; failed: unknown[] }> {
  const prisma = getPrisma();
  const report = { started: 0, skipped: 0, failed: [] as unknown[] };
  for (const page of pages) {
    const { count } = await prisma.userFile.updateMany({
      where: {
        id: page.fileId,
        organizationId: orgId,
        embeddingStatus: 'COMPLETED',
      },
      data: { embeddingStatus: 'STARTED' },
    });
    if (count === 0) {
      report.skipped += 1;
      continue;
    }
    try {
      await jobs().start(
        'brainPublishPage',
        `reindex-org-brain-${page.publicId}-${page.generation}-${nanoid()}`,
        { orgId, pageId: page.publicId, generation: page.generation },
      );
      report.started += 1;
    } catch (error) {
      report.failed.push(error);
      await prisma.userFile.updateMany({
        where: {
          id: page.fileId,
          organizationId: orgId,
          embeddingStatus: 'STARTED',
        },
        data: { embeddingStatus: 'COMPLETED' },
      });
    }
  }
  return report;
}

async function main() {
  // Validated before any read, let alone a job.
  const args = parseFullReindexArgs(process.argv.slice(2));
  const before = args.before ?? new Date();
  const prisma = getPrisma();

  const orgIds = !args.allOrgs
    ? [args.orgId as string]
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
  let skipped = 0;
  const failed: { orgId: string; fileId: string; error: unknown }[] = [];
  for (const orgId of orgIds) {
    if (budget <= 0) {
      break;
    }
    const { steps, total } = await stepsFor(orgId, before, budget);
    budget -= steps.length;
    const brain = await brainPagesFor(orgId, before, budget);
    budget -= brain.pages.length;
    if (total === 0 && brain.total === 0) {
      continue;
    }
    console.log(
      renderOrgPlan({
        orgId,
        steps,
        remaining: total - steps.length + brain.total - brain.pages.length,
        brainPages: brain.pages.length,
        dryRun: args.dryRun,
      }),
    );
    if (args.dryRun) {
      continue;
    }

    const republished = await republishBrainPages(orgId, brain.pages);
    started += republished.started;
    skipped += republished.skipped;
    failed.push(
      ...republished.failed.map((error) => ({
        orgId,
        fileId: 'a Brain page',
        error,
      })),
    );

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
      // Only while the file is still what the plan selected. One that was
      // withdrawn, staged or restarted since the plan was read is not this
      // run's to reset, and its job is not started.
      reset: async (fileId, workflowId) => {
        const { count } = await prisma.userFile.updateMany({
          where: {
            id: fileId,
            organizationId: orgId,
            embeddingStatus: 'COMPLETED',
          },
          data: {
            parsingStatus: 'NOT_STARTED',
            embeddingStatus: 'NOT_STARTED',
            workflowId,
          },
        });
        return count > 0;
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
    skipped += report.skipped;
    failed.push(...report.failed.map((f) => ({ orgId, ...f })));
  }

  if (args.dryRun) {
    console.log('Dry run: nothing was started.');
    return;
  }
  if (skipped > 0) {
    console.log(
      `${skipped} changed status after the plan was read and were left alone.`,
    );
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
