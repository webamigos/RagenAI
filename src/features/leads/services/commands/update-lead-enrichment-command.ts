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

export const markLeadEnrichmentPendingCommand = async (
  leadPublicId: string,
  organizationId: string,
): Promise<void> => {
  const lead = await db.lead.findFirst({
    where: { publicId: leadPublicId, leadList: { organizationId } },
    select: { id: true, leadListId: true },
  });
  if (!lead) {
    throw new NotFoundException('Lead not found');
  }
  await db.$transaction([
    db.lead.update({
      where: { id: lead.id },
      data: {
        enrichmentStatus: LeadEnrichmentStatus.pending,
        enrichmentError: null,
      },
    }),
    db.leadList.update({
      where: { id: lead.leadListId },
      data: { updatedAt: new Date() },
    }),
  ]);
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
