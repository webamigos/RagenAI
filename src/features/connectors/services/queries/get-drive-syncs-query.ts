import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

export interface DriveSyncDto {
  id: number;
  publicId: string;
  driveFolderId: string;
  folderName: string;
  enabled: boolean;
  lastSyncedAt: Date | null;
  createdAt: Date;
}

export const getDriveSyncsQuery = async (
  organizationId: string,
  projectPublicId?: string,
) => {
  try {
    let projectId: number | undefined;
    if (projectPublicId) {
      const project = await db.project.findFirst({
        where: { publicId: projectPublicId, organizationId },
        select: { id: true },
      });
      if (!project) {
        return { success: true as const, syncs: [] };
      }
      projectId = project.id;
    }

    const syncs = await db.googleDriveSync.findMany({
      where: {
        organizationId,
        ...(projectId ? { projectId } : {}),
      },
      select: {
        id: true,
        publicId: true,
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
