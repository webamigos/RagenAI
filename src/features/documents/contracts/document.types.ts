import {
  UserDocument,
  UserFile,
  Project,
  FileType,
} from '@/generated/prisma/browser';

export type ProjectType = {
  id: Project['id'];
  title: Project['title'];
};

export type UserFileType = {
  public_id: UserFile['public_id'];
  organization_id: UserFile['organization_id'];
  file_name: UserFile['file_name'];
  file_size: UserFile['file_size'];
  created_at?: UserFile['created_at'];
  updated_at?: UserFile['updated_at'];
  metadata?: UserFile['metadata'];
  file_type: UserFile['file_type'];
  project_id: UserFile['project_id'];
  project: ProjectType | null;
  document?: {
    public_id: UserDocument['public_id'];
  } | null;
};

export interface ThreadDocumentUI {
  name: string;
  content: string;
  size: number;
  type: string;
  userFileId?: string;
}

export enum WebsiteLoaderMode {
  CRAWL = 'crawl',
  SCRAPE = 'scrape',
}

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

export type ParsedFile = {
  content: string | Buffer;
  fileName: string;
  fileType: FileType;
  fileExtension?: string;
};

export type CreateMarkdownDocumentInput = {
  public_id: string;
  title: string;
  content: string;
  organization_id: string;
  file_id?: string;
  project_id?: number;
};
