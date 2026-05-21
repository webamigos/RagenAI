import db from '@ragenai/prisma-client';
import type { Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException, BadRequestException } from '@/libs/utils/errors';

type Input = {
  sourceListPublicId: string;
  name: string;
  leadPublicIds: string[];
  organizationId: string;
  createdById: string;
};

// Copies the named leads from the source list into a brand-new list owned by
// the same org. The new list inherits the source list's columns. Source leads
// are left in place; deletion is a separate action.
export const createListFromLeadsCommand = async (
  input: Input,
): Promise<{ publicId: string; rowCount: number }> => {
  const {
    sourceListPublicId,
    name,
    leadPublicIds,
    organizationId,
    createdById,
  } = input;
  if (leadPublicIds.length === 0) {
    throw new BadRequestException('No leads selected');
  }
  const source = await db.leadList.findFirst({
    where: { publicId: sourceListPublicId, organizationId },
    select: { id: true, columns: true },
  });
  if (!source) {
    throw new NotFoundException('Source list not found');
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
        throw new NotFoundException(
          'None of the selected leads were found in the source list',
        );
      }
      if (sourceLeads.length < leadPublicIds.length) {
        const foundIds = new Set(sourceLeads.map((l) => l.publicId));
        const missingIds = leadPublicIds.filter((id) => !foundIds.has(id));
        logger.warn(
          { sourceListPublicId, missingIds },
          'createListFromLeadsCommand: some selected leads were not found',
        );
      }
      const newList = await tx.leadList.create({
        data: {
          organizationId,
          createdById,
          name,
          columns: source.columns as Prisma.InputJsonValue,
          rowCount: sourceLeads.length,
        },
        select: { id: true, publicId: true },
      });
      await tx.lead.createMany({
        data: sourceLeads.map((lead, idx) => ({
          leadListId: newList.id,
          rowIndex: idx,
          data: lead.data as Prisma.InputJsonValue,
          enrichmentStatus: lead.enrichmentStatus,
          enrichedAt: lead.enrichedAt,
          enrichmentError: lead.enrichmentError,
        })),
      });
      return { publicId: newList.publicId, rowCount: sourceLeads.length };
    });
  } catch (error) {
    logger.error(
      { err: error, sourceListPublicId, name, count: leadPublicIds.length },
      'createListFromLeadsCommand failed',
    );
    throw error;
  }
};
