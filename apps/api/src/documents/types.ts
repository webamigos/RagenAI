import type {
  UserFile,
  UserDocument,
  Project,
  PiiPolicy,
} from '../generated/prisma/client.js';
import type { NegativeQaItem, NegativeQaResult } from '../messages/types.js';

export type { PiiPolicy };

/**
 * Ported from apps/web's src/features/documents/contracts/document.types.ts,
 * knowledge-analytics.types.ts and permission.types.ts — only the subset
 * needed by the metadata/permissions/analytics slice (not upload/storage).
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Not ported from document.types.ts: `ThreadDocumentUI` (already ported as
 * chains/types/thread-document.ts from Phase B), `WebsiteLoaderMode`,
 * `Workflow`, `ScrapeWebsiteWorkflowPayload` (Temporal-only, out of scope),
 * `ParsedFile` (only used by the not-yet-ported file-parser.ts).
 *
 * `NegativeQaItem`/`NegativeQaResult` are re-exported from
 * `../messages/types.ts`, not re-duplicated here — the `messages` slice
 * already ported them for `getNegativeQa`.
 */

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
  embeddingStatus?: UserFile['embeddingStatus'];
  embeddingStartedAt?: UserFile['embeddingStartedAt'];
  embeddingCompletedAt?: UserFile['embeddingCompletedAt'];
  embeddingFailedAt?: UserFile['embeddingFailedAt'];
  parsingStatus?: UserFile['parsingStatus'];
  project: ProjectType | null;
  document?: {
    id: UserDocument['id'];
  } | null;
  piiPolicy?: PiiPolicy | null;
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
  // Not read by FilesService.createDocument() — the DB generates it
  // (UserDocument.id has @default(uuid())). Kept optional rather than
  // required so callers don't need to fabricate one.
  id?: string;
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
  fileType: UserFile['fileType'][];
  embeddingStatus: NonNullable<UserFile['embeddingStatus']>[];
};

export type PaginatedUserFilesResult = {
  items: UserFileType[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

export type PermissionLevel = 'view' | 'full';
export type ResourceType = 'file' | 'folder';
export type GranteeType = 'user' | 'team';

export type DocumentPermissionItem = {
  id: string;
  resourceType: ResourceType;
  granteeType: GranteeType;
  granteeId: string;
  granteeName: string;
  granteeEmail?: string;
  permission: PermissionLevel;
};

export type ShareFileInput = {
  fileId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
};

export type ShareFolderInput = {
  folderId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: PermissionLevel;
};

export type EffectivePermission = {
  canView: boolean;
  canManage: boolean;
  source:
    'owner' | 'orgAdmin' | 'team' | 'directShare' | 'folderShare' | 'orgWide';
};

export type KnowledgeAnalyticsSummary = {
  totalQuestions: number;
  uniqueUsers: number;
  positiveRatePct: number;
};

export type TopCitedDocument = {
  fileId: string;
  publicId: string;
  fileName: string;
  citationCount: number;
};

export type UnusedDocument = {
  fileId: string;
  publicId: string;
  fileName: string;
  lastCitedAt: string | null;
  daysSinceUsed: number;
};

export type DailyQuestion = {
  date: string;
  count: number;
};

export type { NegativeQaItem, NegativeQaResult };

export type KnowledgeAnalyticsDashboardData = {
  summary: KnowledgeAnalyticsSummary;
  dailyQuestions: DailyQuestion[];
  topCited: TopCitedDocument[];
  unusedDocs: UnusedDocument[];
  negativeQa: NegativeQaResult;
};
