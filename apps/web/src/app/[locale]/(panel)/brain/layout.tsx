import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import { getExtractableDocumentsQuery } from '@/features/brain/services/queries/get-extractable-documents-query';

import { BrainTabs } from './components/BrainTabs';
import { ExtractDialog } from './components/ExtractDialog';

export const dynamic = 'force-dynamic';

/**
 * Ragen Brain's panel (spec D1). Owners and admins of an organization with
 * the `brain` flag on; anyone else gets a 404, so a member cannot tell a
 * disabled feature from a missing one. Each page asks again — a layout does
 * not guard the route segments beneath it on its own.
 */
export default async function BrainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getBrainAccessQuery();
  if (!access) {
    notFound();
  }
  const [t, documents] = await Promise.all([
    getTranslations('brain'),
    getExtractableDocumentsQuery(access.orgId),
  ]);

  return (
    <div className="w-full max-w-[1120px] px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
        <ExtractDialog documents={documents} />
      </div>
      <BrainTabs />
      {children}
    </div>
  );
}
