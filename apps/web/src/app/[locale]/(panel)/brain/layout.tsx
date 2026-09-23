import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';

import { BrainTabs } from './components/BrainTabs';

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
  if (!(await getBrainAccessQuery())) {
    notFound();
  }
  const t = await getTranslations('brain');

  return (
    <div className="w-full max-w-[1120px] px-6 py-6">
      <h1 className="text-lg font-semibold text-foreground">{t('title')}</h1>
      <BrainTabs />
      {children}
    </div>
  );
}
