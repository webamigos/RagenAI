import {
  type UserDocument,
  type UserFile,
  type Project,
  type FileType,
  type EmbeddingStatus,
  type ParsingStatus,
} from '@/generated/prisma/client';

export type ProjectType = {
  id: Project['id'];
  title: Project['title'];
};

export type UserFileType = {
  publicId: UserFile['publicId'];
  organizationId: UserFile['organizationId'];
  fileName: UserFile['fileName'];
  fileSize: UserFile['fileSize'];
  createdAt?: UserFile['createdAt'];
  updatedAt?: UserFile['updatedAt'];
  metadata?: UserFile['metadata'];
  fileType: UserFile['fileType'];
  projectId: UserFile['projectId'];
  thumbnailS3Key?: string | null;
  embeddingStatus?: EmbeddingStatus;
  embeddingStartedAt?: UserFile['embeddingStartedAt'];
  embeddingCompletedAt?: UserFile['embeddingCompletedAt'];
  embeddingFailedAt?: UserFile['embeddingFailedAt'];
  parsingStatus?: ParsingStatus;
  project: ProjectType | null;
  document?: {
    publicId: UserDocument['publicId'];
  } | null;
};

export interface ThreadDocumentUI {
  name: string;
  content: string;
  size: number;
  type: string;
  userFileId?: string;
  sourceUrl?: string;
  driveFileId?: string;
  driveModifiedTime?: string;
}

export enum WebsiteLoaderMode {
  CRAWL = 'crawl',
  SCRAPE = 'scrape',
}

// Temporal workflow names
export enum Workflow {
  RUN_FILE_EMBEDDINGS = 'runFileEmbeddings',
  SCRAPE_WEBSITE = 'scrapeWebsite',
  GENERATE_DOCUMENT = 'generateDocument',
}

export interface ScrapeWebsiteWorkflowPayload {
  url: string;
  mode: WebsiteLoaderMode;
  orgId: UserFile['organizationId'];
  projectId: UserFile['projectId'];
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
  publicId: string;
  title: string;
  content: string;
  organizationId: string;
  fileId?: string;
  projectId?: number;
};
