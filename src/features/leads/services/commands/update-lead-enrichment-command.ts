import db from '@ragenai/prisma-client';
import { LeadEnrichmentStatus } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

export type EnrichmentFields = Record<string, unknown>;

type Success = {
  ok: true;
  fields: EnrichmentFields;
};

type Failure = {
  ok: false;
  error: string;
};

export const markLeadEnrichmentPendingCommand = async (
  leadPublicId: string,
  organizationId: string,
): Promise<void> => {
  const lead = await db.lead.findFirst({
    where: { publicId: leadPublicId, leadList: { organizationId } },
    select: { id: true },
  });
  if (!lead) {
    throw new NotFoundException('Lead not found');
  }
  await db.lead.update({
    where: { id: lead.id },
    data: {
      enrichmentStatus: LeadEnrichmentStatus.pending,
      enrichmentError: null,
    },
  });
};

export const completeLeadEnrichmentCommand = async (
  leadPublicId: string,
  organizationId: string,
  outcome: Success | Failure,
): Promise<void> => {
  const lead = await db.lead.findFirst({
    where: { publicId: leadPublicId, leadList: { organizationId } },
    select: { id: true, data: true },
  });
  if (!lead) {
    throw new NotFoundException('Lead not found');
  }

  try {
    if (outcome.ok) {
      const merged = { ...((lead.data ?? {}) as Record<string, unknown>), ...outcome.fields };
      await db.lead.update({
        where: { id: lead.id },
        data: {
          data: merged as object,
          enrichmentStatus: LeadEnrichmentStatus.enriched,
          enrichedAt: new Date(),
          enrichmentError: null,
        },
      });
    } else {
      await db.lead.update({
        where: { id: lead.id },
        data: {
          enrichmentStatus: LeadEnrichmentStatus.failed,
          enrichmentError: outcome.error.slice(0, 500),
        },
      });
    }
  } catch (error) {
    logger.error({ err: error, leadPublicId }, 'completeLeadEnrichmentCommand failed');
    throw error;
  }
};
