import db from '@ragenai/prisma-client';
import type { LeadEnrichmentJobStatus } from '@/generated/prisma/client';

export type LeadEnrichmentJobDto = {
  publicId: string;
  status: LeadEnrichmentJobStatus;
  total: number;
  processed: number;
  failed: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

export const getActiveEnrichmentJobQuery = async (
  leadListPublicId: string,
  organizationId: string,
): Promise<LeadEnrichmentJobDto | null> => {
  const job = await db.leadEnrichmentJob.findFirst({
    where: {
      leadList: { publicId: leadListPublicId, organizationId },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      publicId: true,
      status: true,
      total: true,
      processed: true,
      failed: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
    },
  });
  return job;
};
