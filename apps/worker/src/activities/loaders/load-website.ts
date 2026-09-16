import { JobFailure } from '@ragenai/jobs';

import { WebsiteLoaderMode } from '../../types/WebsiteLoaderMode.js';
import { WebsiteDocumentLoader } from '../../services/document-loaders/website-loader.js';
import { type UserFile } from '../../types/UserFile.js';
import { logger } from '../../services/logger.js';

export type WebsiteDocumentLoaderParams = {
  url: string;
  mode: WebsiteLoaderMode;
  orgId: UserFile['organizationId'];
  projectId: UserFile['projectId'];
};
export const loadWebsite = async ({
  url,
  mode,
  orgId,
  projectId,
}: WebsiteDocumentLoaderParams) => {
  if (mode !== WebsiteLoaderMode.CRAWL && mode !== WebsiteLoaderMode.SCRAPE) {
    // The seam's failure, not Temporal's: this activity runs on both engines,
    // and `temporal-runtime.ts` translates it at the boundary for the one that
    // needs `ApplicationFailure`. Importing that class here is what kept
    // `@temporalio/workflow` in an image that never runs Temporal.
    throw JobFailure.nonRetryable('Invalid crawl mode');
  }
  const loader = new WebsiteDocumentLoader({
    url,
    mode,
    orgId,
    projectId,
  });

  try {
    return await loader.load();
  } catch (error) {
    logger.error({ err: error, url, mode }, 'Failed to load website');
    throw error;
  }
};
