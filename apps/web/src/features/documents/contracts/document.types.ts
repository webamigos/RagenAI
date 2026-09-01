import type {
  UserDocument,
  UserFile,
  Project,
  FileType,
  EmbeddingStatus,
  ParsingStatus,
  PiiPolicy,
} from '@/generated/prisma/browser';

export type { PiiPolicy };

export type ProjectType = {
  id: Project['id'];
  title: Project['title'];
};

export type UserFileType = {
  id: UserFile['id'];
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
    id: UserDocument['id'];
  } | null;
  piiPolicy?: PiiPolicy | null;
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
  imageData?: string; // base64 data URL for image attachments
  documentData?: string; // base64 data URL for binary documents (PDF, EPUB)
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
  parentId: string | null;
  path: string;
  ownerId: string | null;
  ownerName: string | null;
  fileCount: number;
  piiPolicy?: PiiPolicy | null;
  children?: DocumentFolderItem[];
};

export type CreateMarkdownDocumentInput = {
  id: string;
  title: string;
  content: string;
  organizationId: string;
  fileId?: string;
  projectId?: string;
};

export type UserFilesSort = 'fileName' | 'createdAt' | 'fileSize' | 'fileType';
export type UserFilesSortDir = 'asc' | 'desc';

export type UserFilesFilters = {
  sort: UserFilesSort;
  dir: UserFilesSortDir;
  page: number;
  pageSize: number;
  fileType: import('@/generated/prisma/client').FileType[];
  embeddingStatus: import('@/generated/prisma/client').EmbeddingStatus[];
};

export type PaginatedUserFilesResult = {
  items: UserFileType[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
};
