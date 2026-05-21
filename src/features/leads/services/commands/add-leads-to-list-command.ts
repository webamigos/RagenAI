import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException, BadRequestException } from '@/libs/utils/errors';

type Input = {
  sourceListPublicId: string;
  targetListPublicId: string;
  leadPublicIds: string[];
  organizationId: string;
};

// Copies leads from the source list into an existing target list (same org).
// Lead `data` is copied verbatim; if the target list's column schema lacks
// some source keys, those values stay in the row but are invisible in the
// grid (the UI iterates over the target's column definitions). Acceptable
// trade-off — keeps the command simple and avoids cross-list schema merges.
export const addLeadsToListCommand = async (
  input: Input,
): Promise<{ added: number; targetListPublicId: string }> => {
  const {
    sourceListPublicId,
    targetListPublicId,
    leadPublicIds,
    organizationId,
  } = input;
  if (leadPublicIds.length === 0) {
    throw new BadRequestException('No leads selected');
  }
  if (sourceListPublicId === targetListPublicId) {
    throw new BadRequestException('Source and target list are the same');
  }
  const [source, target] = await Promise.all([
    db.leadList.findFirst({
      where: { publicId: sourceListPublicId, organizationId },
      select: { id: true },
    }),
    db.leadList.findFirst({
      where: { publicId: targetListPublicId, organizationId },
      select: { id: true, rowCount: true },
    }),
  ]);
  if (!source) {
    throw new NotFoundException('Source list not found');
  }
  if (!target) {
    throw new NotFoundException('Target list not found');
  }
  try {
    return await db.$transaction(async (tx) => {
      const sourceLeads = await tx.lead.findMany({
        where: { leadListId: source.id, publicId: { in: leadPublicIds } },
        orderBy: { rowIndex: 'asc' },
        select: {
          publicId: true,
          data: true,
          enrichmentStatus: true,
          enrichedAt: true,
          enrichmentError: true,
        },
      });
      if (sourceLeads.length === 0) {
        return { added: 0, targetListPublicId };
      }
      if (sourceLeads.length < leadPublicIds.length) {
        const foundIds = new Set(sourceLeads.map((l) => l.publicId));
        const missingIds = leadPublicIds.filter((id) => !foundIds.has(id));
        logger.warn(
          { sourceListPublicId, targetListPublicId, missingIds },
          'addLeadsToListCommand: some selected leads were not found',
        );
      }
      await tx.lead.createMany({
        data: sourceLeads.map((lead, idx) => ({
          leadListId: target.id,
          rowIndex: target.rowCount + idx,
          data: lead.data as Prisma.InputJsonValue,
          enrichmentStatus: lead.enrichmentStatus,
          enrichedAt: lead.enrichedAt,
          enrichmentError: lead.enrichmentError,
        })),
      });
      await tx.leadList.update({
        where: { id: target.id },
        data: { rowCount: { increment: sourceLeads.length } },
      });
      return { added: sourceLeads.length, targetListPublicId };
    });
  } catch (error) {
    logger.error(
      {
        err: error,
        sourceListPublicId,
        targetListPublicId,
        count: leadPublicIds.length,
      },
      'addLeadsToListCommand failed',
    );
    throw error;
  }
};
