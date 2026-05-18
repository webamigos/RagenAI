import db from '@ragenai/prisma-client';
import {
  LeadEnrichmentJobStatus,
  LeadEnrichmentStatus,
  Prisma,
} from '@/generated/prisma/client';
import { NotFoundException } from '@/libs/utils/errors';
import { logger } from '@/app/lib/utils/logger';

const MAX_LEADS_PER_JOB = 5000;

// 32-bit namespace constant for pg_advisory_xact_lock(int4, int4). The
// second key is the leadList.id, so concurrent bulk-enrich starts on
// the same list serialize through a postgres advisory lock.
const ADVISORY_LOCK_NAMESPACE = 0x1ead0001;

export type CreateEnrichmentJobResult = {
  jobPublicId: string;
  leadPublicIds: string[];
  total: number;
};

/**
 * Atomically creates a `LeadEnrichmentJob` row and gathers the lead
 * publicIds to process (only those that are not already pending or
 * enriched). Returns empty list when there's nothing to do.
 */
export const createEnrichmentJobCommand = async (
  leadListPublicId: string,
  organizationId: string,
): Promise<CreateEnrichmentJobResult> => {
  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: { id: true },
  });
  if (!list) {
    throw new NotFoundException('Lead list not found');
  }

  return db.$transaction(async (tx) => {
    // Serializes concurrent starts against the same list. The lock is
    // released automatically at transaction end.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}::int, ${list.id}::int)`;

    const activeJob = await tx.leadEnrichmentJob.findFirst({
      where: {
        leadListId: list.id,
        status: {
          in: [LeadEnrichmentJobStatus.pending, LeadEnrichmentJobStatus.running],
        },
      },
      select: { publicId: true },
      orderBy: { createdAt: 'desc' },
    });
    if (activeJob) {
      logger.info(
        { jobPublicId: activeJob.publicId },
        'Bulk enrich requested but a job is already active',
      );
      return { jobPublicId: activeJob.publicId, leadPublicIds: [], total: 0 };
    }

    const leads = await tx.lead.findMany({
      where: {
        leadListId: list.id,
        enrichmentStatus: {
          in: [LeadEnrichmentStatus.idle, LeadEnrichmentStatus.failed],
        },
      },
      select: { publicId: true },
      orderBy: { rowIndex: 'asc' },
      take: MAX_LEADS_PER_JOB,
    });

    const job = await tx.leadEnrichmentJob.create({
      data: {
        leadListId: list.id,
        status: LeadEnrichmentJobStatus.pending,
        total: leads.length,
        processed: 0,
        failed: 0,
      },
      select: { publicId: true },
    });

    return {
      jobPublicId: job.publicId,
      leadPublicIds: leads.map((l) => l.publicId),
      total: leads.length,
    };
  });
};

export const recordJobWorkflowIdCommand = async (
  jobPublicId: string,
  workflowId: string,
): Promise<void> => {
  try {
    await db.leadEnrichmentJob.update({
      where: { publicId: jobPublicId },
      data: {
        workflowId,
        status: LeadEnrichmentJobStatus.running,
        startedAt: new Date(),
      },
    });
  } catch (error) {
    // P2025 = record not found; bubble up so the caller can compensate
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new NotFoundException('Enrichment job not found');
    }
    throw error;
  }
};

export const markJobFailedCommand = async (
  jobPublicId: string,
  reason: string,
): Promise<void> => {
  await db.leadEnrichmentJob.updateMany({
    where: { publicId: jobPublicId },
    data: {
      status: LeadEnrichmentJobStatus.failed,
      finishedAt: new Date(),
    },
  });
  logger.error({ jobPublicId, reason }, 'Lead enrichment job marked as failed');
};
