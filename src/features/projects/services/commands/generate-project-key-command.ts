'use server';

import crypto from 'crypto';
import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '@/app/lib/utils/auth-helpers';

export const generateProjectKeyCommand = async (publicId: string) => {
  try {
    const orgId = await getOrgIdOrThrow();

    const existing = await db.project.findFirst({
      where: { public_id: publicId, organization_id: orgId },
    });

    if (!existing) {
      throw new Error('Project not found or unauthorized');
    }

    logger.info('Generating access token for project');

    const project = await db.project.update({
      where: { id: existing.id },
      data: {
        access_token: crypto.randomUUID(),
        is_public: true,
        published_at: new Date(),
      },
      select: {
        access_token: true,
      },
    });

    return {
      accessToken: project.access_token,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error generating access token:');
    throw new Error('Failed to generate access token');
  }
};
