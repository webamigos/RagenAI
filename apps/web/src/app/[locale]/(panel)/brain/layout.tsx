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
    access.canWrite
      ? getExtractableDocumentsQuery(access.orgId)
      : Promise.resolve([]),
  ]);

  return (
    <div className="w-full max-w-[1120px] px-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
        {access.canWrite && <ExtractDialog documents={documents} />}
      </div>
      {/*
        Read-only mode says so once, at the top, rather than leaving a reader
        to wonder where the buttons went. Every page below hides its controls
        on `canWrite`, and every action refuses on its own check.
      */}
      {!access.canWrite && (
        <p
          role="status"
          data-testid="brain-read-only"
          className="mt-3 rounded-[6px] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
        >
          {t('read-only.notice')}
        </p>
      )}
      <BrainTabs />
      {children}
    </div>
  );
}
