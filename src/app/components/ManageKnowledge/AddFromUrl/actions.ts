'use server';

import { v4 as uuidv4 } from 'uuid';
import { nanoid } from 'nanoid';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { fetchOrganizationDefaultProjectId } from '@/app/lib/services/project';
import { saveOrganizationPublicMetadata } from '@/app/actions';
import { usageTracker } from '@/app/lib/services/usage';
import { WebsiteLoaderMode } from '@/app/contracts/DocumentLoading';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import {
  ScrapeWebsiteWorkflowPayload,
  Workflow,
} from '@/app/contracts/Workflows';

export type ProcessUrlResult = {
  success: boolean;
  message: string;
  fileId?: string;
  fileName?: string;
};

export async function processUrl(
  url: string,
  mode: WebsiteLoaderMode
): Promise<ProcessUrlResult> {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    return {
      success: false,
      message: 'Invalid organization',
    };
  }

  try {
    setSentryServiceTag('website-parsing');
    setSentryClerkOrganizationTag(orgId);

    const uniqueFileId = uuidv4();
    const defaultProjectId = await fetchOrganizationDefaultProjectId(orgId);

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
    };

    const embeddingsHandle = await client.workflow.start(
      Workflow.SCRAPE_WEBSITE,
      {
        taskQueue: TASK_QUEUE_NAME,
        workflowId: websiteWorkflowId,
        args: [websiteWorkflowPayload],
      }
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

    usageTracker.incUploadedFilesCount();
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
