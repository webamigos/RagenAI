import db from '@ragenai/prisma-client';
import { LeadEnrichmentStatus, Prisma } from '@/generated/prisma/client';
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

/**
 * Conditionally marks a lead as `pending`. Returns false if the lead is
 * already pending (another enrichment is in-flight) so the caller can
 * skip the upstream call. Throws if the lead does not exist in the org.
 */
export const markLeadEnrichmentPendingCommand = async (
  leadPublicId: string,
  organizationId: string,
): Promise<boolean> => {
  const lead = await db.lead.findFirst({
    where: { publicId: leadPublicId, leadList: { organizationId } },
    select: { id: true, leadListId: true },
  });
  if (!lead) {
    throw new NotFoundException('Lead not found');
  }
  const result = await db.lead.updateMany({
    where: { id: lead.id, enrichmentStatus: { not: LeadEnrichmentStatus.pending } },
    data: {
      enrichmentStatus: LeadEnrichmentStatus.pending,
      enrichmentError: null,
    },
  });
  if (result.count === 0) {
    return false;
  }
  await db.leadList.update({
    where: { id: lead.leadListId },
    data: { updatedAt: new Date() },
  });
  return true;
};

export const completeLeadEnrichmentCommand = async (
  leadPublicId: string,
  organizationId: string,
  outcome: Success | Failure,
): Promise<void> => {
  const lead = await db.lead.findFirst({
    where: { publicId: leadPublicId, leadList: { organizationId } },
    select: { id: true, leadListId: true, data: true },
  });
  if (!lead) {
    throw new NotFoundException('Lead not found');
  }

  try {
    const leadUpdate = outcome.ok
      ? db.lead.update({
          where: { id: lead.id },
          data: {
            data: { ...((lead.data ?? {}) as Record<string, unknown>), ...outcome.fields } as Prisma.InputJsonValue,
            enrichmentStatus: LeadEnrichmentStatus.enriched,
            enrichedAt: new Date(),
            enrichmentError: null,
          },
        })
      : db.lead.update({
          where: { id: lead.id },
          data: {
            enrichmentStatus: LeadEnrichmentStatus.failed,
            enrichmentError:
              outcome.error.length > 500 ? `${outcome.error.slice(0, 499)}…` : outcome.error,
          },
        });

    await db.$transaction([
      leadUpdate,
      db.leadList.update({
        where: { id: lead.leadListId },
        data: { updatedAt: new Date() },
      }),
    ]);
  } catch (error) {
    logger.error({ err: error, leadPublicId }, 'completeLeadEnrichmentCommand failed');
    throw error;
  }
};
