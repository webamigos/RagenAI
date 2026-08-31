import { WebsiteLoaderMode } from '../../types/WebsiteLoaderMode';
import { ApplicationFailure } from '@temporalio/workflow';
import { WebsiteDocumentLoader } from '../../services/document-loaders/website-loader';
import { UserFile } from '../../types/UserFile';
import { logger } from '../../services/logger';

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
    throw new ApplicationFailure('Invalid crawl mode');
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
