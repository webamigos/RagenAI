'use server';

import { randomUUID } from 'node:crypto';
import { nanoid } from 'nanoid';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUser,
} from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { getDefaultProjectIdQuery as fetchOrganizationDefaultProjectId } from '@/features/projects/services/queries/get-default-project-query';
import { saveOrganizationPublicMetadata } from '@/app/actions';
import { type WebsiteLoaderMode } from '@/features/documents/contracts/document.types';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import {
  type ScrapeWebsiteWorkflowPayload,
  Workflow,
} from '@/features/documents/contracts/document.types';
import db from '@ragenai/prisma-client';

export type ProcessUrlResult = {
  success: boolean;
  message: string;
  fileId?: string;
  fileName?: string;
};

export async function processUrl(
  url: string,
  mode: WebsiteLoaderMode,
): Promise<ProcessUrlResult> {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    return {
      success: false,
      message: 'Invalid organization',
    };
  }

  try {
    const uniqueFileId = randomUUID();
    const [defaultProjectId, user, org] = await Promise.all([
      fetchOrganizationDefaultProjectId(orgId),
      getCurrentUser(),
      db.organization.findUnique({
        where: { id: orgId },
        select: { slug: true },
      }),
    ]);

    if (!defaultProjectId) {
      return {
        success: false,
        message: 'No default project found',
      };
    }

    const fullFileName = `${url}-${mode}`;

    const websiteWorkflowId = `web-${nanoid()}`;
    const client = getTemporalClient();

    const websiteWorkflowPayload: ScrapeWebsiteWorkflowPayload = {
      url,
      mode,
      orgId,
      projectId: defaultProjectId,
      orgSlug: org?.slug ?? undefined,
      userEmail: user?.email ?? undefined,
    };

    const embeddingsHandle = await client.workflow.start(
      Workflow.SCRAPE_WEBSITE,
      {
        taskQueue: TASK_QUEUE_NAME,
        workflowId: websiteWorkflowId,
        args: [websiteWorkflowPayload],
      },
    );

    logger.info('embeddingsHandle: %j', embeddingsHandle, 2);

    // ==== LEGACY CODE BELOW
    // const fullFileName = `${url}-${mode}`;

    // const { message, success } = await convertAndStoreDocument({
    //   fileContent: fullFileName,
    //   fileName: fullFileName,
    //   organizationId: orgId,
    //   fileId: uniqueFileId,
    //   projectId: defaultProjectId,
    //   mimeType: 'text/url',
    // });

    // if (!success) {
    //   logger.error({ err: message }, `Error processing URL: ${url}`);
    //   return {
    //     success: false,
    //     message,
    //   };
    // }

    await saveOrganizationPublicMetadata(orgId, { hasKnowledge: true });

    return {
      success: true,
      message: 'URL processed successfully',
      fileId: uniqueFileId,
      fileName: fullFileName,
    };
  } catch (error) {
    logger.error({ err: error }, 'Error processing URL');
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Internal Server Error',
    };
  }
}
