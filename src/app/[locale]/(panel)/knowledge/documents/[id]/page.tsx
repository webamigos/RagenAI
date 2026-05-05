import { notFound } from 'next/navigation';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import db from '@ragenai/prisma-client';
import { DocumentDetailTabs } from '@/app/components/ManageKnowledge/DocumentDetail/DocumentDetailTabs';

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
      file: {
        select: {
          id: true,
          fileType: true,
          metadata: true,
          embeddingStatus: true,
        },
      },
    },
  });

  if (!doc) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          {doc.title}
        </h1>
      </div>
      <DocumentDetailTabs doc={doc} orgId={orgId} />
    </div>
  );
}
