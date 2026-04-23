import { getTranslations } from 'next-intl/server';
import { getUserFilesQuery } from '@/features/documents/services/queries/get-user-files-query';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getCurrentUser } from '@/app/lib/utils/auth-helpers';
import { getUserTeamIds, getActiveMember } from '@/lib/auth-guards';
import { isOrgAdmin } from '@/lib/auth-access-control';
import { FileType, EmbeddingStatus } from '@/generated/prisma/client';
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
const VALID_FILE_TYPES = new Set(Object.values(FileType));
const VALID_STATUSES = new Set(Object.values(EmbeddingStatus));

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

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('manage-knowledge:document-list.title') };
}

const UploadedListPage = async ({ searchParams }: Props) => {
  const sp = await searchParams;

  const sort: UserFilesSort = VALID_SORTS.includes(sp.sort as UserFilesSort)
    ? (sp.sort as UserFilesSort)
    : 'createdAt';

  const dir: UserFilesSortDir = VALID_DIRS.includes(sp.dir as UserFilesSortDir)
    ? (sp.dir as UserFilesSortDir)
    : 'desc';

  const page = Math.max(1, Number(sp.page) || 1);
  const selectedFileTypes = parseFileTypes(sp.fileType);
  const selectedStatuses = parseStatuses(sp.embeddingStatus);
  const folderId = sp.folderId ?? null;

  const orgId = await getOrgIdFromAuthOrThrow();
  const user = await getCurrentUser();
  const userId = user?.id;

  const [teamIds, member] = await Promise.all([
    userId ? getUserTeamIds(orgId, userId) : Promise.resolve([]),
    userId ? getActiveMember(orgId) : Promise.resolve(null),
  ]);

  const result = await getUserFilesQuery(orgId, teamIds, {
    userId: userId ?? undefined,
    isOrgAdmin: member ? isOrgAdmin(member.role) : false,
    folderId,
    sort,
    dir,
    page,
    pageSize: 25,
    fileType: selectedFileTypes,
    embeddingStatus: selectedStatuses,
  });

  return (
    <DocumentsListContent
      result={result}
      sort={sort}
      dir={dir}
      selectedFileTypes={selectedFileTypes}
      selectedStatuses={selectedStatuses}
    />
  );
};

export default UploadedListPage;
