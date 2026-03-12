import {
  type UserDocument,
  type UserFile,
  type Project,
  type FileType,
  type EmbeddingStatus,
  type ParsingStatus,
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
  thumbnail_s3_key?: string | null;
  embedding_status?: EmbeddingStatus;
  embedding_started_at?: UserFile['embedding_started_at'];
  embedding_completed_at?: UserFile['embedding_completed_at'];
  embedding_failed_at?: UserFile['embedding_failed_at'];
  parsing_status?: ParsingStatus;
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
  sourceUrl?: string;
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
  orgSlug?: string;
  userEmail?: string;
  userId?: string;
}

export type ParsedFile = {
  content: string | Buffer;
  fileName: string;
  fileType: FileType;
  fileExtension?: string;
};

export type DocumentFolderItem = {
  id: string;
  name: string;
  teamId: string | null;
  teamName: string | null;
  fileCount: number;
};

export type CreateMarkdownDocumentInput = {
  public_id: string;
  title: string;
  content: string;
  organization_id: string;
  file_id?: string;
  project_id?: number;
};
