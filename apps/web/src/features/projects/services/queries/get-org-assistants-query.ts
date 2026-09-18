'use server';

import db from '@ragenai/prisma-client';

/**
 * Every assistant in the organization, as id and name only.
 *
 * Deliberately not `getUserProjectsQuery`: that one loads each project's
 * threads and every message in them, which is the wrong shape for a picker
 * and a lot of decrypted content to fetch for a dropdown.
 */
export const getOrgAssistantsQuery = async (organizationId: string) => {
  return db.project.findMany({
    where: { organizationId, isArchived: false },
    select: { id: true, title: true },
    orderBy: { createdAt: 'asc' },
  });
};
