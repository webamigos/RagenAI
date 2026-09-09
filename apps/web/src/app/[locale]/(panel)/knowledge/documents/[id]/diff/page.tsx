import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getDocumentVersionDetailQuery } from '@/features/documents/services/queries/get-document-versions-query';
import { getDocumentActor } from '@/features/documents/services/queries/get-document-actor';
import { DiffView } from '@/app/components/ManageKnowledge/DocumentDetail/DiffView';
import { Link } from '@/i18n/routing';

type Props = {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ v1?: string; v2?: string }>;
};

export default async function DiffPage({ params, searchParams }: Props) {
  const { id, locale } = await params;
  const { v1, v2 } = await searchParams;

  if (!v1 || !v2) {
    notFound();
  }

  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    notFound();
  }

  const t = await getTranslations('document-versions');

  let versionA: Awaited<ReturnType<typeof getDocumentVersionDetailQuery>>;
  let versionB: typeof versionA;
  const actor = await getDocumentActor(orgId);
  try {
    [versionA, versionB] = await Promise.all([
      getDocumentVersionDetailQuery(id, v1, orgId, actor),
      getDocumentVersionDetailQuery(id, v2, orgId, actor),
    ]);
  } catch {
    // Only a missing document or version means "not found". Anything thrown
    // while rendering below belongs to the error boundary.
    notFound();
  }

  const formatStamp = (value: Date | string, versionNumber: number) =>
    `v${versionNumber} — ${new Date(value).toLocaleString(locale)}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-1 border-b border-border px-6 py-5">
        <Link
          href={`/knowledge/documents/${id}` as never}
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-muted-foreground/90"
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          {t('diff-back')}
        </Link>
        <h1 className="text-lg font-semibold text-foreground dark:text-white">
          {t('diff-title')}:{' '}
          <span className="text-muted-foreground">
            v{versionA.versionNumber}
          </span>
          <span className="mx-2 text-muted-foreground">→</span>
          <span className="text-muted-foreground">
            v{versionB.versionNumber}
          </span>
        </h1>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <DiffView
          oldValue={versionA.content}
          newValue={versionB.content}
          oldTitle={formatStamp(versionA.createdAt, versionA.versionNumber)}
          newTitle={formatStamp(versionB.createdAt, versionB.versionNumber)}
        />
      </div>
    </div>
  );
}
