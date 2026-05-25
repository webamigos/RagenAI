import db from '@ragenai/prisma-client';
import { LeadScoringStatus, type Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

type ScoringSuccess = { ok: true; score: number; justification: string };
type ScoringFailure = { ok: false; error: string };

/**
 * Conditionally marks a lead as `pending`. Returns false if the lead is
 * already pending (another scoring is in-flight) so the caller can
 * skip the upstream call. Throws if the lead does not exist in the org.
 */
export const markLeadScoringPendingCommand = async (
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
  let claimed = false;
  try {
    await db.$transaction(async (tx) => {
      const result = await tx.lead.updateMany({
        where: {
          id: lead.id,
          scoringStatus: { not: LeadScoringStatus.pending },
        },
        data: {
          scoringStatus: LeadScoringStatus.pending,
          scoringError: null,
        },
      });
      if (result.count === 0) {
        return;
      }
      claimed = true;
      await tx.leadList.update({
        where: { id: lead.leadListId },
        data: { updatedAt: new Date() },
      });
    });
  } catch (error) {
    logger.error(
      { err: error, leadPublicId },
      'markLeadScoringPendingCommand failed',
    );
    throw error;
  }
  return claimed;
};

export const completeLeadScoringCommand = async (
  leadPublicId: string,
  organizationId: string,
  outcome: ScoringSuccess | ScoringFailure,
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
            data: {
              ...((lead.data ?? {}) as Record<string, unknown>),
              _enrichment_score: outcome.score,
              _enrichment_score_justification: outcome.justification,
            } as Prisma.InputJsonValue,
            scoringStatus: LeadScoringStatus.scored,
            scoringError: null,
            scoredAt: new Date(),
          },
        })
      : db.lead.update({
          where: { id: lead.id },
          data: {
            scoringStatus: LeadScoringStatus.failed,
            scoringError:
              outcome.error.length > 500
                ? `${outcome.error.slice(0, 499)}…`
                : outcome.error,
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
    logger.error(
      { err: error, leadPublicId },
      'completeLeadScoringCommand failed',
    );
    throw error;
  }
};
