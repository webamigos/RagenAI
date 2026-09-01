import { notFound } from 'next/navigation';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import db from '@ragenai/prisma-client';
import { Link } from '@/i18n/routing';
import { DocumentDetailTabs } from '@/app/components/ManageKnowledge/DocumentDetail/DocumentDetailTabs';
import { ArrowLeftCircleIcon } from '@heroicons/react/24/outline';

type Props = {
  params: Promise<{ id: string; locale: string }>;
};

export default async function DocumentDetailPage({ params }: Props) {
  const { id } = await params;

  let orgId: string;
  try {
    orgId = await getOrgIdFromAuthOrThrow();
  } catch {
    notFound();
  }

  const doc = await db.userDocument.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      title: true,
      content: true,
      file: { select: { fileType: true } },
    },
  });

  if (!doc) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-zinc-200 px-4 dark:border-zinc-700">
        <Link
          href="/knowledge/documents-list"
          as={'/knowledge/documents-list' as never}
        >
          <ArrowLeftCircleIcon className="h-7 w-7 cursor-pointer mr-2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 stroke-1" />
        </Link>
        <h1 className="truncate text-xl font-bold text-zinc-900 dark:text-white">
          {doc.title}
        </h1>
      </div>
      <DocumentDetailTabs doc={doc} />
    </div>
  );
}
