import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export interface DriveSyncDto {
  id: string;
  driveFolderId: string;
  folderName: string;
  enabled: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

export const getDriveSyncsQuery = async (
  organizationId: string,
  projectId?: string,
) => {
  try {
    if (projectId) {
      const project = await db.project.findFirst({
        where: { id: projectId, organizationId },
        select: { id: true },
      });
      if (!project) {
        return { success: true as const, syncs: [] };
      }
    }

    const syncs = await db.googleDriveSync.findMany({
      where: {
        organizationId,
        ...(projectId ? { projectId } : {}),
      },
      select: {
        id: true,
        driveFolderId: true,
        folderName: true,
        enabled: true,
        lastSyncedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true as const, syncs };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching Drive syncs');
    return {
      success: false as const,
      error: 'Failed to fetch syncs',
      syncs: [],
    };
  }
};
