import { notFound } from 'next/navigation';
import { getDocumentVersionDetailQuery } from '@/features/documents/services/queries/get-document-versions-query';
import { DiffView } from '@/app/components/ManageKnowledge/DocumentDetail/DiffView';
import { Link } from '@/i18n/routing';

type Props = {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ v1?: string; v2?: string }>;
};

export default async function DiffPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { v1, v2 } = await searchParams;
  if (!v1 || !v2) {
    notFound();
  }

  try {
    const [versionA, versionB] = await Promise.all([
      getDocumentVersionDetailQuery(id, v1),
      getDocumentVersionDetailQuery(id, v2),
    ]);

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <Link
            href={`/knowledge/documents/${id}` as never}
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400"
          >
            ← Powrót do dokumentu
          </Link>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            Porównanie: v{versionA.versionNumber} → v{versionB.versionNumber}
          </h1>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <DiffView
            oldValue={versionA.content}
            newValue={versionB.content}
            oldTitle={`v${versionA.versionNumber} — ${new Date(versionA.createdAt).toLocaleString('pl-PL')}`}
            newTitle={`v${versionB.versionNumber} — ${new Date(versionB.createdAt).toLocaleString('pl-PL')}`}
          />
        </div>
      </div>
    );
  } catch {
    notFound();
  }
}
