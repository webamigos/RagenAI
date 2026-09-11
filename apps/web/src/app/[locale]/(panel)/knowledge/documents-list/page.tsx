import { getTranslations } from 'next-intl/server';
import { getUserFilesQuery } from '@/features/documents/services/queries/get-user-files-query';
import { getFileScopeCountsQuery } from '@/features/documents/services/queries/get-file-scope-counts-query';
import type { FileViewMode } from '@/features/documents/services/queries/get-user-files-query';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { getUserTeamIds, getActiveMember } from '@/lib/auth-guards';
import { orgVisibilityScope } from '@/lib/auth-access-control';
import {
  FileType,
  EmbeddingStatus,
  PiiPolicy,
} from '@/generated/prisma/client';
import type {
  UserFilesSort,
  UserFilesSortDir,
} from '@/features/documents/contracts/document.types';
import { DocumentsListContent } from './DocumentsListContent';

const VALID_SORTS: UserFilesSort[] = [
  'fileName',
  'createdAt',
  'fileSize',
  'fileType',
];
const VALID_DIRS: UserFilesSortDir[] = ['asc', 'desc'];
const VALID_VIEW_MODES: FileViewMode[] = ['all', 'my-files', 'shared-with-me'];
const VALID_FILE_TYPES = new Set(Object.values(FileType));
const VALID_STATUSES = new Set(Object.values(EmbeddingStatus));
const VALID_POLICIES = new Set(Object.values(PiiPolicy));

function parseFileTypes(raw: string | undefined): FileType[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is FileType => VALID_FILE_TYPES.has(s as FileType));
}

function parseStatuses(raw: string | undefined): EmbeddingStatus[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is EmbeddingStatus =>
      VALID_STATUSES.has(s as EmbeddingStatus),
    );
}

function parsePolicies(raw: string | undefined): PiiPolicy[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is PiiPolicy => VALID_POLICIES.has(s as PiiPolicy));
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('manage-knowledge:document-list.title') };
}

function scalar(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

function multiValue(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val.join(',') : val;
}

const UploadedListPage = async ({ searchParams }: Props) => {
  const sp = await searchParams;

  const rawSort = scalar(sp.sort);
  const sort: UserFilesSort = VALID_SORTS.includes(rawSort as UserFilesSort)
    ? (rawSort as UserFilesSort)
    : 'createdAt';

  const rawDir = scalar(sp.dir);
  const dir: UserFilesSortDir = VALID_DIRS.includes(rawDir as UserFilesSortDir)
    ? (rawDir as UserFilesSortDir)
    : 'desc';

  const page = Math.max(1, Number(scalar(sp.page)) || 1);
  const selectedFileTypes = parseFileTypes(multiValue(sp.fileType));
  const selectedStatuses = parseStatuses(multiValue(sp.embeddingStatus));
  const selectedPolicies = parsePolicies(multiValue(sp.piiPolicy));
  const folderId = scalar(sp.folderId) ?? null;
  const rawViewMode = scalar(sp.viewMode);
  const viewMode: FileViewMode = VALID_VIEW_MODES.includes(
    rawViewMode as FileViewMode,
  )
    ? (rawViewMode as FileViewMode)
    : 'all';

  const orgId = await getOrgIdFromAuthOrThrow();
  const user = await getCurrentUser();
  const userId = user?.id;

  const [teamIds, member] = await Promise.all([
    userId ? getUserTeamIds(orgId, userId) : Promise.resolve([]),
    userId ? getActiveMember(orgId) : Promise.resolve(null),
  ]);

  const scope = orgVisibilityScope(member?.role);

  // The counts are fetched here rather than in the rail because they answer
  // the same access question the list does, and a client fetch would make the
  // rail's number and the table's number two independent reads of one
  // predicate.
  const [result, scopeCounts] = await Promise.all([
    getUserFilesQuery(orgId, teamIds, {
      userId: userId ?? undefined,
      scope,
      folderId,
      viewMode,
      sort,
      dir,
      page,
      pageSize: 25,
      fileType: selectedFileTypes,
      embeddingStatus: selectedStatuses,
      piiPolicy: selectedPolicies,
    }),
    getFileScopeCountsQuery(orgId, teamIds, {
      userId: userId ?? undefined,
      scope,
    }),
  ]);

  return (
    <DocumentsListContent
      result={result}
      scopeCounts={scopeCounts}
      sort={sort}
      dir={dir}
      selectedFileTypes={selectedFileTypes}
      selectedStatuses={selectedStatuses}
      selectedPolicies={selectedPolicies}
      folderId={folderId}
      viewMode={viewMode}
    />
  );
};

export default UploadedListPage;
