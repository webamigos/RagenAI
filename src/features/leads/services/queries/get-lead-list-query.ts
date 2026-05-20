import { z } from 'zod';
import db from '@ragenai/prisma-client';
import {
  LeadColumnsSchema,
  type LeadColumn,
} from '../../contracts/lead-column.types';
import type {
  LeadDto,
  LeadListDetail,
  LeadListWithLeads,
  ScoringCriterion,
} from '../../contracts/lead-list.types';

function parseColumns(raw: unknown): LeadColumn[] {
  const result = LeadColumnsSchema.safeParse(raw);
  return result.success ? result.data : [];
}

const ScoringCriterionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  maxScore: z.number(),
  weight: z.number(),
});

function parseScoringCriteria(raw: unknown): ScoringCriterion[] | null {
  if (!raw) {
    return null;
  }
  const result = z.array(ScoringCriterionSchema).safeParse(raw);
  return result.success ? result.data : null;
}

function parseScoringDisqualifiers(raw: unknown): string[] | null {
  if (!raw) {
    return null;
  }
  const result = z.array(z.string()).safeParse(raw);
  return result.success ? result.data : null;
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
      scoringFileId: true,
      scoringFile: { select: { fileName: true } },
      scoringCriteria: true,
      scoringDisqualifiers: true,
      scoringCriteriaError: true,
    },
  });
  if (!list) {
    return null;
  }
  return {
    ...list,
    columns: parseColumns(list.columns),
    scoringFileName: list.scoringFile?.fileName ?? null,
    scoringCriteria: parseScoringCriteria(list.scoringCriteria),
    scoringDisqualifiers: parseScoringDisqualifiers(list.scoringDisqualifiers),
    scoringCriteriaError: list.scoringCriteriaError ?? null,
  };
};

export const MAX_LEADS_PAGE_SIZE = 500;
export const DEFAULT_LEADS_PAGE_SIZE = 100;

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
      scoringStatus: true,
      scoringError: true,
      scoredAt: true,
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
    scoringStatus: lead.scoringStatus,
    scoringError: lead.scoringError,
    scoredAt: lead.scoredAt,
  }));

  return { ...detail, leads: dtos, page, totalPages, pageSize };
};
