import db from '@ragenai/prisma-client';
import { Prisma } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';
import { ENRICHMENT_COLUMNS, type LeadColumn } from '../../contracts/lead-column.types';

type CreateLeadListInput = {
  organizationId: string;
  createdById: string;
  name: string;
  columns: LeadColumn[];
  rows: Array<Record<string, unknown>>;
};

export const createLeadListCommand = async (
  input: CreateLeadListInput,
): Promise<{ id: number; publicId: string }> => {
  const csvKeys = new Set(input.columns.map((c) => c.key));
  const enrichmentColumns = ENRICHMENT_COLUMNS.filter((c) => !csvKeys.has(c.key));
  const allColumns: LeadColumn[] = [...input.columns, ...enrichmentColumns];

  try {
    return await db.$transaction(async (tx) => {
      const list = await tx.leadList.create({
        data: {
          organizationId: input.organizationId,
          createdById: input.createdById,
          name: input.name,
          columns: allColumns as unknown as Prisma.InputJsonValue,
          rowCount: input.rows.length,
        },
        select: { id: true, publicId: true },
      });

      if (input.rows.length > 0) {
        await tx.lead.createMany({
          data: input.rows.map((row, idx) => ({
            leadListId: list.id,
            rowIndex: idx,
            data: row as Prisma.InputJsonValue,
          })),
        });
      }

      return list;
    });
  } catch (error) {
    logger.error({ err: error }, 'createLeadListCommand failed');
    throw error;
  }
};
