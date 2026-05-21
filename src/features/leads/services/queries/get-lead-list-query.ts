import db from '@ragenai/prisma-client';
import {
  LeadColumnsSchema,
  type LeadColumn,
} from '../../contracts/lead-column.types';
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

// Pagination is now client-side via TanStack Table, so the query fetches all
// rows in one go. The cap matches the CSV import cap (MAX_CSV_ROWS) to bound
// memory in pathological cases.
export const MAX_LEADS_PAGE_SIZE = 50_000;
export const DEFAULT_LEADS_PAGE_SIZE = 50_000;

export const getLeadListWithLeadsQuery = async (
  publicId: string,
  organizationId: string,
  options: { page?: number; pageSize?: number } = {},
): Promise<
  | (LeadListWithLeads & { page: number; totalPages: number; pageSize: number })
  | null
> => {
  const detail = await getLeadListQuery(publicId, organizationId);
  if (!detail) {
    return null;
  }

  const pageSize = Math.min(
    Math.max(1, options.pageSize ?? DEFAULT_LEADS_PAGE_SIZE),
    MAX_LEADS_PAGE_SIZE,
  );
  const totalPages = Math.max(1, Math.ceil(detail.rowCount / pageSize));
  const page = Math.min(Math.max(1, options.page ?? 1), totalPages);
  const skip = (page - 1) * pageSize;

  const leads = await db.lead.findMany({
    where: { leadListId: detail.id },
    orderBy: { rowIndex: 'asc' },
    take: pageSize,
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

  return { ...detail, leads: dtos, page, totalPages, pageSize };
};
