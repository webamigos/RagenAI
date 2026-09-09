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
      <div className="flex h-16 items-center border-b border-border px-4">
        <Link
          href="/knowledge/documents-list"
          as={'/knowledge/documents-list' as never}
        >
          <ArrowLeftCircleIcon className="h-7 w-7 cursor-pointer mr-2 text-muted-foreground hover:text-muted-foreground/90 stroke-1" />
        </Link>
        <h1 className="truncate text-xl font-bold text-foreground dark:text-white">
          {doc.title}
        </h1>
      </div>
      <DocumentDetailTabs doc={doc} />
    </div>
  );
}
