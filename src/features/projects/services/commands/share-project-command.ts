'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { sendNotificationToUser } from '@/features/notifications/utils/send-notification-to-user';
import type {
  ProjectGranteeType,
  ProjectPermissionLevel,
} from '../../contracts/project-permission.types';

type ShareProjectParams = {
  projectId: string;
  organizationId: string;
  granteeType: ProjectGranteeType;
  granteeId: string;
  permission: ProjectPermissionLevel;
  grantedBy: string;
};

type OperationResult = { success: true } | { success: false; error: string };

export async function shareProjectCommand(
  params: ShareProjectParams,
): Promise<OperationResult> {
  const {
    projectId,
    organizationId,
    granteeType,
    granteeId,
    permission,
    grantedBy,
  } = params;

  const project = await db.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, title: true, ownerId: true },
  });
  if (!project) {
    return { success: false, error: 'Project not found' };
  }

  if (granteeType === 'user') {
    if (granteeId === project.ownerId) {
      return { success: false, error: 'Owner already has full access' };
    }
    const member = await db.member.findFirst({
      where: { userId: granteeId, organizationId },
    });
    if (!member) {
      return {
        success: false,
        error: 'User is not a member of this organization',
      };
    }
  } else {
    const team = await db.team.findFirst({
      where: { id: granteeId, organizationId },
    });
    if (!team) {
      return { success: false, error: 'Team not found in this organization' };
    }
  }

  await db.projectPermission.upsert({
    where: {
      projectId_granteeType_granteeId: {
        projectId,
        granteeType,
        granteeId,
      },
    },
    create: {
      projectId,
      granteeType,
      granteeId,
      permission,
      grantedBy,
    },
    update: { permission },
  });

  if (granteeType === 'user') {
    sendNotificationToUser(granteeId, organizationId, 'PROJECT_SHARED', {
      title: 'Udostępniono Ci projekt',
      body: project.title,
      resourceUrl: `/projects/${projectId}`,
    }).catch((err) =>
      logger.error(
        { err, granteeId, organizationId, projectId },
        'sendNotificationToUser (project share) failed',
      ),
    );
  }

  return { success: true };
}
