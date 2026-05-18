import db from '@ragenai/prisma-client';
import { LeadColumnsSchema, type LeadColumn } from '../../contracts/lead-column.types';
import type {
  LeadDto,
  LeadListDetail,
  LeadListWithLeads,
} from '../../contracts/lead-list.types';

function parseColumns(raw: unknown): LeadColumn[] {
  const result = LeadColumnsSchema.safeParse(raw);
  return result.success ? result.data : [];
}

export const getLeadListQuery = async (
  publicId: string,
  organizationId: string,
): Promise<LeadListDetail | null> => {
  const list = await db.leadList.findFirst({
    where: { publicId, organizationId },
    select: {
      id: true,
      publicId: true,
      name: true,
      columns: true,
      rowCount: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!list) {
    return null;
  }
  return { ...list, columns: parseColumns(list.columns) };
};

export const MAX_LEADS_PAGE_SIZE = 2000;

export const getLeadListWithLeadsQuery = async (
  publicId: string,
  organizationId: string,
  options: { take?: number; skip?: number } = {},
): Promise<LeadListWithLeads | null> => {
  const detail = await getLeadListQuery(publicId, organizationId);
  if (!detail) {
    return null;
  }

  const take = Math.min(Math.max(1, options.take ?? 500), MAX_LEADS_PAGE_SIZE);
  const skip = Math.max(0, options.skip ?? 0);

  const leads = await db.lead.findMany({
    where: { leadListId: detail.id },
    orderBy: { rowIndex: 'asc' },
    take,
    skip,
    select: {
      id: true,
      publicId: true,
      rowIndex: true,
      data: true,
      enrichmentStatus: true,
      enrichedAt: true,
      enrichmentError: true,
    },
  });

  const dtos: LeadDto[] = leads.map((lead) => ({
    id: lead.id,
    publicId: lead.publicId,
    rowIndex: lead.rowIndex,
    data: (lead.data ?? {}) as Record<string, unknown>,
    enrichmentStatus: lead.enrichmentStatus,
    enrichedAt: lead.enrichedAt,
    enrichmentError: lead.enrichmentError,
  }));

  return { ...detail, leads: dtos };
};
