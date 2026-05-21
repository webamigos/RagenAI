import db from '@ragenai/prisma-client';
import type { LeadDto } from '../../contracts/lead-list.types';

export const getLeadByPublicIdQuery = async (
  publicId: string,
  organizationId: string,
): Promise<LeadDto | null> => {
  const lead = await db.lead.findFirst({
    where: { publicId, leadList: { organizationId } },
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
  if (!lead) {
    return null;
  }
  return {
    id: lead.id,
    publicId: lead.publicId,
    rowIndex: lead.rowIndex,
    data: (lead.data ?? {}) as Record<string, unknown>,
    enrichmentStatus: lead.enrichmentStatus,
    enrichedAt: lead.enrichedAt,
    enrichmentError: lead.enrichmentError,
  };
};
