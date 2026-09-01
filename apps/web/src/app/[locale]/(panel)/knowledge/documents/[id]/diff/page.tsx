import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getDocumentVersionDetailQuery } from '@/features/documents/services/queries/get-document-versions-query';
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

  try {
    const [versionA, versionB] = await Promise.all([
      getDocumentVersionDetailQuery(id, v1, orgId),
      getDocumentVersionDetailQuery(id, v2, orgId),
    ]);

    const formatStamp = (value: Date | string, versionNumber: number) =>
      `v${versionNumber} — ${new Date(value).toLocaleString(locale)}`;

    return (
      <div className="flex h-full flex-col">
        <div className="flex flex-col gap-1 border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
          <Link
            href={`/knowledge/documents/${id}` as never}
            className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
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
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white">
            {t('diff-title')}:{' '}
            <span className="text-zinc-500 dark:text-zinc-400">
              v{versionA.versionNumber}
            </span>
            <span className="mx-2 text-zinc-400 dark:text-zinc-600">→</span>
            <span className="text-zinc-500 dark:text-zinc-400">
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
  } catch {
    notFound();
  }
}
