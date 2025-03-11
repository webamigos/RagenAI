'use server';

import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';
import { convertAndStoreDocument } from '@/app/api/threads/services/saveDataInVectorTable';
import { logger } from '@/app/lib/utils/logger';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { fetchOrganizationDefaultProjectId } from '@/app/lib/services/project';
import { saveOrganizationPublicMetadata } from '@/app/actions';
import { usageTracker } from '@/app/lib/services/usage';
import { WebsiteLoaderMode } from '@/app/contracts/DocumentLoading';

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
  const { orgId } = auth();

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

    const { message, success } = await convertAndStoreDocument({
      fileContent: fullFileName,
      fileName: fullFileName,
      organizationId: orgId,
      fileId: uniqueFileId,
      projectId: defaultProjectId,
      mimeType: 'text/url',
    });

    if (!success) {
      logger.error({ err: message }, `Error processing URL: ${url}`);
      return {
        success: false,
        message,
      };
    }

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
