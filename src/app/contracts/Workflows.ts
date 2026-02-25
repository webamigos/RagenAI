import { UserFile } from '@/generated/prisma/browser';
import { WebsiteLoaderMode } from './DocumentLoading';

// Temporal workflow names
export enum Workflow {
  RUN_FILE_EMBEDDINGS = 'runFileEmbeddings',
  SCRAPE_WEBSITE = 'scrapeWebsite',
}

export interface ScrapeWebsiteWorkflowPayload {
  url: string;
  mode: WebsiteLoaderMode;
  orgId: UserFile['organization_id'];
  projectId: UserFile['project_id'];
}
