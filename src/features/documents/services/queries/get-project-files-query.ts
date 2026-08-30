'use server';

import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import { ragenApiRequest } from '@/libs/ragen-api-client/client';
import type { Project, FileType } from '@/generated/prisma/client';

type ProjectFileItem = {
  id: string;
  createdAt: Date | null;
  fileName: string;
  fileSize: number;
  fileType: FileType;
  updatedAt: Date | null;
  metadata: unknown;
  organizationId: string;
  parsingStatus: string;
  embeddingStatus: string;
};

export const getProjectFilesQuery = async (
  projectId: Project['id'],
): Promise<ProjectFileItem[]> => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Unauthorized');
  }
  return ragenApiRequest<ProjectFileItem[]>({
    method: 'GET',
    path: `/v1/internal/projects/${encodeURIComponent(projectId)}/files`,
    userId,
    orgId,
  });
};
