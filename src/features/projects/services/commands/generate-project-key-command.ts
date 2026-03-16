'use server';

import crypto from 'crypto';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const generateProjectKeyCommand = async (publicId: string) => {
  try {
    const orgId = await getOrgIdOrThrow();

    const existing = await db.project.findFirst({
      where: { publicId: publicId, organizationId: orgId },
    });

    if (!existing) {
      throw new Error('Project not found or unauthorized');
    }

    logger.info('Generating access token for project');

    const project = await db.project.update({
      where: { id: existing.id },
      data: {
        accessToken: crypto.randomUUID(),
        isPublic: true,
        publishedAt: new Date(),
      },
      select: {
        accessToken: true,
      },
    });

    return {
      accessToken: project.accessToken,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error generating access token:');
    throw new Error('Failed to generate access token');
  }
};
